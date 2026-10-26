// The planet menu (story/STORY.md "Planet menu": two views of the same information): an HTML list beside the 3D star
// map. Two groups, RECENT (worlds with a save, newest first) and CLOSEST (by distance from where you are); a row opens
// its details. Picking a row selects that planet on the map; picking on the map selects its row. Mouse, keyboard
// (Up / Down or W / S move, Enter or Space opens a row, L shows or hides the list, Esc hides it) and touch.
import { PALETTE } from '../core/data';
import { paletteCss as css } from './overlay';

export interface PlanetEntry { star: string; planet: number; name: string; sub: string; details: string[]; mark?: string }
export interface PlanetGroups { recent: PlanetEntry[]; closest: PlanetEntry[] }

let styled = false;
function ensureStyle() {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = `
  .pm { position: fixed; z-index: 8; display: flex; flex-direction: column; font: 12px/1.35 ui-monospace, Menlo, Consolas, monospace;
    color: ${css(PALETTE[20])}; background: ${css(PALETTE[25])}e6; border: 1px solid ${css(PALETTE[23])}; box-sizing: border-box;
    touch-action: pan-y; user-select: none; -webkit-user-select: none; }
  .pm.off .pm-list { display: none; }
  .pm.off { background: transparent; border-color: transparent; }
  .pm-head { display: flex; align-items: center; gap: 6px; padding: 6px 8px; cursor: pointer; letter-spacing: 2px; color: ${css(PALETTE[2])};
    background: ${css(PALETTE[24])}; border: 1px solid ${css(PALETTE[22])}; min-height: 32px; box-sizing: border-box; }
  .pm-head b { font-weight: normal; color: ${css(PALETTE[21])}; margin-left: auto; }
  .pm-list { overflow-y: auto; flex: 1; padding: 4px 0 8px; }
  .pm-group { padding: 8px 10px 4px; color: ${css(PALETTE[22])}; letter-spacing: 2px; font-size: 11px; }
  .pm-row { padding: 6px 10px; min-height: 34px; box-sizing: border-box; cursor: pointer; border-left: 3px solid transparent; }
  .pm-row:hover { background: ${css(PALETTE[24])}; }
  .pm-row.on { background: ${css(PALETTE[23])}; border-left-color: ${css(PALETTE[19])}; }
  .pm-row .n { color: ${css(PALETTE[19])}; display: flex; gap: 6px; }
  .pm-row .n i { font-style: normal; color: ${css(PALETTE[10])}; margin-left: auto; }
  .pm-row .s { color: ${css(PALETTE[21])}; font-size: 11px; }
  .pm-row .d { display: none; margin-top: 6px; padding-top: 6px; border-top: 1px solid ${css(PALETTE[22])}; color: ${css(PALETTE[20])}; font-size: 11px; }
  .pm-row.open .d { display: block; }
  .pm-row .d div { padding: 1px 0; }
  `;
  document.head.appendChild(s);
}

export class PlanetMenu {
  readonly root: HTMLDivElement;
  private list: HTMLDivElement;
  private count: HTMLElement;
  private rows: { el: HTMLDivElement; e: PlanetEntry }[] = [];
  private index = -1;
  private open: boolean;
  private onKey = (ev: KeyboardEvent) => this.key(ev);
  private onResize = () => this.place();

