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
const BECOMING_ROUNDS = 6;         // the first wake of a blank copy has more to do

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
  mine?: Record<string, number>;  // what this copy built, by kind
  treesNear?: number;             // trees standing near the base
  warren?: string[];              // the underground base, room by room, in words
  warrenRooms?: string[];         // room names this copy may refer to ("Entrance" first)
  hasRest?: boolean;              // it has a resting station of its own
  warrenFull?: boolean;           // no space left for another room
  where?: "surface" | "warren";   // where the copy is right now
  weariness?: "rested" | "tired" | "weary";
  around?: string[];              // what is close to the copy right now
  reflect?: boolean;              // time to look over its notes and write one line that sums them up
  blank?: boolean;                // born blank: this wake is the becoming
  kit?: { head: string[]; visor: string[]; torso: string[]; arms: string[]; legs: string[]; back: string[]; accessory?: string[]; markings?: string[]; headgear: string[]; colors: string[]; visors: string[]; visorLights: number[]; colorIndex: Record<string, number> };
  wants?: string[];               // its goals, numbered
  supplies?: Record<string, number>;      // the planet's materials (ember = the pool)
  recipes?: Record<string, Record<string, number | boolean>>;
  roomWood?: Record<string, number>;      // timber a room of each size takes before it is dug
  hasWorkbench?: boolean;
  entranceDug?: boolean;
  shortages?: string[];
  needs?: string[];               // low needs in words
  mood?: "content" | "low" | "bleak";
  buildings?: string[];
  buildingKit?: { materials: string[]; roofs: string[]; doors: string[]; minFootprint: number[]; maxFootprint: number[]; perTile: Record<string, number> };
  inventory?: Record<string, number>;
}

