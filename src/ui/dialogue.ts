// The talk box: a dark panel across the bottom of the screen with the copy's portrait, its name in its visor
// color, what it says typed out in its own voice, page dots and a blinking chevron. Pages come from talk.ts;
// PlanetScene decides what to show and routes the buttons here. Drawn in UIScene at 1x (never scaled).
import Phaser from 'phaser';
import { sound } from '../audio/Sound';
import { anim } from '../core/assets';
import { PALETTE } from '../core/data';
import { Gear } from '../entities/Gear';
import TALK from '../data/talk.json';
import { paletteCss as css } from './overlay';
import type { Line, Section, TalkPage, Tone } from './talk';

/** Who you are talking to, read at draw time (a rename or a becoming can change any of it mid-talk). */
export interface TalkWho {
  name(): string;
  /** visor light (palette color) */
  color(): number;
  look(): { key: string; anchors: [number, number][]; gear: number; gearTint: number; model: string; blank: boolean };
  seed: number;
  voice(): { instrument?: string; mood?: string } | undefined;
}

const TONES: Record<Tone, number> = {
  body: PALETTE[2], lead: PALETTE[21], meta: PALETTE[21], you: PALETTE[20], mark: PALETTE[2], done: PALETTE[22], rune: PALETTE[18],
};
const LABEL: Record<Section, string> = { SAYS: 'SAYS', THOUGHTS: 'THOUGHTS', WANTS: 'WANTS', LETTERS: 'LETTERS', '': '' };
const GAP_PX = 6;

/** Text of a page, flattened (what typing counts through). */
const pageText = (p: TalkPage) => p.lines.map((l) => l.map((s) => s.text).join('')).join('\n');

export class TalkBox {
  readonly x: number; readonly y: number; readonly w: number; readonly h: number;
  /** where the prose starts and how wide it may run */
  readonly tx: number; readonly ty: number; readonly tw: number;
  private root: Phaser.GameObjects.Container;
  private frame: Phaser.GameObjects.Graphics;
  private nameText: Phaser.GameObjects.BitmapText;
  private label: Phaser.GameObjects.BitmapText;
  private replyHint: Phaser.GameObjects.BitmapText;
  private deco: Phaser.GameObjects.Graphics;
  private portrait: Phaser.GameObjects.Sprite;
  private gear: Gear;
  private visorGlow: Phaser.GameObjects.Image;
  private textLayer: Phaser.GameObjects.Container;
  private segs: { obj: Phaser.GameObjects.BitmapText; text: string; start: number }[] = [];
  private who: TalkWho | null = null;
  private pages: TalkPage[] = [];
  private index = 0;
  private shown = 0;
  private total = 0;
  private holdUntil = 0;
  private fresh = new Set<string>();
  private lookKey = '';
  private anchors: [number, number][] = [];
  private nextLookCheck = 0;
  private openTween?: Phaser.Tweens.Tween;
  /** the reader may reply (R): shows the small REPLY under the text once a page is typed */
  canReply = false;
  set replyLabel(t: string) { this.replyHint.setText(t); }
  isOpen = false;

