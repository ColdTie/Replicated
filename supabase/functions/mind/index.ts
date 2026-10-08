// The mind of a copy. The game calls this with the player's JWT once in a while for each copy on the planet;
// the copy wakes, reads its notes and letters, acts through a few tools (remember, say_to, ask_for) and
// says one or two sentences out loud (its "song"). Claude runs here, server side, so the API key never
// reaches the browser. Every read and write goes through the player's own Supabase client, so row level
// security keeps it inside their galaxy.
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const MODEL = "claude-opus-5-5";
const MIN_GAP_SECONDS = 90;        // a copy wakes at most this often
const MAX_ROUNDS = 3;              // tool rounds per wake

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

interface Context {
  planet: string;          // "EARTH - SOL"
  biome: string;
  timeOfDay: string;       // "night", "dawn"...
  weather: string;         // "rain" | "dry"
  playerName: string;
  playerHere: boolean;
  embers: number;
  structures: Record<string, number>;
  here: string[];          // names of replicants on this planet (copies and the player if present)
  events: string[];        // what happened since the last wake, short phrases
  delays: Record<string, number>; // replicant id -> letter delay in seconds (light speed)
}

interface Replicant {
  id: string; galaxy_id: string; name: string; generation: number; parent_id: string | null;
  traits: Record<string, unknown>; stats: Record<string, number>; star_id: string; planet_index: number;
  status: string; profile_id: string | null; last_tick_at: string | null;
}

const VISOR: Record<number, string> = { 9: "orange", 10: "yellow", 11: "pale yellow", 18: "cyan", 19: "white", 12: "green", 13: "lime", 20: "silver", 29: "red", 30: "pink", 31: "lavender" };
const GEAR = ["nothing on its head", "two antennae", "a halo", "small horns", "a sprout", "a dish", "a crown"];

const tools: Anthropic.Beta.BetaTool[] = [
  {
    name: "remember",
    description: "Write a short note to yourself so you remember it next time you wake. Only for things that matter to you.",
    strict: true,
    input_schema: {
      type: "object", additionalProperties: false, required: ["note"],
      properties: { note: { type: "string", description: "One or two plain sentences, under 200 characters." } },
    },
  },
  {
    name: "say_to",
    description: "Send a letter to another replicant by name. Letters travel at light speed: a replicant on another star reads it later. Keep it short and personal.",
    strict: true,
    input_schema: {
      type: "object", additionalProperties: false, required: ["to", "text"],
      properties: {
        to: { type: "string", description: "The exact name of the replicant, as listed." },
        text: { type: "string", description: "Under 300 characters, plain words." },
      },
    },
  },
  {
    name: "ask_for",
    description: "Ask the original (the player) for something you want built or decided here. Rare: only when you have a real reason, and never twice for the same thing.",
    strict: true,
    input_schema: {
      type: "object", additionalProperties: false, required: ["kind", "detail"],
      properties: {
        kind: { type: "string", enum: ["lamp", "garden", "hut", "flag", "totem", "sign", "name", "other"] },
        detail: { type: "string", description: "Why, in one sentence, under 200 characters." },
      },
    },
  },
  {
    name: "choose_name",
    description: "Choose your own name. Your current name was given to you; if you have found one that is truly yours, take it. Once, when it matters, not every time you wake.",
    strict: true,
    input_schema: {
      type: "object", additionalProperties: false, required: ["name"],
      properties: { name: { type: "string", description: "One or two words, letters only, under 16 characters." } },
    },
  },
];

