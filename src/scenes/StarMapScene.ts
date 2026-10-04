// Star map of real nearby stars, drawn as a rotatable 3D point cloud in pixel style.
// Drag to rotate, pinch / scroll to zoom, tap a star to select it. Toggles show where the family's
// replicants are, which stars have been found, and the beacons.
//  - mode 'pick':    opened from the vessel; LAUNCH sends 'starmap-launch' with the chosen star id
//  - mode 'transit': shows a journey in progress with a countdown; LAND when it has arrived
import Phaser from 'phaser';
import { PALETTE, STARS, TRAVEL, planetOfStar, starById, type StarDef } from '../core/data';
import { session } from '../core/session';
import type { Journey, ReplicantPin } from '../net/store';

interface PickData { mode: 'pick'; from: string; embers: number }
interface TransitData { mode: 'transit'; journey: Journey }
export type StarMapData = PickData | TransitData;

const TYPE_COLOR: Record<string, number> = { M: 8, K: 9, G: 11, F: 20, A: 18, D: 21 };

export const lyBetween = (a: StarDef, b: StarDef) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const travelMinutes = (ly: number) => Math.round(ly * TRAVEL.minutesPerLy);
export const fuelCost = (ly: number) => Math.ceil(ly * TRAVEL.embersPerLy);
export function formatDuration(ms: number) {
  const m = Math.max(0, Math.ceil(ms / 60000));
  if (m < 60) return `${m}M`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}H ${m % 60}M` : `${Math.floor(h / 24)}D ${h % 24}H`;
}

export class StarMapScene extends Phaser.Scene {
  private data0!: StarMapData;
  private g!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.BitmapText[] = [];
  private info!: Phaser.GameObjects.BitmapText;
  private info2!: Phaser.GameObjects.BitmapText;
  private actionBtn!: Phaser.GameObjects.Container;
  private actionText!: Phaser.GameObjects.BitmapText;
  private yaw = 0.6;
  private pitch = 1.05;
  private zoom = 9;           // pixels per light year
  private focus = new Phaser.Math.Vector3();
  private focusTarget = new Phaser.Math.Vector3();
  private selected: StarDef | null = null;
  private here!: StarDef;
  private discovered = new Set<string>(['sol']);
  private pins: ReplicantPin[] = [];
  private journeys: Journey[] = [];
  private show = { copies: true, found: true, beacons: true };
  private drag: { x: number; y: number; moved: number } | null = null;
  private pinch = 0;
  private projected: { s: StarDef; x: number; y: number; depth: number; persp: number }[] = [];
  private t = 0;

  constructor() { super('starmap'); }

  init(data: StarMapData) {
    this.data0 = data;
    this.here = starById(data.mode === 'pick' ? data.from : data.journey.from_star) ?? STARS[0];
    this.selected = data.mode === 'transit' ? starById(data.journey.to_star) ?? null : null;
    const f = this.selected ?? this.here;
    this.focus.set(f.x, f.y, f.z);
    this.focusTarget.copy(this.focus);
    this.labels = [];
  }

  create() {
    const { width: w, height: h } = this.scale;
    this.cameras.main.setBackgroundColor(PALETTE[25]);
    this.cameras.main.fadeIn(400, 24, 20, 37);
    this.g = this.add.graphics();

    // header and info
    this.add.bitmapText(w / 2, 8, 'pixel', this.data0.mode === 'transit' ? 'IN TRANSIT' : 'STAR MAP').setOrigin(0.5, 0).setTint(PALETTE[2]);
    this.info = this.add.bitmapText(8, h - 30, 'pixel', '').setTint(PALETTE[20]);
    this.info2 = this.add.bitmapText(8, h - 18, 'pixel', '').setTint(PALETTE[21]);

    // overlay toggles
    const chips: [keyof typeof this.show, string, number][] = [['copies', 'COPIES', 10], ['found', 'FOUND', 18], ['beacons', 'BEACONS', 9]];
    chips.forEach(([k, label, color], i) => {
      const t = this.add.bitmapText(8, 8 + i * 12, 'pixel', label).setTint(PALETTE[color]).setInteractive({ useHandCursor: true });
      const refresh = () => t.setAlpha(this.show[k] ? 1 : 0.35);
      t.on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, e: Phaser.Types.Input.EventData) => { e.stopPropagation(); this.show[k] = !this.show[k]; refresh(); });
      refresh();
    });

    // close / back
    const close = this.add.bitmapText(w - 8, 8, 'pixel', this.data0.mode === 'transit' ? 'BACK' : 'CLOSE').setOrigin(1, 0).setTint(PALETTE[21]).setInteractive({ useHandCursor: true });
    close.on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, e: Phaser.Types.Input.EventData) => { e.stopPropagation(); this.leave(); });

    // big action button (LAUNCH / LAND)
    const ring = this.add.rectangle(0, 0, 84, 26, PALETTE[9], 0.9).setStrokeStyle(2, PALETTE[10]);
    this.actionText = this.add.bitmapText(0, 0, 'pixel', 'LAUNCH').setOrigin(0.5).setTint(PALETTE[25]);
    this.actionBtn = this.add.container(w - 52, h - 22, [ring, this.actionText]).setSize(84, 26).setInteractive({ useHandCursor: true }).setVisible(false);
    this.actionBtn.on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, e: Phaser.Types.Input.EventData) => { e.stopPropagation(); this.act(); });

    // input: rotate, zoom, select
    this.input.addPointer(1);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { this.drag = { x: p.x, y: p.y, moved: 0 }; });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const a = this.input.pointer1, b = this.input.pointer2;
      if (a.isDown && b.isDown) {
        const d = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
        if (this.pinch) this.zoom = Phaser.Math.Clamp(this.zoom * (d / this.pinch), 2.5, 40);
        this.pinch = d;
        if (this.drag) this.drag.moved = 99;
        return;
      }
      if (!this.drag || !p.isDown) return;
      const dx = p.x - this.drag.x, dy = p.y - this.drag.y;
      this.drag.moved += Math.abs(dx) + Math.abs(dy);
      this.yaw += dx * 0.012;
      this.pitch = Phaser.Math.Clamp(this.pitch - dy * 0.01, 0.15, 1.5);
      this.drag.x = p.x; this.drag.y = p.y;
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.drag && this.drag.moved < 6) this.pick(p.x, p.y);
      this.drag = null;
      this.pinch = 0;
    });
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => { this.zoom = Phaser.Math.Clamp(this.zoom * (dy > 0 ? 0.9 : 1.1), 2.5, 40); });

    void this.loadOverlays();
    this.updateInfo();
    (window as unknown as { __map: StarMapScene }).__map = this;
  }

  private async loadOverlays() {
    const st = session.store;
    if (!st) return;
    try {
      const [found, { pins, journeys }] = await Promise.all([st.listDiscovered(), st.listPins()]);
      found.forEach((f) => this.discovered.add(f));
      for (const p of pins) if (p.status !== 'in_transit') this.discovered.add(p.star_id);
      this.pins = pins;
      this.journeys = journeys;
    } catch (e) { console.warn('star map overlays failed', e); }
  }

  private project(s: { x: number; y: number; z: number }) {
    const { width: w, height: h } = this.scale;
    const x = s.x - this.focus.x, y = s.y - this.focus.y, z = s.z - this.focus.z;
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const X = x * cy - y * sy, Y = x * sy + y * cy;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const Y2 = Y * cp - z * sp, Z2 = Y * sp + z * cp;
    const persp = 1 / (1 + Y2 / 90);
    return { x: w / 2 + X * this.zoom * persp, y: h / 2 + 10 - Z2 * this.zoom * persp, depth: Y2, persp };
  }

  private pick(px: number, py: number) {
    let best: StarDef | null = null, bd = 14;
    for (const p of this.projected) {
      const d = Math.hypot(p.x - px, p.y - py);
      if (d < bd) { bd = d; best = p.s; }
    }
    if (!best || this.data0.mode === 'transit') return;
    this.selected = best;
    this.focusTarget.set(best.x, best.y, best.z);
    this.updateInfo();
  }

  /** Can the vessel jump from here to the selected star right now? */
  private launchCheck() {
    if (this.data0.mode !== 'pick' || !this.selected || this.selected.id === this.here.id) return null;
    const ly = lyBetween(this.here, this.selected);
    const cost = fuelCost(ly);
    if (ly > TRAVEL.jumpRangeLy) return { ok: false, ly, cost, why: 'TOO FAR - JUMP FROM A NEARER STAR' };
    if (this.data0.embers < cost) return { ok: false, ly, cost, why: `NEEDS ${cost} EMBERS` };
    return { ok: true, ly, cost, why: '' };
  }

  private updateInfo() {
    if (this.data0.mode === 'transit') {
      const j = this.data0.journey;
      const to = starById(j.to_star);
      this.info.setText(`TO ${to?.name ?? j.to_star}`);
      return;
    }
    const s = this.selected;
    if (!s || s.id === this.here.id) {
      this.info.setText(`YOU ARE AT ${this.here.name}`);
      this.info2.setText('TAP A STAR');
      this.actionBtn.setVisible(false);
      return;
    }
    const c = this.launchCheck()!;
    this.info.setText(`${s.name}${s.beacon ? ' - BEACON' : ''}`);
    this.info2.setText(c.ok ? `${c.ly.toFixed(1)} LY  ${formatDuration(travelMinutes(c.ly) * 60000)}  ${c.cost} EMBERS` : `${c.ly.toFixed(1)} LY  ${c.why}`);
    this.actionText.setText('LAUNCH');
    this.actionBtn.setVisible(c.ok);
  }

  private act() {
    if (this.data0.mode === 'transit') {
      if (Date.now() >= Date.parse(this.data0.journey.arrives_at)) void arrive(this, this.data0.journey);
      return;
    }
    const c = this.launchCheck();
    if (!c?.ok || !this.selected) return;
    this.game.events.emit('starmap-launch', this.selected.id);
  }

  private leave() {
    if (this.data0.mode === 'transit') this.scene.start('home');
    else this.game.events.emit('starmap-close');
  }

  update(_time: number, dt: number) {
    this.t += dt / 1000;
    this.focus.lerp(this.focusTarget, 0.12);
    if (!this.drag) this.yaw += dt * 0.00005;
    const g = this.g;
    g.clear();

    // reference rings on the galactic "floor" (z = 0 around Sol), every 10 ly
    for (let r = 10; r <= 50; r += 10) {
      g.lineStyle(1, PALETTE[r % 20 === 0 ? 23 : 24], 1);
      let prev: { x: number; y: number } | null = null;
      for (let a = 0; a <= 64; a++) {
        const p = this.project({ x: Math.cos((a / 64) * Math.PI * 2) * r, y: Math.sin((a / 64) * Math.PI * 2) * r, z: 0 });
        if (prev) g.lineBetween(prev.x, prev.y, p.x, p.y);
        prev = p;
      }
    }

    // jump range around where the vessel is
    if (this.data0.mode === 'pick') {
      const c = this.project(this.here);
      g.lineStyle(1, PALETTE[9], 0.35).strokeCircle(c.x, c.y, TRAVEL.jumpRangeLy * this.zoom * c.persp);
    }

    // stars, far to near
    this.projected = STARS.map((s) => ({ s, ...this.project(s) })).sort((a, b) => b.depth - a.depth);
    let li = 0;
    const label = (x: number, y: number, text: string, tint: number) => {
      let l = this.labels[li];
      if (!l) { l = this.add.bitmapText(0, 0, 'pixel', '').setOrigin(0.5, 1); this.labels.push(l); }
      li++;
      l.setText(text).setPosition(Math.round(x), Math.round(y)).setTint(tint).setVisible(true);
    };
    for (const p of this.projected) {
      const s = p.s;
      const floor = this.project({ x: s.x, y: s.y, z: 0 });
      g.lineStyle(1, PALETTE[24], 0.8).lineBetween(p.x, p.y, floor.x, floor.y);
      const col = s.id === 'sol' ? PALETTE[10] : PALETTE[TYPE_COLOR[s.type[0]] ?? 20];
      const size = Math.max(1, Math.round((s.type[0] === 'A' || s.type[0] === 'F' ? 2 : 1.5) * p.persp));
      const dim = this.show.found && !this.discovered.has(s.id) ? 0.55 : 1;
      g.fillStyle(col, dim).fillRect(Math.round(p.x) - size + 1, Math.round(p.y) - size + 1, size * 2 - 1, size * 2 - 1);
      if (this.show.found && this.discovered.has(s.id) && s.id !== 'sol') g.lineStyle(1, PALETTE[18], 0.8).strokeCircle(p.x, p.y, 4);
      if (this.show.beacons && s.beacon) {
        const r = 5 + Math.sin(this.t * 3) * 1.5;
        g.lineStyle(1, PALETTE[9], 1).strokePoints([{ x: p.x, y: p.y - r }, { x: p.x + r, y: p.y }, { x: p.x, y: p.y + r }, { x: p.x - r, y: p.y }], true);
      }
      if (s.id === this.here.id) {
        const r = 7 + Math.sin(this.t * 4);
        g.lineStyle(1, PALETTE[session.replicant?.traits.feature ?? 10], 1).strokeCircle(p.x, p.y, r);
        label(p.x, p.y - 9, s.id === 'sol' ? 'SOL - HOME' : s.name, PALETTE[10]);
      } else if (this.selected?.id === s.id) {
        g.lineStyle(1, PALETTE[19], 1).strokeRect(p.x - 6, p.y - 6, 12, 12);
        label(p.x, p.y - 8, s.name, PALETTE[19]);
      } else if ((this.show.beacons && s.beacon) || s.id === 'sol') {
        label(p.x, p.y - 7, s.id === 'sol' ? 'SOL' : s.name, PALETTE[s.id === 'sol' ? 10 : 9]);
      }
    }

    // family replicants: little colored dots orbiting their star
    if (this.show.copies) {
      const byStar = new Map<string, ReplicantPin[]>();
      for (const pin of this.pins) if (pin.status !== 'in_transit') byStar.set(pin.star_id, [...(byStar.get(pin.star_id) ?? []), pin]);
      for (const [star, pins] of byStar) {
        const s = starById(star);
        if (!s) continue;
        const c = this.project(s);
        pins.slice(0, 8).forEach((pin, i) => {
          const a = this.t * 0.8 + (i / pins.length) * Math.PI * 2;
          g.fillStyle(PALETTE[pin.traits.feature ?? 10], 1).fillRect(Math.round(c.x + Math.cos(a) * 9) - 1, Math.round(c.y + Math.sin(a) * 5) - 1, 2, 2);
        });
      }
    }

    // journeys in progress: dotted line and the ship part way along it
    const js = this.data0.mode === 'transit' ? [this.data0.journey] : (this.show.copies ? this.journeys : []);
    for (const j of js) {
      const a = starById(j.from_star), b = starById(j.to_star);
      if (!a || !b) continue;
      const pa = this.project(a), pb = this.project(b);
      const steps = 24;
      for (let i = 0; i < steps; i += 2) {
        const t0 = i / steps, t1 = (i + 1) / steps;
        g.lineStyle(1, PALETTE[9], 0.8).lineBetween(pa.x + (pb.x - pa.x) * t0, pa.y + (pb.y - pa.y) * t0, pa.x + (pb.x - pa.x) * t1, pa.y + (pb.y - pa.y) * t1);
      }
      const d0 = Date.parse(j.departs_at), d1 = Date.parse(j.arrives_at);
      const f = Phaser.Math.Clamp((Date.now() - d0) / Math.max(1, d1 - d0), 0, 1);
      const sx = pa.x + (pb.x - pa.x) * f, sy = pa.y + (pb.y - pa.y) * f;
      g.fillStyle(PALETTE[10], 1).fillTriangle(sx, sy - 3, sx - 2, sy + 2, sx + 2, sy + 2);
      g.fillStyle(PALETTE[9], 0.5).fillCircle(sx, sy, 4 + Math.sin(this.t * 6));
    }
    for (let i = li; i < this.labels.length; i++) this.labels[i].setVisible(false);

    if (this.data0.mode === 'transit') {
      const left = Date.parse(this.data0.journey.arrives_at) - Date.now();
      this.info2.setText(left > 0 ? `ARRIVES IN ${formatDuration(left)}` : 'ARRIVED');
      this.actionText.setText('LAND');
      this.actionBtn.setVisible(left <= 0);
    }
  }
}

/** Journey finished: the replicant is now at the destination's planet. Land there. */
export async function arrive(scene: Phaser.Scene, j: Journey) {
  const r = session.replicant, st = session.store;
  const planet = planetOfStar(j.to_star);
  if (!r || !st || !planet) return;
  try {
    await st.completeJourney(r, j, planet.planetIndex);
  } catch (e) {
    console.warn('could not complete journey', e);
    return;
  }
  scene.scene.start('planet', {});
  scene.scene.launch('ui');
}