  constructor(private scene: Phaser.Scene) {
    const { width, height } = scene.scale;
    const b = TALK.box;
    this.w = width - b.margin * 2; this.h = b.height;
    this.x = b.margin; this.y = height - b.margin - b.height;
    this.tx = 66; this.ty = 21; this.tw = this.w - this.tx - 12;
    this.frame = scene.add.graphics();
    this.deco = scene.add.graphics();
    this.visorGlow = scene.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.32).setScale(0.32);
    this.portrait = scene.add.sprite(0, 0, '__DEFAULT').setOrigin(0.5, 1).setScale(2);
    this.gear = new Gear(scene, this.portrait, 'replicant', 0, 0xffffff, []);
    this.nameText = scene.add.bitmapText(this.tx, 8, 'pixel', '');
    this.label = scene.add.bitmapText(this.w - 11, 8, 'pixel', '').setOrigin(1, 0).setTint(PALETTE[22]);
    this.replyHint = scene.add.bitmapText(this.tx, this.h - 12, 'pixel', 'R  REPLY').setTint(PALETTE[23]).setVisible(false);
    this.textLayer = scene.add.container(this.tx, this.ty);
    this.root = scene.add.container(this.x, this.y, [this.frame, this.visorGlow, this.portrait, this.gear.image, this.deco, this.nameText, this.label, this.replyHint, this.textLayer])
      .setDepth(100).setVisible(false);
    this.drawFrame();
  }

  /** Width in px of a run of prose (for wrapping), from the prose font's own advances. */
  measure = (text: string) => {
    const chars = (this.scene.cache.bitmapFont.get('prose')?.data as { chars: Record<number, { xAdvance: number }> } | undefined)?.chars;
    let w = 0;
    for (const c of text) w += chars?.[c.charCodeAt(0)]?.xAdvance ?? 0;
    return w;
  };

  get page() { return this.pages[this.index]; }
  get pageKey() { return this.page?.key; }
  get pageCount() { return this.pages.length; }
  get typing() { return this.shown < this.total; }

  /** The box's text area in game pixels (the reply input sits over it). */
  get textRect() { return { x: this.x + this.tx - 2, y: this.y + this.ty - 2, w: this.tw + 4, h: this.h - this.ty - 4 }; }

  /** Is this screen point on the REPLY hint? (touch and mouse can tap it) */
  hitReply(px: number, py: number) {
    if (!this.isOpen || !this.replyHint.visible) return false;
    const x = this.x + this.replyHint.x, y = this.y + this.replyHint.y;
    return px >= x - 4 && px <= x + this.replyHint.width + 4 && py >= y - 4 && py <= y + 12;
  }

  show(who: TalkWho, pages: TalkPage[]) {
    this.who = who;
    this.pages = pages;
    this.index = 0;
    this.fresh.clear();
    this.lookKey = '';
    this.isOpen = true;
    this.root.setVisible(true).setAlpha(0);
    this.openTween?.stop();
    const slide = { v: 0 };
    this.openTween = this.scene.tweens.add({
      targets: slide, v: 1, duration: 180, ease: 'Sine.easeOut',
      onUpdate: () => { this.root.setAlpha(slide.v).setY(this.y + Math.round((1 - slide.v) * 8)); },
    });
    this.refreshLook(true);
    this.startPage();
  }

  hide() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.who = null;
    this.openTween?.stop();
    const slide = { v: 1 };
    this.openTween = this.scene.tweens.add({
      targets: slide, v: 0, duration: 140, ease: 'Sine.easeIn',
      onUpdate: () => { this.root.setAlpha(slide.v).setY(this.y + Math.round((1 - slide.v) * 6)); },
      onComplete: () => { this.root.setVisible(false); this.clearText(); },
    });
  }

  /**
   * New pages (the journal came in, a fresh word, an answer). The reader stays on the page they were on; if its
   * words changed it types again from where they differ, and a changed page they are not on is marked new.
   */
  setPages(pages: TalkPage[], jumpTo?: string) {
    const before = new Map(this.pages.map((p) => [p.key, pageText(p)]));
    const curKey = this.pageKey, curText = this.page ? pageText(this.page) : '';
    this.pages = pages;
    for (const p of pages) if (p.key !== curKey && before.has(p.key) && before.get(p.key) !== pageText(p)) this.fresh.add(p.key);
    let i = pages.findIndex((p) => p.key === (jumpTo ?? curKey));
    if (i < 0) i = Math.min(this.index, pages.length - 1);
    const sameKey = pages[i]?.key === curKey;
    this.index = Math.max(0, i);
    const text = this.page ? pageText(this.page) : '';
    if (sameKey && text === curText) { this.layoutPage(this.shown); return; }
    let common = 0;
    if (sameKey) while (common < text.length && text[common] === curText[common]) common++;
    this.startPage(sameKey ? Math.min(this.shown, common) : 0);
  }

  /** Space / E / click: finish the page if it is still typing, else the next page. False on the last page (close). */
  advance() {
    if (this.typing) { this.shown = this.total; this.layoutPage(this.shown); return true; }
    if (this.index >= this.pages.length - 1) return false;
    this.index++;
    this.startPage();
    return true;
  }

  forward() {
    if (this.typing) { this.shown = this.total; this.layoutPage(this.shown); return; }
    if (this.index < this.pages.length - 1) { this.index++; this.startPage(); }
  }

  back() {
    if (this.index <= 0) { if (this.typing) { this.shown = this.total; this.layoutPage(this.shown); } return; }
    this.index--;
    // a page you already read comes back whole
    this.startPage(Infinity);
  }

  /** Jump to a page by key (a reply's answer). */
  goTo(key: string) {
    const i = this.pages.findIndex((p) => p.key === key);
    if (i < 0 || i === this.index) return;
    this.index = i;
    this.startPage();
  }

  private clearText() {
    for (const s of this.segs) s.obj.destroy();
    this.segs = [];
  }

  private startPage(shown = 0) {
    const p = this.page;
    this.fresh.delete(p?.key ?? '');
    this.clearText();
    if (!p) { this.total = 0; this.shown = 0; return; }
    let start = 0, y = 0;
    p.lines.forEach((line: Line, li) => {
      if (!line.length) { y += GAP_PX; start += 1; return; }
      let x = 0;
      for (const s of line) {
        const obj = this.scene.add.bitmapText(x, y, 'prose', '').setTint(s.tone === 'rune' ? this.who?.color() ?? TONES.rune : TONES[s.tone]);
        this.textLayer.add(obj);
        this.segs.push({ obj, text: s.text, start });
        start += s.text.length;
        x += this.measure(s.text);
      }
      y += TALK.box.linePx;
      if (li < p.lines.length - 1) start += 1; // the line break counts as a character, like pageText
    });
    this.total = start;
    this.shown = Math.min(shown, this.total);
    this.holdUntil = 0;
    this.layoutPage(this.shown);
  }

  private layoutPage(shown: number) {
    for (const s of this.segs) s.obj.setText(s.text.slice(0, Math.max(0, Math.floor(shown) - s.start)));
  }

  private refreshLook(force = false) {
    const who = this.who;
    if (!who) return;
    const look = who.look();
    const id = `${look.key}|${look.gear}|${look.gearTint}|${look.blank}`;
    if (!force && id === this.lookKey) return;
    this.lookKey = id;
    this.portrait.setTexture(look.key, 0).play(anim(look.key, 'idle'));
    if (look.blank) this.portrait.setTint(0x7a7f96); else this.portrait.clearTint();
    this.anchors = look.anchors;
    this.gear.setAnchors(look.anchors);
    this.gear.setFrame(look.gear, look.gearTint);
  }

  update(time: number, dt: number) {
    if (!this.root.visible || !this.who && !this.isOpen) return;
    const who = this.who;
    // typing: about charsPerSecond, holding a beat after punctuation, a blip of the copy's voice per letter
    if (this.isOpen && who && this.typing && time >= this.holdUntil) {
      const before = Math.floor(this.shown);
      this.shown = Math.min(this.total, this.shown + (dt * TALK.charsPerSecond) / 1000);
      const text = pageText(this.page);
      for (let i = before; i < Math.floor(this.shown); i++) {
        const c = text[i];
        const pause = (TALK.pauseMs as Record<string, number>)[c];
        if (pause && (text[i + 1] === ' ' || text[i + 1] === '\n')) { this.shown = i + 1; this.holdUntil = time + pause; break; }
        if (c && /[A-Za-z0-9-]/.test(c)) sound.blip(who.seed, who.voice(), c);
      }
      this.layoutPage(this.shown);
    }
    if (who && time > this.nextLookCheck) { this.nextLookCheck = time + 250; this.refreshLook(); }
    this.drawLive(time);
  }

  /** Name, label, portrait position, dots, chevron: everything that can change while the box is open. */
  private drawLive(time: number) {
    const who = this.who;
    if (who) {
      const color = who.color();
      this.nameText.setText(who.name().toUpperCase()).setTint(color);
      const sec = this.page?.section ?? '';
      this.label.setText(LABEL[sec]);
      this.visorGlow.setTint(color);
    }
    // portrait: feet on the frame's floor, the visor glow on its head
    const px = 6 + 26, floor = this.h - 13;
    this.portrait.setPosition(px, floor);
    this.gear.sync();
    const fi = Number(this.portrait.frame.name) || 0;
    const [ax, ay] = this.anchors[fi] ?? [8, 6];
    this.visorGlow.setPosition(px - 16 + ax * 2 + 1, floor - 40 + ay * 2 + 1);

    const g = this.deco;
    g.clear();
    const typed = !this.typing;
    // page dots, right-aligned before the chevron, a little gap between sections
    const n = this.pages.length;
    let x = this.w - 24;
    const y = this.h - 9;
    for (let i = n - 1; i >= 0; i--) {
      const p = this.pages[i];
      const cur = i === this.index;
      g.fillStyle(cur ? who?.color() ?? PALETTE[20] : this.fresh.has(p.key) ? PALETTE[10] : PALETTE[23], 1).fillRect(x, y, 2, 2);
      x -= 5;
      if (i > 0 && this.pages[i - 1].section !== p.section) x -= 3;
    }
    // the chevron blinks once the page is typed; on the last page it is a small square (this closes it)
    const cx = this.w - 15, cy = this.h - 10;
    if (typed && n && Math.floor(time / 420) % 3 !== 2) {
      if (this.index < n - 1) g.fillStyle(PALETTE[2], 1).fillRect(cx, cy, 5, 1).fillRect(cx + 1, cy + 1, 3, 1).fillRect(cx + 2, cy + 2, 1, 1);
      else g.fillStyle(PALETTE[21], 1).fillRect(cx + 1, cy, 3, 3);
    }
    // composing: three dots before the section label take turns to light
    if (this.page?.composing) {
      const lx = this.w - 11 - this.label.width - 12;
      const k = Math.floor(time / 260) % 4;
      for (let i = 0; i < 3; i++) g.fillStyle(i === k ? who?.color() ?? PALETTE[20] : PALETTE[23], 1).fillRect(lx + i * 3, 13, 2, 2);
    }
    this.replyHint.setVisible(this.canReply && typed && !this.page?.composing);
  }

  /** The panel and the portrait frame: navy at 0.92, a 1px light border, the corners cut. */
  private drawFrame() {
    const g = this.frame, w = this.w, h = this.h;
    g.clear();
    const cut = (x: number, y: number, ww: number, hh: number, fill: number, alpha: number, line: number) => {
      g.fillStyle(fill, alpha).fillRect(x + 1, y + 1, ww - 2, hh - 2);
      g.fillStyle(line, 1)
        .fillRect(x + 2, y, ww - 4, 1).fillRect(x + 2, y + hh - 1, ww - 4, 1)
        .fillRect(x, y + 2, 1, hh - 4).fillRect(x + ww - 1, y + 2, 1, hh - 4)
        .fillRect(x + 1, y + 1, 1, 1).fillRect(x + ww - 2, y + 1, 1, 1).fillRect(x + 1, y + hh - 2, 1, 1).fillRect(x + ww - 2, y + hh - 2, 1, 1);
    };
    cut(0, 0, w, h, PALETTE[25], 0.92, PALETTE[22]);
    // a faint inner line under the top edge: the panel reads as a raised plate
    g.fillStyle(PALETTE[23], 0.6).fillRect(3, 2, w - 6, 1);
    // the portrait's frame, a little lighter, with a floor line under the feet
    cut(6, 6, 52, h - 12, PALETTE[24], 1, PALETTE[23]);
    g.fillStyle(PALETTE[25], 0.6).fillRect(16, h - 14, 32, 2);
    // a dotted rule under the name
    for (let x = this.tx; x < w - 10; x += 2) g.fillStyle(PALETTE[23], 1).fillRect(x, 17, 1, 1);
  }
}

