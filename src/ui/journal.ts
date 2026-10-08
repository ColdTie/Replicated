// The journal: what the copies on this planet remember, write to each other and ask for. An HTML panel over
// the canvas (Tab / I, or tap the corner label). Until the replicant can hear them, every line is runes.
import { PALETTE } from '../core/data';
import type { Journal, ReplicantSave } from '../net/store';
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
    width: min(560px, 92vw); max-height: 86vh; display: flex; flex-direction: column; }
  .jn header { display: flex; align-items: baseline; gap: 12px; padding: 14px 18px 8px; border-bottom: 1px solid ${css(PALETTE[23])}; }
  .jn h2 { margin: 0; font-size: 16px; letter-spacing: 3px; color: ${css(PALETTE[2])}; }
  .jn header span { color: ${css(PALETTE[21])}; font-size: 12px; flex: 1; }
  .jn header button { font: inherit; border: none; background: none; color: ${css(PALETTE[21])}; cursor: pointer; font-size: 18px; padding: 0 4px; }
  .jn .pages { overflow: auto; padding: 8px 18px 18px; }
  .jn h3 { margin: 14px 0 4px; font-size: 13px; letter-spacing: 2px; }
  .jn .k { color: ${css(PALETTE[21])}; font-size: 11px; letter-spacing: 1px; margin: 8px 0 2px; }
  .jn p { margin: 2px 0 2px 10px; }
  .jn p.in { color: ${css(PALETTE[19])}; }
  .jn p.ask { color: ${css(PALETTE[9])}; }
  .jn p.done { color: ${css(PALETTE[21])}; text-decoration: line-through; }
  .jn small { color: ${css(PALETTE[22])}; font-size: 11px; margin-left: 6px; }
  .jn .mute { color: ${css(PALETTE[21])}; font-style: italic; }
  .jn .rune { color: ${css(PALETTE[18])}; letter-spacing: 1px; }
  `;
  document.head.appendChild(s);
}

const RUNES = '/\\|-+=<>^~:';
/** Same text always scrambles the same way, so a line looks like one fixed thing you cannot read yet. */
function runes(text: string) {
  let h = 7;
  return text.split('').map((c) => {
    if (c === ' ') return ' ';
    h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return RUNES[h % RUNES.length];
  }).join('');
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
  return s < 90 ? `arrives in ${s} s` : `arrives in ${Math.round(s / 60)} min`;
}

const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));

export interface JournalView {
  place: string;
  canHear: boolean;
  copies: ReplicantSave[];
  /** names of replicants that are not on this planet, by id */
  names: Record<string, string>;
  journal: Journal;
  /** the warren, room by room (describeWarren); empty when nothing is dug or planned */
  warren?: string[];
  /** the planet's materials in words */
  supplies?: string;
  /** what waits on what */
  shortages?: string[];
  /** mood and low needs per copy id */
  feelings?: Record<string, string>;
}

let open: HTMLElement | null = null;
export const journalOpen = () => !!open;

export function closeJournal() {
  open?.remove();
  open = null;
}

export function openJournal(v: JournalView) {
  ensureStyle();
  closeJournal();
  const show = (t: string) => (v.canHear ? esc(t) : `<span class="rune">${esc(runes(t))}</span>`);
  const name = (id: string | null) => (id && (v.copies.find((c) => c.id === id)?.name ?? v.names[id])) ?? 'someone';
  const color = (c: ReplicantSave) => css(PALETTE[c.traits.feature ?? 10]);
  const parts: string[] = [];
  if (!v.canHear) parts.push(`<p class="mute">They sing, but you cannot read them yet. Something in the ruins listens.</p>`);
  if (!v.copies.length) parts.push(`<p class="mute">Nobody lives here yet.</p>`);
  for (const c of v.copies) {
    parts.push(`<h3 style="color:${color(c)}">${esc(c.name.toUpperCase())}</h3>`);
    const notes = v.journal.notes.filter((n) => n.replicant_id === c.id).slice(0, 8);
    const mail = v.journal.mail.filter((m) => m.from_replicant === c.id || m.to_replicant === c.id).slice(0, 8);
    const asks = v.journal.requests.filter((r) => r.replicant_id === c.id).slice(0, 5);
    const t = c.traits.temperament;
    if (c.traits.blank) parts.push(`<p class="mute">${v.canHear ? 'Not yet itself. It has not chosen.' : runes('not yet itself')}</p>`);
    else if (t) parts.push(`<p class="mute">${show(`${t.pace}, ${t.sociability}, ${t.work === 'balanced' ? 'works and wanders' : t.work}, ${t.bedtime} to bed, ${t.risk}`)}</p>`);
    if (v.feelings?.[c.id]) parts.push(`<p class="mute">${show(v.feelings[c.id])}</p>`);
    const wants = c.traits.wants ?? [];
    if (wants.length) {
      parts.push(`<div class="k">WANTS</div>`);
      for (const w of wants) parts.push(`<p class="${w.done ? 'done' : ''}">${show(w.text)}<small>${v.canHear ? esc(w.category) : runes(w.category)}</small></p>`);
    }
    if (!notes.length && !mail.length && !asks.length && !wants.length) parts.push(`<p class="mute">${v.canHear ? 'Nothing written yet.' : runes('nothing written yet')}</p>`);
    if (notes.length) {
      parts.push(`<div class="k">NOTES</div>`);
      for (const n of notes) parts.push(`<p>${show(n.body)}<small>${ago(n.created_at)}</small></p>`);
    }
    if (mail.length) {
      parts.push(`<div class="k">LETTERS</div>`);
      for (const m of mail) {
        const mine = m.from_replicant === c.id;
        const flight = inFlight(m.arrives_at);
        const head = mine ? `to ${esc(name(m.to_replicant))}` : `from ${esc(name(m.from_replicant))}`;
        parts.push(`<p class="${mine ? '' : 'in'}">${v.canHear ? esc(head) : runes(head)}: ${show(m.body)}<small>${flight || ago(m.sent_at)}</small></p>`);
      }
    }
    if (asks.length) {
      parts.push(`<div class="k">ASKS FOR</div>`);
      for (const r of asks) {
        const label = r.kind === 'skin' ? 'A NEW BODY' : r.kind === 'name' ? 'A NAME' : r.kind.toUpperCase();
        parts.push(`<p class="${r.status === 'open' ? 'ask' : 'done'}">${v.canHear ? esc(label) : runes(label)}: ${show(r.detail)}<small>${ago(r.created_at)}</small></p>`);
      }
    }
  }
  if (v.warren?.length) {
    parts.push(`<h3 style="color:${css(PALETTE[2])}">THE WARREN</h3>`);
    for (const line of v.warren) parts.push(`<p>${show(line.replace(/^- /, ''))}</p>`);
  }
  if (v.supplies) {
    parts.push(`<h3 style="color:${css(PALETTE[2])}">SUPPLIES</h3><p>${esc(v.supplies)}</p>`);
    for (const line of v.shortages ?? []) parts.push(`<p class="ask">${show(line)}</p>`);
  }
  const el = document.createElement('div');
  el.className = 'jn';
  el.innerHTML = `<div class="book"><header><h2>JOURNAL</h2><span>${esc(v.place)}</span><button type="button" aria-label="close">x</button></header><div class="pages">${parts.join('')}</div></div>`;
  el.addEventListener('pointerdown', (e) => { if (e.target === el) closeJournal(); });
  el.querySelector('button')!.addEventListener('click', closeJournal);
  document.body.appendChild(el);
  open = el;
}
