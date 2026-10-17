// What a copy tells you when you stop to talk: pages for the talk box, composed from its own words only (what it
// wants to tell you, its notes, its wants, its letters) plus a few plain words of framing. Pure: no Phaser, so it
// runs in Node too (the box passes a measure for its prose font).
import type { Letter, Note, Want } from '../net/store';

/** How a run of text is drawn: its own words (body), framing (lead, meta), your words (you), wants (mark, done), runes. */
export type Tone = 'body' | 'lead' | 'meta' | 'you' | 'mark' | 'done' | 'rune';
export interface Seg { text: string; tone: Tone }
export type Line = Seg[];
export type Section = 'SAYS' | 'THOUGHTS' | 'WANTS' | 'LETTERS' | '';
export interface TalkPage {
  /** stable across recomposing (section and page within it), so the box can stay on the page you were reading */
  key: string;
  section: Section;
  lines: Line[];
  /** a fresh word is being asked of the copy: the box shows it composing */
  composing?: boolean;
}

export interface Feeling { mood: 'content' | 'low' | 'bleak'; weariness: 'rested' | 'tired' | 'weary'; lonely: boolean; aimless: boolean }
/** You said something with R: your words, and its answer once it has one (null: no answer will come now). */
export interface Exchange { said: string; answer?: string | null }

export interface TalkInput {
  copyId: string;
  name: string;
  blank: boolean;
  canHear: boolean;
  /** the plain line shown above the runes until you can hear them */
  hint?: string;
  now: number;
  playerId?: string;
  /** what the copy wants to tell you (traits.tell, written by its mind) */
  tell?: { text: string; at: number };
  /** the tell came in while the box was open: no "it wanted to tell you" framing */
  tellNew?: boolean;
  composing?: boolean;
  /** null while the journal is still loading */
  notes: Note[] | null;
  mail: Letter[] | null;
  wants: Want[];
  feeling: Feeling;
  /** this visit's replies, oldest first */
  exchanges: Exchange[];
  /** a name and, for someone on another world, where they are */
  who(id: string | null): { name: string; where?: string };
}

export interface TalkLayout {
  width: number;
  lines: number;
  measure(text: string): number;
  thoughts?: number;
  lettersToYou?: number;
  staleMs?: number;
}

// ---------------------------------------------------------------- words