// ---------------------------------------------------------------- the reply line

let styled = false;
function ensureStyle() {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = `
  .talk-reply { position: fixed; inset: 0; z-index: 11; }
  .talk-reply input { position: fixed; font-family: ui-monospace, Menlo, Consolas, monospace; background: ${css(PALETTE[25])};
    color: ${css(PALETTE[20])}; border: 1px solid ${css(PALETTE[22])}; outline: none; box-sizing: border-box; padding: 0 0.6em; }
  .talk-reply input:focus { border-color: ${css(PALETTE[9])}; }
  .talk-reply input::placeholder { color: ${css(PALETTE[22])}; }
  `;
  document.head.appendChild(s);
}

/**
 * A one-line text input over the talk box (styled like the journal's): Enter sends, Esc cancels, a tap outside
 * cancels. Keys typed here never reach the game. Returns close().
 */
export function openReplyInput(canvas: HTMLCanvasElement, rect: { x: number; y: number; w: number; h: number }, placeholder: string, onSend: (text: string) => void, onClose: () => void) {
  ensureStyle();
  const r = canvas.getBoundingClientRect();
  const k = r.width / canvas.width;
  const root = document.createElement('div');
  root.className = 'talk-reply';
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 200;
  input.placeholder = placeholder;
  const h = Math.round(18 * k);
  Object.assign(input.style, {
    left: `${Math.round(r.left + rect.x * k)}px`, top: `${Math.round(r.top + (rect.y + rect.h - 20) * k)}px`,
    width: `${Math.round(rect.w * k)}px`, height: `${h}px`, fontSize: `${Math.max(12, Math.round(h * 0.5))}px`,
  });
  root.appendChild(input);
  let closed = false;
  const close = () => { if (closed) return; closed = true; root.remove(); onClose(); };
  root.addEventListener('pointerdown', (e) => { if (e.target === root) close(); });
  for (const ev of ['keydown', 'keyup', 'keypress'] as const) root.addEventListener(ev, (e) => e.stopPropagation());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Enter') { e.preventDefault(); const t = input.value.trim(); close(); if (t) onSend(t); }
  });
  document.body.appendChild(root);
  setTimeout(() => input.focus(), 0);
  return close;
}