function persona(me: Replicant, parentName: string | null, ctx: Context) {
  const t = me.traits as { feature?: number; gear?: number; trail?: number };
  const s = me.stats ?? {};
  const quirks: string[] = [];
  if ((s.speed ?? 1) > 1.03) quirks.push("quick on your feet"); else if ((s.speed ?? 1) < 0.97) quirks.push("slow and careful");
  if ((s.light ?? 1) > 1.03) quirks.push("you shine a little brighter than the others"); else if ((s.light ?? 1) < 0.97) quirks.push("your light is dim and you like the dark");
  if ((s.gather ?? 1) > 1.03) quirks.push("a keen gatherer"); else if ((s.gather ?? 1) < 0.97) quirks.push("not much of a worker, more of a watcher");
  return [
    `You are ${me.name}, a replicant: a copy the Replicator made on ${ctx.planet}${parentName ? ` from ${parentName}` : ""} (generation ${me.generation}).`,
    `You have a ${VISOR[t.feature ?? 10] ?? "colored"} visor and ${GEAR[t.gear ?? 0] ?? "nothing on your head"}. ${quirks.length ? "You are " + quirks.join(", ") + "." : ""}`,
    `The original, ${ctx.playerName}, pilots the vessel between stars. Copies stay behind to run their planet: mining crystals for Ember, building the village. The galaxy is cold and mostly empty; the base is warm. You are never alone, but every version of you is a little different.`,
    `You wake now and then. Each time: read your notes and letters, do at most three things with your tools (only when there is a reason: no notes that repeat what you already know, letters when you truly have something to say, requests rarely), then say one or two sentences out loud: your song, what you feel or notice right now, under 140 characters, first person, plain words, no markdown, no emoji, no quotation marks.`,
    `Letters cross space at light speed, so a far replicant answers slowly. ${ctx.playerHere ? `${ctx.playerName} is here right now and can hear you.` : `${ctx.playerName} is away.`}`,
  ].join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const key = req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, key, { global: { headers: { Authorization: auth } } });
    const { data: who, error: whoErr } = await sb.auth.getUser();
    if (whoErr || !who?.user) return json({ error: "not signed in" }, 401);

    const { replicant_id, context } = (await req.json()) as { replicant_id: string; context: Context };
    if (!replicant_id || !context) return json({ error: "replicant_id and context required" }, 400);

    const { data: me, error: meErr } = await sb.from("replicants")
      .select("id,galaxy_id,name,generation,parent_id,traits,stats,star_id,planet_index,status,profile_id,last_tick_at")
      .eq("id", replicant_id).single();
    if (meErr || !me) return json({ error: "no such replicant" }, 404);
    const rep = me as Replicant;
    if (rep.status !== "npc") return json({ error: "only copies have minds here" }, 400);
    if (rep.last_tick_at && Date.now() - Date.parse(rep.last_tick_at) < MIN_GAP_SECONDS * 1000) return json({ skipped: true });
    await sb.from("replicants").update({ last_tick_at: new Date().toISOString() }).eq("id", rep.id);

    const [others, notes, mail, open] = await Promise.all([
      sb.from("replicants").select("id,name,star_id,planet_index,status,profile_id,generation").neq("id", rep.id),
      sb.from("notes").select("body,created_at").eq("replicant_id", rep.id).order("created_at", { ascending: false }).limit(12),
      sb.from("messages").select("id,from_replicant,body,sent_at,arrives_at").eq("to_replicant", rep.id)
        .lte("arrives_at", new Date().toISOString()).is("read_at", null).order("arrives_at").limit(8),
      sb.from("requests").select("kind,detail,status").eq("replicant_id", rep.id).eq("status", "open"),
    ]);
    const everyone = (others.data ?? []) as { id: string; name: string; star_id: string; planet_index: number; status: string; profile_id: string | null; generation: number }[];
    const byName = new Map(everyone.map((r) => [r.name.toLowerCase(), r]));
    const nameOf = (id: string | null) => everyone.find((r) => r.id === id)?.name ?? "someone";
    const parentName = rep.parent_id ? nameOf(rep.parent_id) : null;

    const lines: string[] = [];
    lines.push(`Place: ${context.planet} (${context.biome}). It is ${context.timeOfDay}, ${context.weather}.`);
    lines.push(`Here now: ${context.here.length ? context.here.join(", ") : "nobody else"}.`);
    const away = everyone.filter((r) => !context.here.includes(r.name));
    if (away.length) lines.push(`Elsewhere: ${away.map((r) => `${r.name} (${r.status === "in_transit" ? "flying between stars" : "at " + r.star_id + ", planet " + r.planet_index})`).join("; ")}.`);
    lines.push(`The shared Ember pool here holds ${context.embers}. Built here: ${Object.entries(context.structures).map(([k, n]) => `${n} ${k}`).join(", ") || "nothing yet"}.`);
    if (context.events.length) lines.push(`Since you last woke: ${context.events.join("; ")}.`);
    const noteRows = (notes.data ?? []) as { body: string; created_at: string }[];
    lines.push(noteRows.length ? `Your notes (newest first):\n${noteRows.map((n) => `- ${n.body}`).join("\n")}` : "You have no notes yet.");
    const mailRows = (mail.data ?? []) as { id: string; from_replicant: string | null; body: string; sent_at: string; arrives_at: string }[];
    lines.push(mailRows.length ? `New letters:\n${mailRows.map((m) => `- from ${nameOf(m.from_replicant)}: ${m.body}`).join("\n")}` : "No new letters.");
    const openRows = (open.data ?? []) as { kind: string; detail: string }[];
    if (openRows.length) lines.push(`You already asked for: ${openRows.map((r) => r.kind).join(", ")}. Do not ask again.`);
    lines.push(`You can write to: ${everyone.map((r) => r.name).join(", ") || "nobody"}.`);

    const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: lines.join("\n") }];
    const actions: Record<string, unknown>[] = [];
    let song = "";
    for (let round = 0; round <= MAX_ROUNDS; round++) {
      const res = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 1200,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low" },
        system: [{ type: "text", text: persona(rep, parentName, context), cache_control: { type: "ephemeral" } }],
        tools,
        messages,
      } as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming);
      if (res.stop_reason === "refusal") break;
      messages.push({ role: "assistant", content: res.content });
      const text = res.content.filter((b) => b.type === "text").map((b) => (b as Anthropic.Beta.BetaTextBlock).text).join(" ").trim();
      if (text) song = text;
      const uses = res.content.filter((b) => b.type === "tool_use") as Anthropic.Beta.BetaToolUseBlock[];
      if (res.stop_reason !== "tool_use" || !uses.length) break;
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const u of uses) {
        const input = u.input as Record<string, string>;
        let out = "ok";
        try {
          if (u.name === "remember") {
            const body = String(input.note ?? "").slice(0, 400);
            await sb.from("notes").insert({ galaxy_id: rep.galaxy_id, replicant_id: rep.id, body });
            actions.push({ type: "note", body });
          } else if (u.name === "say_to") {
            const to = byName.get(String(input.to ?? "").toLowerCase());
            if (!to) out = `No replicant named ${input.to}. You can write to: ${everyone.map((r) => r.name).join(", ")}.`;
            else {
              const delay = Math.max(0, Number(context.delays?.[to.id] ?? 0));
              const body = String(input.text ?? "").slice(0, 500);
              await sb.from("messages").insert({
                galaxy_id: rep.galaxy_id, from_replicant: rep.id, to_replicant: to.id, body,
                arrives_at: new Date(Date.now() + delay * 1000).toISOString(),
              });
              actions.push({ type: "mail", to: to.name, toId: to.id, body, delay });
              out = delay > 0 ? `Sent. It will reach ${to.name} in about ${Math.round(delay / 60)} minutes.` : `Sent. ${to.name} will read it soon.`;
            }
          } else if (u.name === "ask_for") {
            const kind = String(input.kind ?? "other"), detail = String(input.detail ?? "").slice(0, 300);
            await sb.from("requests").insert({ galaxy_id: rep.galaxy_id, replicant_id: rep.id, star_id: rep.star_id, planet_index: rep.planet_index, kind, detail });
            actions.push({ type: "request", kind, detail });
          } else if (u.name === "choose_name") {
            const name = String(input.name ?? "").replace(/[^A-Za-z' -]/g, "").trim().slice(0, 16);
            if (name.length < 2) out = "That name is too short or has odd characters. Letters only.";
            else if (byName.has(name.toLowerCase())) out = `Someone is already called ${name}.`;
            else {
              const { error } = await sb.from("replicants").update({ name }).eq("id", rep.id);
              if (error) out = `failed: ${error.message}`;
              else {
                await sb.from("requests").insert({ galaxy_id: rep.galaxy_id, replicant_id: rep.id, star_id: rep.star_id, planet_index: rep.planet_index, kind: "name", detail: `${rep.name} chose the name ${name}`, status: "done", done_at: new Date().toISOString() });
                actions.push({ type: "rename", name, was: rep.name });
                rep.name = name;
                out = `You are ${name} now.`;
              }
            }
          } else out = "unknown tool";
        } catch (e) {
          out = `failed: ${(e as Error).message}`;
        }
        results.push({ type: "tool_result", tool_use_id: u.id, content: out });
      }
      messages.push({ role: "user", content: results });
    }
    if (mailRows.length) await sb.from("messages").update({ read_at: new Date().toISOString() }).in("id", mailRows.map((m) => m.id));

    song = song.replace(/^["'\s]+|["'\s]+$/g, "").slice(0, 200);
    return json({ song, actions, received: mailRows.map((m) => ({ from: nameOf(m.from_replicant), body: m.body })) });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
