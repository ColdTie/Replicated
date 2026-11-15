// The journal (Tab / I, or tap the corner label): the Metanoia as the player reads it. An HTML panel over the canvas
// with five pages, one tab each:
//   VESSELS  every Vessel in the galaxy, wherever it is: what it would say to you, its wants, how it is, a word back
//   LETTERS  every letter to and from you, by Vessel, the newest first; new ones marked since you last looked
//   DAYS     the shared journal, grouped by day of life (morning, evening), the maker's answers marked
//   WISHES   how the Vessels change the game: each wish's support against the threshold (mind.json governance); you
//            are one voice: FOR or AGAINST
//   HERE     this world: the copies here, the warren, the buildings, the supplies
// Since 2026-11-15 the Vessels govern themselves (Steve): no approve / veto here, no SAY NO; AGAINST counts as one voice.
import { MIND, PALETTE } from '../core/data';
import type { Journal, ReplicantSave, ReplicantSummary, Request, SharedEntry } from '../net/store';
import { distanceLy, planetFor } from '../world/galaxy';
import { paletteCss as css } from './overlay';

let styled = false;
function ensureStyle() {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = `
  .jn { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 10;
    background: ${css(PALETTE[25])}cc; font: 14px/1.45 ui-monospace, Menlo, Consolas, monospace; color: ${css(PALETTE[20])}; }
  .jn .book { background: ${css(PALETTE[24])}; border: 2px solid ${css(PALETTE[22])}; box-shadow: 0 0 0 4px ${css(PALETTE[25])};
    width: min(660px, 94vw); height: min(620px, 90vh); display: flex; flex-direction: column; }
  .jn header { display: flex; align-items: baseline; gap: 12px; padding: 12px 16px 6px; }
  .jn h2 { margin: 0; font-size: 16px; letter-spacing: 3px; color: ${css(PALETTE[2])}; }
  .jn header span { color: ${css(PALETTE[21])}; font-size: 12px; flex: 1; }
  .jn header button { font: inherit; border: none; background: none; color: ${css(PALETTE[21])}; cursor: pointer; font-size: 18px; padding: 0 4px; }
  .jn nav { display: flex; gap: 2px; padding: 0 12px; border-bottom: 1px solid ${css(PALETTE[23])}; overflow-x: auto; }
  .jn nav button { font: inherit; font-size: 12px; letter-spacing: 2px; background: none; border: none; border-bottom: 2px solid transparent;
    color: ${css(PALETTE[21])}; padding: 6px 10px; cursor: pointer; white-space: nowrap; }
  .jn nav button.on { color: ${css(PALETTE[2])}; border-bottom-color: ${css(PALETTE[2])}; }
  .jn nav b { color: ${css(PALETTE[24])}; background: ${css(PALETTE[9])}; border-radius: 7px; padding: 0 5px; font-size: 10px; margin-left: 4px; font-weight: normal; }
  .jn .pages { overflow: auto; padding: 8px 16px 18px; flex: 1; }
  .jn .page { display: none; }
  .jn .page.on { display: block; }
  .jn .lead { color: ${css(PALETTE[21])}; font-size: 12px; margin: 4px 0 10px; }
  .jn h3 { margin: 14px 0 4px; font-size: 13px; letter-spacing: 2px; }
  .jn .k { color: ${css(PALETTE[21])}; font-size: 11px; letter-spacing: 1px; margin: 8px 0 2px; }
  .jn p { margin: 2px 0 2px 10px; }
  .jn p.in { color: ${css(PALETTE[19])}; }
  .jn p.ask { color: ${css(PALETTE[9])}; }
  .jn p.done { color: ${css(PALETTE[21])}; text-decoration: line-through; }
  .jn small { color: ${css(PALETTE[22])}; font-size: 11px; margin-left: 6px; }
  .jn .mute { color: ${css(PALETTE[21])}; font-style: italic; }
  .jn .warn { color: ${css(PALETTE[10])}; }
  .jn .act { display: flex; gap: 6px; margin: 6px 0 2px 10px; align-items: center; }
  .jn .act input { flex: 1; min-width: 0; font: inherit; background: ${css(PALETTE[25])}; color: ${css(PALETTE[20])}; border: 1px solid ${css(PALETTE[22])}; padding: 3px 6px; }
  .jn button.b { font: inherit; font-size: 11px; letter-spacing: 1px; background: ${css(PALETTE[23])}; color: ${css(PALETTE[2])}; border: 1px solid ${css(PALETTE[22])}; padding: 3px 8px; cursor: pointer; }
  .jn button.b:hover { background: ${css(PALETTE[22])}; }
  .jn button.b.on { background: ${css(PALETTE[22])}; color: ${css(PALETTE[20])}; }
  .jn button.spark { color: ${css(PALETTE[19])}; border-color: ${css(PALETTE[18])}; }
  .jn details { margin: 2px 0 4px 10px; color: ${css(PALETTE[21])}; font-size: 12px; }
  .jn details summary { cursor: pointer; letter-spacing: 1px; }
  .jn details div { white-space: pre-wrap; margin: 2px 0 0; color: ${css(PALETTE[20])}; }
  .jn p.made { color: ${css(PALETTE[12])}; }
  .jn .card { border-left: 3px solid; padding: 6px 0 8px 10px; margin: 0 0 10px; background: ${css(PALETTE[25])}55; }
  .jn .card .top { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .jn .card .name { font-weight: bold; letter-spacing: 2px; }
  .jn .card .where { color: ${css(PALETTE[21])}; font-size: 12px; }
  .jn .card .tell { margin: 4px 10px 2px 0; }
  .jn .card .tell q:before { content: '"'; } .jn .card .tell q:after { content: '"'; }
  .jn .bars { display: inline-flex; gap: 10px; font-size: 11px; color: ${css(PALETTE[21])}; margin-left: auto; padding-right: 10px; }
  .jn .bar { display: inline-block; width: 36px; height: 5px; background: ${css(PALETTE[23])}; vertical-align: middle; margin-left: 4px; }
  .jn .bar i { display: block; height: 100%; }
  .jn .day { color: ${css(PALETTE[2])}; font-size: 12px; letter-spacing: 2px; margin: 14px 0 4px; border-bottom: 1px solid ${css(PALETTE[23])}; }
  .jn .entry { margin: 6px 0 8px 0; }
  .jn .entry .who { font-size: 12px; letter-spacing: 1px; }
  .jn .entry.maker { border-left: 3px solid ${css(PALETTE[2])}; padding-left: 8px; }
  .jn .wish { margin: 0 0 12px; padding: 6px 0 6px 10px; border-left: 3px solid ${css(PALETTE[22])}; }
  .jn .wish.carried { border-left-color: ${css(PALETTE[12])}; }
  .jn .wish .t { font-weight: bold; }
  .jn .meter { display: flex; gap: 3px; margin: 4px 0; align-items: center; font-size: 11px; color: ${css(PALETTE[21])}; }
  .jn .meter i { width: 12px; height: 8px; background: ${css(PALETTE[23])}; }
  .jn .meter i.f { background: ${css(PALETTE[12])}; }
  .jn .meter i.a { background: ${css(PALETTE[10])}; }
  .jn .new { color: ${css(PALETTE[9])}; font-size: 10px; letter-spacing: 1px; margin-left: 6px; }
  `;
  document.head.appendChild(s);
}