/** Curly quotes, dashes, ellipses and accents to plain ASCII; anything else outside it is dropped. */
export function normalize(text: string) {
  return text
    .replace(/[‘’‚‛′ʼ`]/g, "'")
    .replace(/[“”„‟″«»]/g, '"')
    .replace(/\s*[—―]\s*/g, ' - ')
    .replace(/[‐-–−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[{]/g, '(').replace(/[}]/g, ')')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e\n\t]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "just now", "20 minutes ago", "this morning", "last night", "yesterday", "3 days ago", "2 weeks ago". */
export function relTime(at: number | string, now: number) {
  const t = typeof at === 'string' ? Date.parse(at) : at;
  const min = (now - t) / 60_000;
  if (!Number.isFinite(min) || min < 2) return 'just now';
  if (min < 60) return `${Math.round(min)} minutes ago`;
  if (min < 150) return min < 90 ? 'an hour ago' : '2 hours ago';
  const d = new Date(t), n = new Date(now);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(n) - day(d)) / 86_400_000);
  const h = d.getHours();
  if (days === 0) return h < 5 ? 'last night' : h < 12 ? 'this morning' : h < 17 ? 'this afternoon' : h < 21 ? 'this evening' : 'tonight';
  if (days === 1) return h >= 20 && n.getHours() < 12 ? 'last night' : 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'a week ago';
  return `${Math.round(days / 7)} weeks ago`;
}

/** The ten rune glyphs of the prose font (the same ten as the song bubbles). */
const RUNE0 = 0xe000;
/** Same word, same runes: a line looks like one fixed thing you cannot read yet. */
export function runeText(text: string) {
  return text.split(' ').map((w) => {
    let h = 7;
    return [...w].map((c) => { h = (h * 31 + c.charCodeAt(0)) >>> 0; return String.fromCharCode(RUNE0 + (h % 10)); }).join('');
  }).join(' ');
}
export const MARK_OPEN = '', MARK_DONE = '';

// ---------------------------------------------------------------- layout

/** A paragraph: runs of text in tones. keep: never end a page on this paragraph (a lead line before its letter). */
interface Para { segs: Seg[]; keep?: boolean }
/** Paragraphs that belong together (one note, one letter): a page break avoids splitting it when it can. */
type Block = Para[];

/** Greedy word wrap of tone runs into lines no wider than width. */
export function wrap(segs: Seg[], width: number, measure: (s: string) => number): Line[] {
  const words: { text: string; tone: Tone }[] = [];
  for (const s of segs) for (const w of s.text.split(' ')) if (w) words.push({ text: w, tone: s.tone });
  const lines: Line[] = [];
  let line: Line = [], w = 0;
  const space = measure(' ');
  const push = (word: { text: string; tone: Tone }) => {
    const last = line[line.length - 1];
    if (last && last.tone === word.tone) last.text += ` ${word.text}`;
    else line.push({ text: line.length ? ` ${word.text}` : word.text, tone: word.tone });
  };
  for (const word of words) {
    // a word longer than a whole line: broken by letters onto lines of its own
    if (measure(word.text) > width) {
      if (line.length) { lines.push(line); line = []; w = 0; }
      let rest = word.text;
      while (measure(rest) > width) {
        let cut = rest.length - 1;
        while (cut > 1 && measure(rest.slice(0, cut)) > width) cut--;
        lines.push([{ text: rest.slice(0, cut), tone: word.tone }]);
        rest = rest.slice(cut);
      }
      word.text = rest;
    }
    const ww = measure(word.text);
    if (line.length && w + space + ww > width) { lines.push(line); line = []; w = 0; }
    w += (line.length ? space : 0) + ww;
    push(word);
  }
  if (line.length) lines.push(line);
  return lines;
}

/**
 * Lays blocks out on pages of `lines` lines. Between blocks sits a gap (an empty Line, half a line high), and a
 * block that would not fit in what is left of a page starts the next one when it fits there whole.
 */
function paginate(section: Section, keyBase: string, blocks: Block[], l: TalkLayout, composing = false): TalkPage[] {
  const cap = l.lines * 2 + 1; // in half lines: a line is two, a gap one
  const pages: Line[][] = [];
  let cur: Line[] = [], used = 0;
  const flush = () => { if (cur.some((ln) => ln.length)) pages.push(cur); cur = []; used = 0; };
  for (const block of blocks) {
    const rows: { line: Line; keep?: boolean }[] = [];
    for (const p of block) for (const line of wrap(p.segs, l.width, l.measure)) rows.push({ line, keep: p.keep });
    if (!rows.length) continue;
    if (cur.length && used + 1 + rows.length * 2 > cap && rows.length <= l.lines) flush();
    else if (cur.length) { cur.push([]); used += 1; }
    rows.forEach((r, i) => {
      if (used + 2 > cap) flush();
      // a lead line never sits alone at the bottom of a page
      if (r.keep && i < rows.length - 1 && used + 4 > cap) flush();
      cur.push(r.line);
      used += 2;
    });
  }
  flush();
  return pages.map((lines, i) => ({ key: `${keyBase}:${i}`, section, lines, composing: composing && i === 0 }));
}

// ---------------------------------------------------------------- the pages

/** Every page the box shows for this copy, in order: SAYS, THOUGHTS, WANTS, LETTERS (empty sections are skipped). */
export function composeTalk(t: TalkInput, l: TalkLayout): TalkPage[] {
  const name = normalize(t.name) || 'It';
  if (t.blank) return [{ key: 'blank:0', section: '', lines: [[{ text: '.   .   .', tone: 'meta' }]] }];
  // its words become runes until you can hear them; the framing stays plain (when, who)
  const own = (text: string, tone: Tone = 'body'): Seg => (t.canHear ? { text: normalize(text), tone } : { text: runeText(normalize(text)), tone: 'rune' });
  const plain = (text: string, tone: Tone = 'meta'): Seg => ({ text, tone });
  const pages: TalkPage[] = [];
  const hint: Block | null = !t.canHear && t.hint ? [{ segs: [plain(t.hint)] }] : null;

  // SAYS: what you said this visit and its answers (newest first), then what it wanted to tell you
  t.exchanges.forEach((x, i) => {
    const said: Para = { segs: [plain('You:', 'you'), { text: `"${normalize(x.said)}"`, tone: 'you' }] };
    const answer: Para = x.answer === undefined ? { segs: [plain(`${name} is thinking...`, 'lead')] }
      : x.answer === null ? { segs: [plain(`${name} keeps your letter. It will answer when it next wakes.`, 'lead')] }
        : { segs: [own(x.answer)] };
    pages.unshift(...paginate('SAYS', `x${i}`, [[said, answer]], l, x.answer === undefined));
  });
  const notes = [...(t.notes ?? [])].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  let usedNote: Note | undefined;
  const says: Block[] = hint ? [hint] : [];
  const staleMs = l.staleMs ?? 30 * 60_000;
  const tell = t.tell && normalize(t.tell.text) ? t.tell : undefined;
  if (tell) {
    const fresh = t.tellNew || t.now - tell.at < staleMs;
    says.push(fresh ? [{ segs: [own(tell.text)] }] : [{ segs: [plain(`${cap(relTime(tell.at, t.now))}, it wanted to tell you:`, 'lead')], keep: true }, { segs: [own(tell.text)] }]);
  } else if (t.notes === null) {
    says.push([{ segs: [plain('...', 'lead')] }]);
  } else if (notes.length) {
    usedNote = notes[0];
    says.push([{ segs: [plain(`From its notes, ${relTime(usedNote.created_at, t.now)}:`, 'lead')], keep: true }, { segs: [own(usedNote.body)] }]);
  } else {
    says.push([{ segs: [plain(`${name} has not written anything down yet.`, 'lead')] }]);
  }
  pages.push(...paginate('SAYS', 'says', says, l, !!t.composing));

  // THOUGHTS: its latest notes, each with when it wrote it
  const thoughts = notes.filter((n) => n !== usedNote).slice(0, l.thoughts ?? 4);
  if (thoughts.length) pages.push(...paginate('THOUGHTS', 'thoughts', thoughts.map((n) => [{ segs: [plain(`${cap(relTime(n.created_at, t.now))}:`), own(n.body)] }]), l));

  // WANTS: open ones first, finished ones marked, and one plain line of how it seems
  const wants = [...t.wants].sort((a, b) => Number(a.done) - Number(b.done));
  const wantBlocks: Block[] = wants.map((w) => [{ segs: w.done ? [plain(MARK_DONE, 'done'), own(w.text, 'done')] : [plain(MARK_OPEN, 'mark'), own(w.text)] }]);
  if (!wants.length) wantBlocks.push([{ segs: [plain(`${name} has not said what it wants yet.`, 'lead')] }]);
  wantBlocks.push([{ segs: [plain(feelingLine(name, t.feeling))] }]);
  pages.push(...paginate('WANTS', 'wants', wantBlocks, l));

  // LETTERS: to you first, then the latest it received and the latest it sent, with who and where
  const mail = [...(t.mail ?? [])].sort((a, b) => Date.parse(b.sent_at) - Date.parse(a.sent_at));
  const arrived = (m: Letter) => Date.parse(m.arrives_at) <= t.now;
  const toYou = mail.filter((m) => m.from_replicant === t.copyId && t.playerId && m.to_replicant === t.playerId).slice(0, l.lettersToYou ?? 2);
  const received = mail.find((m) => m.to_replicant === t.copyId && m.from_replicant !== t.playerId && arrived(m));
  const sent = mail.find((m) => m.from_replicant === t.copyId && m.to_replicant !== t.playerId);
  const whoAt = (id: string | null) => { const w = t.who(id); return w.where ? `${w.name}, at ${w.where}` : w.name; };
  const letters: Block[] = [
    ...toYou.map((m): Block => [{ segs: [plain(`A letter for you, ${relTime(m.sent_at, t.now)}:`, 'lead')], keep: true }, { segs: [own(m.body)] }]),
    ...(received ? [[{ segs: [plain(`From ${whoAt(received.from_replicant)}, ${relTime(received.arrives_at, t.now)}:`, 'lead')], keep: true }, { segs: [own(received.body)] }] as Block] : []),
    ...(sent ? [[{ segs: [plain(`To ${whoAt(sent.to_replicant)}, ${arrived(sent) ? `${relTime(sent.sent_at, t.now)}:` : 'still on its way:'}`, 'lead')], keep: true }, { segs: [own(sent.body)] }] as Block] : []),
  ];
  if (letters.length) pages.push(...paginate('LETTERS', 'letters', letters, l));
  return pages;
}

/** One plain line of how the copy seems right now, from its needs ("Glint seems tired and restless."). */
export function feelingLine(name: string, f: Feeling) {
  const parts: string[] = [];
  if (f.weariness === 'weary') parts.push('worn out');
  else if (f.weariness === 'tired') parts.push('tired');
  if (f.lonely) parts.push('lonely');
  if (f.aimless) parts.push('restless');
  if (!parts.length) parts.push(f.mood === 'content' ? 'content' : f.mood === 'low' ? 'a little low' : 'low');
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
  return `${name} seems ${list}.`;
}