  constructor(private canvas: HTMLCanvasElement, private onPick: (star: string, planet: number) => void, private onToggle: () => void) {
    ensureStyle();
    this.root = document.createElement('div');
    this.root.className = 'pm';
    const head = document.createElement('div');
    head.className = 'pm-head';
    head.innerHTML = '&#9776; PLANETS <b></b>';
    this.count = head.querySelector('b')!;
    head.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.toggle(); });
    this.list = document.createElement('div');
    this.list.className = 'pm-list';
    this.root.append(head, this.list);
    // taps on the panel never reach the map below
    for (const t of ['pointerdown', 'pointerup', 'wheel', 'touchstart']) this.root.addEventListener(t, (e) => e.stopPropagation());
    document.body.appendChild(this.root);
    this.open = canvas.getBoundingClientRect().width >= 760;
    this.root.classList.toggle('off', !this.open);
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('resize', this.onResize);
    this.place();
  }

  get isOpen() { return this.open; }
  /** The panel's width in game pixels (the map makes room for it). */
  widthIn(gameWidth: number) {
    const r = this.canvas.getBoundingClientRect();
    return this.open ? Math.round(this.root.getBoundingClientRect().width * (gameWidth / r.width)) : 0;
  }

  /** Beside the map: the left part of the canvas, under the back button. */
  private place() {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.min(300, Math.max(190, r.width * 0.3));
    Object.assign(this.root.style, { left: `${r.left + 6}px`, top: `${r.top + r.height * 0.11}px`, width: `${this.open ? w : 132}px`, height: this.open ? `${r.height * 0.86}px` : 'auto' });
  }

  toggle(force?: boolean) {
    this.open = force ?? !this.open;
    this.root.classList.toggle('off', !this.open);
    this.place();
    this.onToggle();
  }

  setGroups(g: PlanetGroups) {
    const keep = this.index >= 0 ? this.rows[this.index]?.e : undefined;
    this.list.innerHTML = '';
    this.rows = [];
    const group = (title: string, entries: PlanetEntry[]) => {
      if (!entries.length) return;
      const h = document.createElement('div');
      h.className = 'pm-group';
      h.textContent = title;
      this.list.append(h);
      for (const e of entries) {
        const el = document.createElement('div');
        el.className = 'pm-row';
        el.innerHTML = `<div class="n"></div><div class="s"></div><div class="d"></div>`;
        const n = el.querySelector('.n')!;
        n.textContent = e.name;
        if (e.mark) { const i = document.createElement('i'); i.textContent = e.mark; n.append(i); }
        el.querySelector('.s')!.textContent = e.sub;
        const d = el.querySelector('.d')!;
        for (const line of e.details) { const x = document.createElement('div'); x.textContent = line; d.append(x); }
        const k = this.rows.length;
        el.addEventListener('pointerup', () => this.choose(k, true));
        this.list.append(el);
        this.rows.push({ el, e });
      }
    };
    group('RECENT', g.recent);
    group('CLOSEST', g.closest);
    this.count.textContent = String(new Set(this.rows.map((r) => `${r.e.star}:${r.e.planet}`)).size);
    this.index = keep ? this.rows.findIndex((r) => r.e.star === keep.star && r.e.planet === keep.planet) : -1;
    this.paint(false);
  }

  /** The map picked a star (planet undefined: its first row) or a planet: that row lights up and opens. */
  select(star: string, planet?: number) {
    const k = this.rows.findIndex((r) => r.e.star === star && (planet === undefined || r.e.planet === planet));
    this.index = k;
    this.paint(true);
  }

  private choose(k: number, fromUser: boolean) {
    if (k < 0 || k >= this.rows.length) return;
    this.index = k;
    this.paint(true);
    if (fromUser) this.onPick(this.rows[k].e.star, this.rows[k].e.planet);
  }

  private paint(scroll: boolean) {
    this.rows.forEach((r, k) => { r.el.classList.toggle('on', k === this.index); r.el.classList.toggle('open', k === this.index); });
    if (scroll && this.index >= 0) this.rows[this.index].el.scrollIntoView({ block: 'nearest' });
  }

  private key(ev: KeyboardEvent) {
    if (ev.target instanceof HTMLInputElement) return;
    const k = ev.code;
    if (k === 'KeyL') { this.toggle(); ev.stopPropagation(); return; }
    if (!this.open) return;
    const move = k === 'ArrowDown' || k === 'KeyS' ? 1 : k === 'ArrowUp' || k === 'KeyW' ? -1 : 0;
    if (move) { this.choose(Math.max(0, Math.min(this.rows.length - 1, (this.index < 0 ? -1 : this.index) + move)), true); ev.preventDefault(); ev.stopPropagation(); return; }
    if ((k === 'Enter' || k === 'Space') && this.index >= 0) { this.choose(this.index, true); ev.preventDefault(); ev.stopPropagation(); return; }
    if (k === 'Escape') { this.toggle(false); ev.preventDefault(); ev.stopPropagation(); }
  }

  destroy() {
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('resize', this.onResize);
    this.root.remove();
  }
}