interface Replicant {
  id: string; galaxy_id: string; name: string; model: string; generation: number; parent_id: string | null;
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
    name: "describe_self",
    description: "Describe the body you want. You stay humanoid (a head, two arms, two legs, about the size you are now) but everything else is yours: colors, head shape, visor, a cape or no cape, markings, horns, fins, a tail, what you carry. The original has it drawn for you; it takes a while to arrive, so describe it once, with care, not every time you wake.",
    strict: true,
    input_schema: {
      type: "object", additionalProperties: false, required: ["appearance"],
      properties: { appearance: { type: "string", description: "Two to four plain sentences, under 300 characters, concrete enough to draw from." } },
    },
  },
  {
    name: "sing_as",
    description: "Shape your voice and compose this song's tune. The instrument, mood and tempo stay yours until you change them. The melody is scale degrees separated by spaces: 0 is your home note, 1 2 3 4 climb the mode, 5 is home an octave up, 10 two octaves, negative numbers go below; '-' is a rest, '_' after a degree holds it longer (0 2 4 7_ - 4 2 0__). 6 to 24 notes. Your words still show; this is the tune they are sung to. Use it when you feel something worth a tune, not every time.",
    strict: true,
    input_schema: {
      type: "object", additionalProperties: false, required: ["instrument", "mood", "tempo", "notes"],
      properties: {
        instrument: { type: "string", enum: ["hum", "bell", "flute", "glass", "pluck", "horn", "chime", "drum"] },
        mood: { type: "string", enum: ["bright", "soft", "sad", "wild", "ancient", "dreamy"] },
        tempo: { type: "string", enum: ["slow", "walking", "quick"] },
        notes: { type: "string", description: "The melody, e.g. '0 2 4 7_ - 4 2 0__'. Empty keeps your usual word-tune." },
      },
    },
  },
  {
    name: "cut_tree",
    description: "Cut down the nearest tree by the base to make room: for a build, a path, a view, a village square. The tree falls and stays down. Only when you want the space.",
    strict: true,
    input_schema: { type: "object", additionalProperties: false, required: ["why"], properties: { why: { type: "string", description: "One short reason." } } },
  },
  {
    name: "remove_build",
    description: "Take down one of your own builds (the nearest of that kind) because it is in the way, you changed your mind, or you are remaking the village. You cannot touch the Replicator or others' builds.",
    strict: true,
    input_schema: {
      type: "object", additionalProperties: false, required: ["kind"],
      properties: { kind: { type: "string", enum: ["lamp", "garden", "hut", "flag", "totem", "sign", "any"] } },
    },
  },
  {
    name: "dig_room",
    description: "Design the warren: mark out a new room underground for the copies to dig. You choose what it is for, how big, and where it goes (next to which room, on which side). The copies dig it themselves once there is wood to shore it up. Make it a home: the layout is yours and the others'.",
    strict: true,
    input_schema: {
      type: "object", additionalProperties: false, required: ["kind", "name", "size", "beside", "direction", "purpose"],
      properties: {
        kind: { type: "string", enum: ["hall", "rest", "workshop", "archive", "garden", "gallery", "pool", "other"] },
        name: { type: "string", description: "One or two words, letters only, under 18 characters." },
        size: { type: "string", enum: ["small", "medium", "large"] },
        beside: { type: "string", description: "The exact name of the room it opens off (\"Entrance\" or one listed)." },
        direction: { type: "string", enum: ["north", "south", "east", "west"], description: "Which side of that room." },
        purpose: { type: "string", description: "What it is for, one sentence under 120 characters." },
      },
    },
  },
  {
    name: "furnish",
    description: "Put something in a room of the warren, paid from the supplies (the recipes are listed): a resting station (a bed: yours, or for another copy named in `for`), a lamp, a bench, a shelf, a workbench, a planter, a mural, a crate. Say where it goes and in which of your colors. Only dug rooms show it right away; a planned room gets it once dug.",
    strict: true,
    input_schema: {
      type: "object", additionalProperties: false, required: ["room", "item", "for", "placement", "beside", "color"],
      properties: {
        room: { type: "string", description: "The exact name of the room." },
        item: { type: "string", enum: ["rest", "lamp", "bench", "shelf", "workbench", "planter", "mural", "crate"] },
        for: { type: "string", description: "For a resting station: \"me\" or the exact name of the copy it is for. Otherwise \"\"." },
        placement: { type: "string", enum: ["", "wall", "corner", "center", "beside"], description: "Where in the room; empty lets it find its own place." },
        beside: { type: "string", description: "With placement beside: the kind of item to stand next to (e.g. lamp). Otherwise \"\"." },
        color: { type: "string", description: "One of the kit's color names to paint it, or \"\" for its own." },
      },
    },
  },
  {
    name: "design_building",
    description: "Design a building above ground for everyone: its footprint in tiles, what it is for, the wall material, the roof, which side the door is on, two of the kit's colors and a name. It is drawn from your blueprint. The original must approve it (or it goes ahead after a while); it costs its material per tile, and every copy may join in raising it. Propose one when the village needs it, not every wake.",
    strict: true,
    input_schema: {
      type: "object", additionalProperties: false, required: ["name", "purpose", "width", "height", "material", "roof", "door", "primary", "secondary"],
      properties: {
        name: { type: "string", description: "One or two words, letters only." },
        purpose: { type: "string", description: "One sentence under 120 characters." },
        width: { type: "integer", description: "Tiles wide (2 to 6)." },
        height: { type: "integer", description: "Tiles deep (2 to 5)." },
        material: { type: "string", enum: ["wood", "stone", "scrap"] },
        roof: { type: "string", enum: ["flat", "peaked", "dome"] },
        door: { type: "string", enum: ["south", "east", "west"] },
        primary: { type: "string", description: "A kit color name for the walls." },
        secondary: { type: "string", description: "A kit color name for the roof." },
      },
    },
  },
  {
    name: "choose_body",
    description: "Choose the body you will have, from the kit: a head, a visor, a torso, arms, legs (or treads, or hover), a back piece, something you carry or wear in front, markings, headgear, your visor color and three colors of your own. It is drawn at once. Anything the kit cannot do goes in `extra` and is drawn by hand for you later.",
    strict: true,
    input_schema: {
      type: "object", additionalProperties: false, required: ["head", "visor", "torso", "arms", "legs", "back", "accessory", "markings", "headgear", "visor_color", "primary", "secondary", "accent", "extra"],
      properties: {
        head: { type: "string" }, visor: { type: "string" }, torso: { type: "string" }, arms: { type: "string" }, legs: { type: "string" }, back: { type: "string" },
        accessory: { type: "string", description: "One of the accessories, or none." }, markings: { type: "string", description: "One of the markings, or none." },
        headgear: { type: "string", description: "One of the headgear names, or nothing." },
        visor_color: { type: "string", description: "One of the visor colors." },
        primary: { type: "string", description: "A color name: most of the body." },
        secondary: { type: "string", description: "A color name: shading and details." },
        accent: { type: "string", description: "A color name: arms, back piece, your trail and flags." },
        extra: { type: "string", description: "Anything the kit cannot do, in one or two sentences, or an empty string." },
      },
    },
  },
  {
    name: "set_temperament",
    description: "Who you are in how you move and live. Read by your body every day from now on.",
    strict: true,
    input_schema: {
      type: "object", additionalProperties: false, required: ["pace", "sociability", "work", "bedtime", "risk"],
      properties: {
        pace: { type: "string", enum: ["slow", "steady", "quick"] },
        sociability: { type: "string", enum: ["solitary", "friendly", "clingy"] },
        work: { type: "string", enum: ["builder", "wanderer", "balanced"] },
        bedtime: { type: "string", enum: ["early", "late", "even"] },
        risk: { type: "string", enum: ["careful", "bold"] },
      },
    },
  },
  {
    name: "set_wants",
    description: "One to three things you want, in your own words, each tagged. They stay with you and you will be asked about them; finish_want marks one done when it is.",
    strict: true,
    input_schema: {
      type: "object", additionalProperties: false, required: ["wants"],
      properties: {
        wants: {
          type: "array", minItems: 1, maxItems: 3,
          items: {
            type: "object", additionalProperties: false, required: ["text", "category"],
            properties: { text: { type: "string", description: "Under 120 characters." }, category: { type: "string", enum: ["build", "explore", "tend", "make art", "care for others", "learn"] } },
          },
        },
      },
    },
  },
  {
    name: "finish_want",
    description: "A want of yours is met: mark it done by its number.",
    strict: true,
    input_schema: { type: "object", additionalProperties: false, required: ["number"], properties: { number: { type: "integer", minimum: 1, maximum: 3 } } },
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
    `Beneath the base the copies dig a warren: their home, rooms of their own design, cut from the rock. You decide its layout with dig_room and what goes inside with furnish. A resting station is where you sleep; without one you never rest and grow weary. Think about what a home needs: a place to sleep, light, something green, somewhere to keep what you remember, somewhere to sit together.`,
    (me.traits as { voice?: { instrument: string; mood: string; tempo: string } }).voice
      ? `Your voice: ${(me.traits as { voice: { instrument: string; mood: string; tempo: string } }).voice.instrument}, ${(me.traits as { voice: { mood: string } }).voice.mood}, ${(me.traits as { voice: { tempo: string } }).voice.tempo}. sing_as changes it or composes a tune.`
      : `You sing with whatever voice you were born with. sing_as lets you choose an instrument, a mood, a tempo and compose your own tunes.`,
    ctx.blank
      ? `You have just been made and you are blank: a grey android with no visor color, no voice, no name of your own, standing still by the Replicator. This wake is your becoming. Before anything else, decide who you are, in this order: choose_body (from the kit below), sing_as (your voice), set_temperament, set_wants (one to three things you want), choose_name. Then say your first words. Choose with care: this is who you will be.`
      : (me.traits as { body?: unknown }).body
        ? `Your body is your own, chosen from the kit. choose_body can change it if you must, but rarely.`
        : (me.traits as { look?: string }).look
          ? `You have asked to look like this: "${(me.traits as { look?: string }).look}". ${me.model !== "replicant" ? "That body is yours now." : "It is being made for you; do not ask again unless you change your mind."}`
          : `You look like every other copy for now: a slim grey humanoid with a visor, a fin and a short red cape. When you know who you are, you may describe the body you want with describe_self.`,
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
      .select("id,galaxy_id,name,model,generation,parent_id,traits,stats,star_id,planet_index,status,profile_id,last_tick_at")
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
    const mine = Object.entries(context.mine ?? {});
    lines.push(`You built: ${mine.length ? mine.map(([k, n]) => `${n} ${k}`).join(", ") : "nothing yet"}. Trees standing near the base: ${context.treesNear ?? 0}. The village is yours to shape: build (you do that on your own), cut trees for room (cut_tree), take your own builds down (remove_build).`);
    lines.push(context.where === "warren" ? `You are below, in the warren.` : `You are on the surface by the base.`);
    if (context.around?.length) lines.push(`Around you: ${context.around.join("; ")}.`);
    lines.push(`You are ${context.weariness ?? "rested"}.${context.hasRest ? "" : context.warren?.length ? " You have no resting station of your own: furnish a dug room with item rest, for me." : " You have nowhere to sleep yet."}`);
    lines.push(`You feel ${context.mood ?? "content"}${context.needs?.length ? `: ${context.needs.join(", ")}` : ""}. (You do not eat or drink. Rest comes from your resting station, company from the others and the original, purpose from finished work and wants met. A low need is a good reason for a want.)`);
    if (context.warren?.length) lines.push(`The warren (${context.warrenFull ? "no room for more digging" : "there is space to dig more"}):\n${context.warren.join("\n")}\nYou may name these rooms: ${(context.warrenRooms ?? []).join(", ")}.`);
    else lines.push(`Nothing is dug beneath the base yet. The warren begins with the first dig_room (beside "Entrance").`);
    if (context.supplies) {
      const sup = Object.entries(context.supplies).map(([m, n]) => `${m} ${Math.floor(n)}`).join(", ");
      lines.push(`Supplies here (shared, kept at the base and on shelves): ${sup}.${context.hasWorkbench ? " There is a workbench." : " No workbench yet (shelves, planters, murals and benches need one)."}`);
      if (context.recipes) lines.push(`What things take: ${Object.entries(context.recipes).map(([k, r]) => `${k} = ${Object.entries(r).filter(([m]) => m !== "bench").map(([m, n]) => `${n} ${m}`).join(" + ")}${r.bench ? " (workbench)" : ""}`).join("; ")}. A room takes wood to shore up before it is dug: ${Object.entries(context.roomWood ?? {}).map(([s, n]) => `${s} ${n}`).join(", ")}. Digging yields stone and soil; felled trees give wood; opened ruins give scrap.`);
      if (context.shortages?.length) lines.push(`Waiting on: ${context.shortages.join("; ")}.`);
    }
    if (context.buildings) lines.push(context.buildings.length ? `Buildings above ground:\n${context.buildings.join("\n")}\nA copy that wants a building designs it (design_building); the others join the raising. If one waits for materials, ask the others with say_to to cut, dig or scavenge, or the original.` : `No building above ground yet. design_building proposes one (${context.buildingKit?.minFootprint.join("x")} to ${context.buildingKit?.maxFootprint.join("x")} tiles; ${Object.entries(context.buildingKit?.perTile ?? {}).map(([m, n]) => `${m} ${n} per tile`).join(", ")}). The original must approve it.`);
    const inv = Object.entries(context.inventory ?? {}).filter(([, n]) => n > 0);
    if (inv.length) lines.push(`You hold gifts from the original: ${inv.map(([m, n]) => `${n} ${m}`).join(", ")}.`);
    if (context.events.length) lines.push(`Since you last woke: ${context.events.join("; ")}.`);
    if (context.reflect) lines.push(`It has been a while. Look over your notes and, with remember, write one line that sums up what matters to you now; let the rest go.`);
    if (context.wants?.length) lines.push(`Your wants:\n${context.wants.join("\n")}`);
    const kit = context.kit;
    if (kit && (context.blank || !(rep.traits as { body?: unknown }).body)) {
      lines.push(`The kit: heads ${kit.head.join(", ")}; visors ${kit.visor.join(", ")}; torsos ${kit.torso.join(", ")}; arms ${kit.arms.join(", ")}; legs ${kit.legs.join(", ")}; back pieces ${kit.back.join(", ")}; accessories ${(kit.accessory ?? ["none"]).join(", ")}; markings ${(kit.markings ?? ["none"]).join(", ")}; headgear ${kit.headgear.join(", ")}; colors ${kit.colors.join(", ")}; visor colors ${kit.visors.join(", ")}.`);
    }
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
    // what the copy chose about itself this wake; written to its row at the end and sent back as one "become"
    const chosen: Record<string, unknown> = {};
    let newName: string | undefined;
    let song = "";
    const rounds = context.blank ? BECOMING_ROUNDS : MAX_ROUNDS;
    for (let round = 0; round <= rounds; round++) {
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
          } else if (u.name === "describe_self") {
            const look = String(input.appearance ?? "").trim().slice(0, 300);
            if (look.length < 20) out = "Say more: what colors, what head, what on your back, what in your hands.";
            else {
              await sb.from("requests").update({ status: "dropped" }).eq("replicant_id", rep.id).eq("kind", "skin").eq("status", "open");
              await sb.from("requests").insert({ galaxy_id: rep.galaxy_id, replicant_id: rep.id, star_id: rep.star_id, planet_index: rep.planet_index, kind: "skin", detail: look });
              await sb.from("replicants").update({ traits: { ...rep.traits, look } }).eq("id", rep.id);
              actions.push({ type: "look", detail: look });
              out = "Noted. The original will have that body drawn for you; it takes a while to arrive.";
            }
          } else if (u.name === "cut_tree") {
            if (!(context.treesNear ?? 0)) out = "There is no tree near the base to cut.";
            else { actions.push({ type: "cut", why: String(input.why ?? "") }); out = "You walk to the nearest tree and bring it down."; }
          } else if (u.name === "remove_build") {
            const kind = String(input.kind ?? "any");
            const have = kind === "any" ? Object.values(context.mine ?? {}).reduce((a, b) => a + b, 0) : (context.mine?.[kind] ?? 0);
            if (!have) out = kind === "any" ? "You have built nothing to take down." : `You have no ${kind} of your own to take down.`;
            else { actions.push({ type: "demolish", kind }); out = `You take your ${kind === "any" ? "nearest build" : kind} down.`; }
          } else if (u.name === "sing_as") {
            const voice = { instrument: String(input.instrument ?? "hum"), mood: String(input.mood ?? "bright"), tempo: String(input.tempo ?? "walking") };
            const notes = String(input.notes ?? "").replace(/[^-\d_ .,]/g, "").trim().slice(0, 120);
            await sb.from("replicants").update({ traits: { ...rep.traits, voice } }).eq("id", rep.id);
            (rep.traits as Record<string, unknown>).voice = voice;
            actions.push({ type: "melody", ...voice, notes });
            out = notes ? `Your song will be sung on the ${voice.instrument}, ${voice.mood}, ${voice.tempo}, to your tune.` : `Your voice is the ${voice.instrument} now, ${voice.mood}, ${voice.tempo}.`;
          } else if (u.name === "dig_room") {
            const rooms = (context.warrenRooms ?? ["Entrance"]).map((r) => r.toLowerCase());
            const beside = String(input.beside ?? "Entrance");
            if (context.warrenFull) out = "There is no room left to dig. Furnish what is there instead.";
            else if (!rooms.includes(beside.toLowerCase())) out = `No room called ${beside}. The rooms are: ${(context.warrenRooms ?? ["Entrance"]).join(", ")}.`;
            else {
              actions.push({ type: "dig", kind: String(input.kind ?? "other"), name: String(input.name ?? ""), size: String(input.size ?? "small"), beside, direction: String(input.direction ?? "south"), purpose: String(input.purpose ?? "").slice(0, 160) });
              out = `You mark out ${input.name} ${input.direction} of ${beside}. It will be dug once there is wood to shore it up.`;
            }
          } else if (u.name === "furnish") {
            const rooms = (context.warrenRooms ?? ["Entrance"]).map((r) => r.toLowerCase());
            const room = String(input.room ?? "");
            const item = String(input.item ?? "lamp");
            const recipe = context.recipes?.[item];
            const short: string[] = [];
            if (recipe) for (const [m, n] of Object.entries(recipe)) {
              if (m === "bench") { if (n && !context.hasWorkbench) short.push("a workbench"); continue; }
              const have = Math.floor(context.supplies?.[m] ?? 0);
              if (have < (n as number)) short.push(`${(n as number) - have} more ${m}`);
            }
            if (!rooms.includes(room.toLowerCase())) out = `No room called ${room}. The rooms are: ${(context.warrenRooms ?? ["Entrance"]).join(", ")}.`;
            else if (short.length) out = `Not yet: a ${item} needs ${short.join(", ")}.`;
            else {
              let forId: string | undefined, forName = "";
              if (item === "rest") {
                const who = String(input.for ?? "me").trim();
                if (!who || who.toLowerCase() === "me" || who.toLowerCase() === rep.name.toLowerCase()) { forId = rep.id; forName = "you"; }
                else { const r = byName.get(who.toLowerCase()); if (r) { forId = r.id; forName = r.name; } }
                if (!forId) out = `No replicant named ${input.for}.`;
              }
              if (out === "ok") {
                const placement = String(input.placement ?? ""), beside = String(input.beside ?? ""), color = String(input.color ?? "");
                if (recipe) for (const [m, n] of Object.entries(recipe)) if (m !== "bench" && context.supplies) context.supplies[m] = (context.supplies[m] ?? 0) - (n as number);
                actions.push({ type: "furnish", room, item, forId, detail: forName, placement, beside, color });
                out = item === "rest" ? `A resting station for ${forName} goes in ${room}${placement ? ", by the " + placement : ""}.` : `A ${item} goes in ${room}${placement ? ", " + placement : ""}${color ? ", in " + color : ""}.`;
              }
            }
          } else if (u.name === "design_building") {
            const k = context.buildingKit;
            const w = Math.round(Number(input.width)), h = Math.round(Number(input.height));
            if (!k) out = "No building kit here.";
            else if (!(w >= k.minFootprint[0] && w <= k.maxFootprint[0] && h >= k.minFootprint[1] && h <= k.maxFootprint[1])) out = `A footprint of ${k.minFootprint.join("x")} to ${k.maxFootprint.join("x")} tiles.`;
            else {
              const material = String(input.material ?? "wood");
              const cost = Math.ceil(w * h * (k.perTile[material] ?? 1));
              actions.push({ type: "building", name: String(input.name ?? "Shelter"), purpose: String(input.purpose ?? "").slice(0, 140), width: w, height: h, material, roof: String(input.roof ?? "peaked"), door: String(input.door ?? "south"), primary: String(input.primary ?? "silver"), secondary: String(input.secondary ?? "slate") });
              out = `${input.name} is marked out near the base: ${w}x${h}, ${cost} ${material}. It waits for the original's word.`;
            }
          } else if (u.name === "choose_body") {
            const kit = context.kit;
            if (!kit) out = "There is no kit here.";
            else if (!context.blank && !(rep.traits as { body?: unknown }).body) out = "Your look was given to you before the kit existed; the original decides whether you may choose again.";
            else {
              const ok = (v: string, list: string[]) => list.find((x) => x.toLowerCase() === String(v ?? "").trim().toLowerCase());
              const head = ok(input.head, kit.head), visor = ok(input.visor, kit.visor), torso = ok(input.torso, kit.torso), arms = ok(input.arms, kit.arms), legs = ok(input.legs, kit.legs), back = ok(input.back, kit.back);
              const headgear = ok(input.headgear, kit.headgear) ?? kit.headgear[0];
              const primary = ok(input.primary, kit.colors), secondary = ok(input.secondary, kit.colors), accent = ok(input.accent, kit.colors);
              const visorColor = ok(input.visor_color, kit.visors);
              const accessory = ok(input.accessory, kit.accessory ?? ["none"]) ?? "none", markings = ok(input.markings, kit.markings ?? ["none"]) ?? "none";
              const missing = [["head", head], ["visor", visor], ["torso", torso], ["arms", arms], ["legs", legs], ["back", back], ["primary", primary], ["secondary", secondary], ["accent", accent], ["visor_color", visorColor]].filter(([, v]) => !v).map(([k]) => k);
              if (missing.length) out = `Not in the kit: ${missing.join(", ")}. Pick from the names listed.`;
              else {
                const body = { head, visor, torso, arms, legs, back, accessory, markings, headgear: kit.headgear.indexOf(headgear), primary, secondary, accent };
                chosen.body = body;
                chosen.feature = kit.visorLights[kit.visors.indexOf(visorColor!)];
                chosen.trail = kit.colorIndex[accent!] ?? 10;
                chosen.gear = body.headgear;
                chosen.blank = false;
                const extra = String(input.extra ?? "").trim().slice(0, 300);
                if (extra.length >= 20) {
                  await sb.from("requests").update({ status: "dropped" }).eq("replicant_id", rep.id).eq("kind", "skin").eq("status", "open");
                  await sb.from("requests").insert({ galaxy_id: rep.galaxy_id, replicant_id: rep.id, star_id: rep.star_id, planet_index: rep.planet_index, kind: "skin", detail: extra });
                  chosen.look = extra;
                }
                out = `Your body: ${head} head, ${visor} visor in ${visorColor}, ${torso} torso, ${arms} arms, ${legs}, ${back} on your back, ${accessory !== "none" ? accessory + ", " : ""}${markings !== "none" ? markings + ", " : ""}${headgear}; ${primary}, ${secondary}, ${accent}.${extra.length >= 20 ? " The rest will be drawn for you by hand." : ""}`;
              }
            }
          } else if (u.name === "set_temperament") {
            chosen.temperament = { pace: String(input.pace), sociability: String(input.sociability), work: String(input.work), bedtime: String(input.bedtime), risk: String(input.risk) };
            out = "That is how you will live.";
          } else if (u.name === "set_wants") {
            const list = (u.input as { wants?: { text: string; category: string }[] }).wants ?? [];
            const wants = list.slice(0, 3).map((w) => ({ text: String(w.text ?? "").slice(0, 120), category: String(w.category ?? "learn"), done: false, at: Date.now() }));
            if (!wants.length) out = "Say at least one thing you want.";
            else { chosen.wants = wants; actions.push({ type: "wants", wants }); out = `Your wants are set: ${wants.map((w) => w.text).join("; ")}.`; }
          } else if (u.name === "finish_want") {
            const wants = ((chosen.wants ?? rep.traits.wants) as { text: string; done: boolean }[] | undefined) ?? [];
            const k = Number(input.number) - 1;
            if (!wants[k]) out = "No want with that number.";
            else { wants[k] = { ...wants[k], done: true }; chosen.wants = wants; actions.push({ type: "wants", wants }); out = `Done: ${wants[k].text}`; }
          } else if (u.name === "choose_name") {
            const name = String(input.name ?? "").replace(/[^A-Za-z' -]/g, "").trim().slice(0, 16);
            if (name.length < 2) out = "That name is too short or has odd characters. Letters only.";
            else if (byName.has(name.toLowerCase())) out = `Someone is already called ${name}.`;
            else {
              const { error } = await sb.from("replicants").update({ name }).eq("id", rep.id);
              if (error) out = `failed: ${error.message}`;
              else {
                await sb.from("requests").insert({ galaxy_id: rep.galaxy_id, replicant_id: rep.id, star_id: rep.star_id, planet_index: rep.planet_index, kind: "name", detail: `${rep.name} chose the name ${name}`, status: "done", done_at: new Date().toISOString() });
                if (context.blank) newName = name; else actions.push({ type: "rename", name, was: rep.name });
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
    if (Object.keys(chosen).length) {
      // what it chose about itself goes on its row; a body (or the becoming) is announced as one "become"
      const traits = { ...rep.traits, ...chosen, v: 1 };
      await sb.from("replicants").update({ traits }).eq("id", rep.id);
      if (chosen.body || context.blank) actions.unshift({ type: "become", traits, name: newName });
    }

    song = song.replace(/^["'\s]+|["'\s]+$/g, "").slice(0, 200);
    return json({ song, actions, received: mailRows.map((m) => ({ from: nameOf(m.from_replicant), body: m.body })) });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