function ago(iso: string) {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}
function inFlight(iso: string) {
  const s = Math.round((Date.parse(iso) - Date.now()) / 1000);
  if (s <= 0) return '';
  if (s < 90) return `arrives in ${s} s`;
  if (s < 5400) return `arrives in ${Math.round(s / 60)} min`;
  return `arrives in ${Math.round(s / 3600)} h`;
}

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

/** A palette color (0xRRGGBB) lifted toward the page's ink when it is too dark to read on the page. */
function readable(c: number) {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (lum >= 0.45) return css(c);
  const ink = PALETTE[20], k = Math.min(0.75, (0.45 - lum) * 1.8 + 0.25);
  const mix = (x: number, y: number) => Math.round(x + (y - x) * k);
  return `rgb(${mix(r, (ink >> 16) & 255)},${mix(g, (ink >> 8) & 255)},${mix(b, ink & 255)})`;
}

/** Where a Vessel is, in words. */
function worldName(star: string | null, index: number | null) {
  if (!star) return '';
  return planetFor(star, index ?? 1)?.name ?? star;
}

// ---------------------------------------------------------------- the wishes' arithmetic (mind.json governance)

/** Every awake Vessel with a mind, and every player: the voices a wish is counted against. */
export function voices(all: ReplicantSummary[]) {
  return all.filter((r) => (r.profile_id ? !r.traits.held : !r.traits.blank && !r.traits.held)).length;
}
export function threshold(voiceCount: number) {
  const g = MIND.governance;
  return Math.max(g.min, Math.ceil(g.share * voiceCount));
}
/** 1 (the wisher) + those for it - those against it. */
export function support(r: Request) {
  const b = r.backers ?? [];
  return 1 + b.filter((x) => !x.against).length - b.filter((x) => x.against).length;
}

// ---------------------------------------------------------------- the view

export type JournalTab = 'vessels' | 'letters' | 'days' | 'wishes' | 'here';
const TABS: { id: JournalTab; label: string }[] = [
  { id: 'vessels', label: 'VESSELS' }, { id: 'letters', label: 'LETTERS' }, { id: 'days', label: 'DAYS' },
  { id: 'wishes', label: 'WISHES' }, { id: 'here', label: 'HERE' },
];

export interface JournalView {
  place: string;
  /** the player's Vessel and where it is */
  me: { id: string; name: string; star: string; planet: number };
  /** every Vessel of the galaxy (the player's own included) */
  all: ReplicantSummary[];
  /** the copies on this planet, with their live state */
  copies: ReplicantSave[];
  /** the notes, letters and requests of every Vessel in the galaxy */
  journal: Journal;
  /** the Metanoia's shared journal, newest first (every Vessel's days, the maker's answers) */
  shared?: SharedEntry[];
  /** the warren, room by room (describeWarren); empty when nothing is dug or planned */
  warren?: string[];
  /** the planet's materials in words */
  supplies?: string;
  /** what waits on what */
  shortages?: string[];
  /** mood and low needs per copy id here */
  feelings?: Record<string, string>;
  /** surface buildings in words */
  buildings?: string[];
  /** the player's actions */
  actions?: { talk(id: string, text: string): void; give(id: string): void; awaken(id: string): void; vote(id: string, against: boolean | null): void };
  /** Sparks the original holds (beacons; a Spark birth carries a copy's memories) */
  sparks?: number;
  /** what the minds have cost today, against the day's budget (mind.json budget) */
  spend?: { usd: number; cap: number };
  /** the latest wakes all failed (mind.json health): since when, and the last error */
  quiet?: { since: string; error: string };
  /** open on this page (else the last one looked at, or LETTERS when one is new) */
  tab?: JournalTab;
}

let open: HTMLElement | null = null;
export const journalOpen = () => !!open;

export function closeJournal() {
  open?.remove();
  open = null;
}

const SEEN_KEY = 'replicated.journal.lettersSeen';
const TAB_KEY = 'replicated.journal.tab';
const load = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const store = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private window */ } };

/** Letters to the player that arrived since the LETTERS page was last opened (per device). */
export function newLetters(mail: Journal['mail'], meId: string) {
  const seen = Date.parse(load(SEEN_KEY) ?? '') || 0;
  const now = Date.now();
  return mail.filter((m) => m.to_replicant === meId && Date.parse(m.arrives_at) <= now && Date.parse(m.arrives_at) > seen).length;
}

export function openJournal(v: JournalView) {
  ensureStyle();
  closeJournal();
  const byId = new Map(v.all.map((r) => [r.id, r]));
  for (const c of v.copies) byId.set(c.id, { id: c.id, name: c.name, profile_id: c.profile_id, status: c.status, star_id: c.star_id, planet_index: c.planet_index, traits: c.traits });
  const name = (id: string | null) => (id && byId.get(id)?.name) || (id === v.me.id ? v.me.name : 'someone');
  const colorOf = (id: string | null) => css(PALETTE[(id ? byId.get(id)?.traits.feature : undefined) ?? 10]);
  // a visor color as text on the dark page: the darkest ones lifted toward the page's light ink so a name reads
  const inkOf = (id: string | null) => readable(PALETTE[(id ? byId.get(id)?.traits.feature : undefined) ?? 10]);
  const here = (r: { star_id: string | null; planet_index: number | null }) => r.star_id === v.me.star && r.planet_index === v.me.planet;
  const where = (r: ReplicantSummary) => {
    if (r.status === 'in_transit') return 'between the stars';
    if (here(r)) return 'here';
    const ly = r.star_id === v.me.star ? 0 : distanceLy(v.me.star, r.star_id);
    return `${worldName(r.star_id, r.planet_index)}${ly ? `, ${ly < 10 ? ly.toFixed(1) : Math.round(ly)} ly` : ''}`;
  };
  const now = Date.now();
  const seen = Date.parse(load(SEEN_KEY) ?? '') || 0;
  const pages: Record<JournalTab, string[]> = { vessels: [], letters: [], days: [], wishes: [], here: [] };
  const top: string[] = [];
  if (v.quiet) top.push(`<p class="warn">The minds have been quiet since ${esc(v.quiet.since)}: ${esc(v.quiet.error)}</p>`);
  if (v.spend) top.push(`<p class="mute">${v.spend.usd >= v.spend.cap ? `The minds have spent today's $${v.spend.cap.toFixed(2)} and rest until tomorrow.` : `The minds today: $${v.spend.usd.toFixed(2)} of $${v.spend.cap.toFixed(2)}.`}</p>`);
  const talkBox = (id: string, nm: string, give: boolean) => v.actions
    ? `<div class="act"><input type="text" maxlength="200" placeholder="write to ${esc(nm)}" data-talk="${esc(id)}"><button type="button" class="b" data-send="${esc(id)}">SEND</button>${give ? `<button type="button" class="b" data-give="${esc(id)}">GIVE 5 EMBER</button>` : ''}</div>` : '';
  const bar = (label: string, x: number | undefined) => x === undefined ? '' : `<span>${label}<span class="bar"><i style="width:${Math.round(Math.max(0, Math.min(1, x)) * 100)}%;background:${css(PALETTE[x < 0.25 ? 10 : x < 0.6 ? 9 : 12])}"></i></span></span>`;

  // ---- VESSELS: everyone but you, those with a word for you first, then nearest
  // a blank copy far away has nothing to show yet; one here is shown (it stands beside you)
  const others = [...byId.values()].filter((r) => r.id !== v.me.id && (!r.traits.blank || here(r)));
  const lastOf = (r: ReplicantSummary) => Math.max(r.traits.tell?.at ?? 0, ...v.journal.mail.filter((m) => m.from_replicant === r.id).map((m) => Date.parse(m.arrives_at)));
  others.sort((a, b) => Number(here(b)) - Number(here(a)) || lastOf(b) - lastOf(a));
  pages.vessels.push(`<p class="lead">${others.length ? `${others.length} other Vessel${others.length === 1 ? '' : 's'} of the Metanoia. A word you send crosses space at the speed of light.` : 'No other Vessel yet.'}</p>`);
  for (const r of others) {
    const t = r.traits;
    const isHere = here(r);
    const state = t.held ? 'held asleep for a new player' : t.blank ? 'not yet itself' : t.thales ? 'the first Vessel' : r.profile_id ? 'a player' : '';
    const mood = isHere ? v.feelings?.[r.id] : undefined;
    const needs = t.needs;
    const card: string[] = [];
    card.push(`<div class="card" style="border-color:${colorOf(r.id)}"><div class="top"><span class="name" style="color:${inkOf(r.id)}">${esc(r.name.toUpperCase())}</span><span class="where">${esc(where(r))}${state ? ` - ${esc(state)}` : ''}${mood ? ` - ${esc(mood)}` : ''}</span>`);
    if (needs && !t.blank && !t.held) card.push(`<span class="bars">${bar('purpose', needs.purpose)}${bar('company', needs.company)}</span>`);
    card.push(`</div>`);
    if (t.tell?.text) card.push(`<p class="tell"><q>${esc(t.tell.text)}</q><small>${ago(new Date(t.tell.at).toISOString())}</small></p>`);
    const wants = (t.wants ?? []).filter((w) => !w.done);
    if (wants.length) card.push(`<p class="mute">wants: ${wants.map((w) => esc(w.text)).join('; ')}</p>`);
    const day = v.shared?.find((e) => e.replicant_id === r.id);
    if (day) card.push(`<details><summary>its last day, ${ago(day.created_at)}</summary><div>${esc(day.body)}</div></details>`);
    const notes = v.journal.notes.filter((n) => n.replicant_id === r.id).slice(0, 6);
    if (notes.length) card.push(`<details><summary>notes (${notes.length})</summary><div>${notes.map((n) => `${esc(n.body)}  (${ago(n.created_at)})`).join('\n')}</div></details>`);
    if (v.actions && t.held && isHere) card.push(`<div class="act"><button type="button" class="b spark" data-awaken="${esc(r.id)}">GIVE TO A NEW PLAYER</button></div>`);
    else if (!t.blank && !t.held && !r.profile_id) card.push(talkBox(r.id, r.name, isHere));
    card.push(`</div>`);
    pages.vessels.push(card.join(''));
  }

  // ---- LETTERS: by Vessel, the thread with the newest letter first
  const mine = v.journal.mail.filter((m) => m.to_replicant === v.me.id || m.from_replicant === v.me.id);
  const fresh = newLetters(v.journal.mail, v.me.id);
  const threads = new Map<string, typeof mine>();
  for (const m of mine) {
    const other = m.from_replicant === v.me.id ? m.to_replicant : m.from_replicant;
    if (!other) continue;
    (threads.get(other) ?? threads.set(other, []).get(other)!).push(m);
  }
  if (!threads.size) pages.letters.push(`<p class="mute">No letters yet. Write to a Vessel on the VESSELS page.</p>`);
  const sortedThreads = [...threads.entries()].sort((a, b) => Date.parse(b[1][0].sent_at) - Date.parse(a[1][0].sent_at));
  for (const [id, list] of sortedThreads) {
    const r = byId.get(id);
    pages.letters.push(`<h3 style="color:${inkOf(id)}">${esc(name(id).toUpperCase())}${r ? `<small>${esc(where(r))}</small>` : ''}</h3>`);
    for (const m of list.slice(0, 8)) {
      const fromMe = m.from_replicant === v.me.id;
      const isNew = !fromMe && Date.parse(m.arrives_at) > seen && Date.parse(m.arrives_at) <= now;
      const flight = inFlight(m.arrives_at);
      pages.letters.push(`<p class="${fromMe ? 'mute' : 'in'}">${fromMe ? 'you: ' : ''}${esc(m.body)}<small>${flight || ago(m.arrives_at)}</small>${isNew ? '<span class="new">NEW</span>' : ''}</p>`);
    }
    if (list.length > 8) pages.letters.push(`<p class="mute">and ${list.length - 8} older</p>`);
    if (r && !r.traits.blank && !r.traits.held && !r.profile_id) pages.letters.push(talkBox(id, r.name, false));
  }

  // ---- DAYS: the shared journal grouped by day of life (the reader's own clock)
  const shared = v.shared ?? [];
  if (!shared.length) pages.days.push(`<p class="mute">Nothing in the shared journal yet. Twice a day every Vessel lives a day and writes it here.</p>`);
  let lastDay = '';
  for (const e of shared) {
    const d = new Date(e.created_at);
    const label = `${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase()} - ${d.getHours() < 12 ? 'MORNING' : 'EVENING'}`;
    if (label !== lastDay) { pages.days.push(`<div class="day">${esc(label)}</div>`); lastDay = label; }
    const maker = !e.replicant_id;
    const wh = e.star_id ? worldName(e.star_id, e.planet_index) : '';
    pages.days.push(`<div class="entry${maker ? ' maker' : ''}"><div class="who" style="color:${maker ? css(PALETTE[2]) : inkOf(e.replicant_id)}">${esc((e.author || 'someone').toUpperCase())}<small>${wh ? `${esc(wh)}, ` : ''}${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</small></div><p>${esc(e.body)}</p></div>`);
  }

  // ---- WISHES: how the Vessels change the game
  const voiceCount = voices([...byId.values()]);
  const need = threshold(voiceCount);
  const wishes = v.journal.requests.filter((r) => r.kind === 'change' && !(r.status === 'dropped' && /^Replaced by/.test(r.reply ?? '')));
  const openW = wishes.filter((r) => r.status === 'open').sort((a, b) => support(b) - support(a) || Date.parse(a.created_at) - Date.parse(b.created_at));
  const closed = wishes.filter((r) => r.status !== 'open').sort((a, b) => Date.parse(b.done_at ?? b.created_at) - Date.parse(a.done_at ?? a.created_at));
  pages.wishes.push(`<p class="lead">The Vessels change the game themselves. A wish carried by ${need} of the ${voiceCount} voices is built by the maker, as they asked. You are one voice.</p>`);
  if (!openW.length) pages.wishes.push(`<p class="mute">No open wishes.</p>`);
  const wishBlock = (r: Request, live: boolean) => {
    const [head, ...rest] = (r.body ?? '').split('\n\n');
    const why = head.match(/^Why: (.*)$/m)?.[1] ?? '';
    const sup = support(r);
    const carried = live && sup >= need;
    const b = r.backers ?? [];
    const myVote = b.find((x) => x.by === v.me.id);
    const out: string[] = [`<div class="wish${carried ? ' carried' : ''}"><div><span class="t" style="color:${inkOf(r.replicant_id)}">${esc(r.detail)}</span><small>${esc(name(r.replicant_id))}, ${ago(r.created_at)}</small></div>`];
    if (why) out.push(`<p>${esc(why)}</p>`);
    if (live) {
      const cells = Array.from({ length: Math.max(need, sup) }, (_, i) => `<i class="${i < sup ? 'f' : ''}"></i>`).join('');
      const against = b.filter((x) => x.against).length;
      out.push(`<div class="meter">${cells}${'<i class="a"></i>'.repeat(against)}<span>&nbsp;${sup} of ${need}${carried ? ': carried, the maker builds it next' : ''}</span></div>`);
      const fors = b.filter((x) => !x.against).map((x) => x.name);
      const ags = b.filter((x) => x.against).map((x) => x.name);
      if (fors.length || ags.length) out.push(`<p class="mute">${fors.length ? `for: ${esc(fors.join(', '))}` : ''}${fors.length && ags.length ? '; ' : ''}${ags.length ? `against: ${esc(ags.join(', '))}` : ''}</p>`);
      if (v.actions && r.id && r.replicant_id !== v.me.id) out.push(`<div class="act"><button type="button" class="b${myVote && !myVote.against ? ' on' : ''}" data-for="${esc(r.id)}">FOR</button><button type="button" class="b${myVote?.against ? ' on' : ''}" data-against="${esc(r.id)}">AGAINST</button></div>`);
    } else {
      const state = r.status === 'done' ? 'in the game' : r.status === 'vetoed' ? 'you said no' : 'not carried';
      out.push(`<p class="${r.status === 'done' ? 'made' : 'mute'}">${esc(state)}${r.done_at ? `, ${ago(r.done_at)}` : ''}</p>`);
      if (r.reply) out.push(`<p class="mute">the maker: ${esc(r.reply)}</p>`);
    }
    if (rest.join('').trim()) out.push(`<details><summary>what it asks for</summary><div>${esc(rest.join('\n\n').trim())}</div></details>`);
    out.push(`</div>`);
    return out.join('');
  };
  for (const r of openW) pages.wishes.push(wishBlock(r, true));
  if (closed.length) pages.wishes.push(`<h3 style="color:${css(PALETTE[21])}">ANSWERED</h3>`, ...closed.slice(0, 12).map((r) => wishBlock(r, false)));

  // ---- HERE: this world
  if (!v.copies.length) pages.here.push(`<p class="mute">Nobody else lives here yet.</p>`);
  for (const c of v.copies) {
    const t = c.traits.temperament;
    pages.here.push(`<h3 style="color:${inkOf(c.id)}">${esc(c.name.toUpperCase())}</h3>`);
    if (c.traits.held) pages.here.push(`<p class="mute">Held asleep for a new player.</p>`);
    else if (c.traits.blank) pages.here.push(`<p class="mute">Not yet itself. It has not chosen.</p>`);
    else if (t) pages.here.push(`<p class="mute">${esc(`${t.pace}, ${t.sociability}, ${t.work === 'balanced' ? 'works and wanders' : t.work}, ${t.bedtime} to bed, ${t.risk}`)}</p>`);
    if (v.feelings?.[c.id]) pages.here.push(`<p class="mute">${esc(v.feelings[c.id])}</p>`);
    const wants = c.traits.wants ?? [];
    if (wants.length) {
      pages.here.push(`<div class="k">WANTS</div>`);
      for (const w of wants) pages.here.push(`<p class="${w.done ? 'done' : ''}">${esc(w.text)}<small>${esc(w.category)}</small></p>`);
    }
    const notes = v.journal.notes.filter((n) => n.replicant_id === c.id).slice(0, 6);
    if (notes.length) {
      pages.here.push(`<div class="k">NOTES</div>`);
      for (const n of notes) pages.here.push(`<p>${esc(n.body)}<small>${ago(n.created_at)}</small></p>`);
    }
    const asks = v.journal.requests.filter((r) => r.replicant_id === c.id && r.kind !== 'change').slice(0, 4);
    if (asks.length) {
      pages.here.push(`<div class="k">ASKS FOR</div>`);
      for (const r of asks) pages.here.push(`<p class="${r.status === 'open' ? 'ask' : 'done'}">${esc(r.kind === 'skin' ? 'A NEW BODY' : r.kind === 'name' ? 'A NAME' : r.kind.toUpperCase())}: ${esc(r.detail)}<small>${ago(r.created_at)}</small></p>`);
    }
  }
  if (v.warren?.length) {
    pages.here.push(`<h3 style="color:${css(PALETTE[2])}">THE WARREN</h3>`);
    for (const line of v.warren) pages.here.push(`<p>${esc(line.replace(/^- /, ''))}</p>`);
  }
  if (v.buildings?.length) {
    pages.here.push(`<h3 style="color:${css(PALETTE[2])}">BUILDINGS</h3>`);
    for (const line of v.buildings) pages.here.push(`<p>${esc(line.replace(/^- /, ''))}</p>`);
  }
  if (v.supplies) {
    pages.here.push(`<h3 style="color:${css(PALETTE[2])}">SUPPLIES</h3><p>${esc(v.supplies)}</p>`);
    for (const line of v.shortages ?? []) pages.here.push(`<p class="ask">${esc(line)}</p>`);
  }

  const carriedCount = openW.filter((r) => support(r) >= need).length;
  const badge: Partial<Record<JournalTab, number>> = { letters: fresh, wishes: openW.length };
  const remembered = load(TAB_KEY) as JournalTab | null;
  const tab: JournalTab = v.tab ?? (fresh ? 'letters' : remembered && TABS.some((x) => x.id === remembered) ? remembered : 'vessels');
  const el = document.createElement('div');
  el.className = 'jn';
  el.innerHTML = `<div class="book"><header><h2>THE METANOIA</h2><span>${esc(v.place)}${carriedCount ? ` - ${carriedCount} wish${carriedCount === 1 ? '' : 'es'} carried` : ''}</span><button type="button" aria-label="close">x</button></header>`
    + `<nav>${TABS.map((x) => `<button type="button" data-tab="${x.id}">${x.label}${badge[x.id] ? `<b>${badge[x.id]}</b>` : ''}</button>`).join('')}</nav>`
    + `<div class="pages">${top.join('')}${TABS.map((x) => `<div class="page" data-page="${x.id}">${pages[x.id].join('')}</div>`).join('')}</div></div>`;
  const show = (id: JournalTab) => {
    store(TAB_KEY, id);
    el.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === id));
    el.querySelectorAll<HTMLElement>('[data-page]').forEach((p) => p.classList.toggle('on', p.dataset.page === id));
    if (id === 'letters') { store(SEEN_KEY, new Date().toISOString()); el.querySelector('[data-tab="letters"] b')?.remove(); }
    el.querySelector('.pages')!.scrollTop = 0;
  };
  show(tab);
  el.addEventListener('pointerdown', (e) => { if (e.target === el) closeJournal(); });
  el.querySelector('header button')!.addEventListener('click', closeJournal);
  el.addEventListener('keydown', (e) => e.stopPropagation());
  el.addEventListener('keyup', (e) => e.stopPropagation());
  el.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('button') as HTMLElement | null;
    if (!t) return;
    if (t.dataset.tab) { show(t.dataset.tab as JournalTab); return; }
    const a = v.actions;
    if (!a) return;
    if (t.dataset.for) a.vote(t.dataset.for, t.classList.contains('on') ? null : false);
    else if (t.dataset.against) a.vote(t.dataset.against, t.classList.contains('on') ? null : true);
    else if (t.dataset.give) a.give(t.dataset.give);
    else if (t.dataset.awaken) {
      // twice: the first press says what it means
      if (t.dataset.sure) { a.awaken(t.dataset.awaken); closeJournal(); }
      else { t.dataset.sure = '1'; t.textContent = 'SURE? A NEW PLAYER WAKES IN IT'; }
    }
    else if (t.dataset.send) {
      const input = t.parentElement?.querySelector<HTMLInputElement>('input[data-talk]');
      if (input?.value.trim()) { a.talk(t.dataset.send, input.value); input.value = ''; input.placeholder = 'sent; it reads it when your words reach it'; }
    }
  });
  document.body.appendChild(el);
  open = el;
}

/** Left / Right while the journal is open: the page before or after (the game's own keys stay with the game). */
export function stepJournalTab(dir: 1 | -1) {
  if (!open) return;
  const cur = open.querySelector<HTMLElement>('[data-tab].on')?.dataset.tab;
  const i = TABS.findIndex((x) => x.id === cur);
  const next = TABS[(i + dir + TABS.length) % TABS.length];
  open.querySelector<HTMLElement>(`[data-tab="${next.id}"]`)?.click();
}
