// The Cem bed (story/STORY.md; tunables src/data/bioworks.json): where the supplies you gather are shipped and the
// Cems build from. A salt flat on a lot of the town near the Printworks with the Cems lying on it, breathing and
// drinking the light (they glow faintly at night); the ants' mound on one side, from where columns of ants carry the
// Cems their feed and, while a design is printed, carry its supplies from the store and the Cems from the bed to it;
// the fungus on the other side, whose light runs over the bed now and then as it cleans it; salt blooms around the rim.
// It sleeps (grey, still) until Thales' Printworks is finished; then the Cems wake and the Printworks' door opens the
// design menu (src/scenes/DesignScene.ts), with a little turning model of a design over it.
import Phaser from 'phaser';
import { sound } from '../audio/Sound';
import { BACKEND, PALETTE } from '../core/data';
import { designModel, DESIGNS, paintTexture, turntableView } from '../core/designs';
import { isHome } from '../core/home';
import BIO from '../data/bioworks.json';
import HOMEWORLD from '../data/homeworld.json';
import type { Light } from '../fx/Lighting';
import type { Building, PlanetSave } from '../net/store';
import type { PlanetScene } from '../scenes/PlanetScene';
import { roofHeight } from '../world/buildingPaint';
import { buildingDoor, type Lot } from '../world/town';
import { CrystalNode, NODE } from './Resources';

type Pt = { x: number; y: number };
const DEPTH_ANTS = 6, DEPTH_GLOW = 6100;
const BED_KEY = 'cembed';

/** A line of ants between two points: out carrying, back empty, again (cargo: palette colors, one picked per trip). */
interface Trail { id: string; pts: Pt[]; lens: number[]; len: number; cargo: number[]; ants: Ant[]; ending: boolean }
interface Ant { s: number; dir: 1 | -1; v: number; phase: number; color: number | null }

/** A gentle curve from a to b (bowed to one side), as points with their distances along it. */
function curve(a: Pt, b: Pt, bow: number) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
  const c = { x: mx - (dy / d) * bow, y: my + (dx / d) * bow };
  const pts: Pt[] = [];
  const n = Math.max(6, Math.ceil(d / 14));
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push({ x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y });
  }
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return { pts, lens, len: lens[lens.length - 1] };
}

/** The salt flat: a ragged pale oval of salt crust broken into polygons, a little damp at its rim. Pure pixels. */
function paintFlat(rx: number, ry: number, seed: number) {
  const W = rx * 2 + 8, H = ry * 2 + 8, data = new Uint8ClampedArray(W * H * 4);
  let s = seed >>> 0 || 1;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const cells = Array.from({ length: 34 }, () => ({ x: rnd() * W, y: rnd() * H }));
  const hex = (h: number) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  const base = hex(PALETTE[21]), hi = hex(PALETTE[20]), crack = hex(PALETTE[22]), rim = hex(PALETTE[23]), rose = hex(PALETTE[31]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x + 0.5 - W / 2) / rx, dy = (y + 0.5 - H / 2) / ry;
    const wob = Math.sin(Math.atan2(dy, dx) * 5 + seed) * 0.06 + Math.sin(Math.atan2(dy, dx) * 9 + seed * 2) * 0.04;
    const r = Math.hypot(dx, dy);
    if (r > 1 + wob) continue;
    // the nearest two cell centers: on their border, a crack
    let d1 = Infinity, d2 = Infinity;
    for (const c of cells) { const d = Math.hypot((c.x - x) * 0.8, c.y - y); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
    let c = base;
    if (d2 - d1 < 1.1) c = crack;
    else if ((x * 7 + y * 13) % 29 === 0) c = hi;
    else if ((x * 3 + y * 5) % 37 === 0) c = rose;
    const edge = 1 + wob - r;
    if (edge < 0.08) c = (x + y) % 2 ? rim : crack;
    const k = (y * W + x) * 4;
    data[k] = c[0]; data[k + 1] = c[1]; data[k + 2] = c[2]; data[k + 3] = edge < 0.08 ? 140 : 215;
  }
  return { width: W, height: H, data };
}

export class Bioworks {
  /** this world has a Cem bed */
  readonly active: boolean;
  lot?: Lot;
  center: Pt = { x: 0, y: 0 };
  awake = false;
  private mats: { sprite: Phaser.GameObjects.Sprite; glow: Phaser.GameObjects.Image }[] = [];
  private mound?: Phaser.GameObjects.Sprite;
  private fungus?: Phaser.GameObjects.Sprite;
  private fungusLight?: Light;
  private bedLight?: Light;
  private drink?: Phaser.GameObjects.Particles.ParticleEmitter;
  private gfx?: Phaser.GameObjects.Graphics;
  private glowGfx?: Phaser.GameObjects.Graphics;
  private trails: Trail[] = [];
  private loiter: { x: number; y: number; a: number; v: number }[] = [];
  private nextClean = 0;
  private nextBreath = 0;
  private nextPatter = 0;
  private dwell = 0;
  /** back from the menu: the door waits until you have stepped out of it */
  private mustLeave = false;
  private ring?: Phaser.GameObjects.Graphics;
  readyAt = 0;
  private holo?: { image: Phaser.GameObjects.Image; light: Light; t: number; at: number; design: string };

  constructor(private scene: PlanetScene, save: PlanetSave | null) {
    this.active = BIO.worlds.includes(scene.planet.id) && isHome(scene.planet.star, scene.planet.planetIndex) && !scene.visit;
    if (!this.active) return;
    this.reserve(save);
    if (!this.lot) return;
    this.place(save);
  }

  /** The bed's lot: kept in planet_states.data.town.civic.cembed; the first time, the free lot nearest the goal. */
  private reserve(save: PlanetSave | null) {
    const s = this.scene, town = s.map.town, st = s.townState;
    let i = st.civic[BED_KEY];
    if (i === undefined || !town.lots[i]) {
      const used = new Set([...Object.values(st.lots), ...Object.values(st.civic)]);
      const goal = save?.data.buildings?.find((b) => b.id === HOMEWORLD.goal) ?? { x: s.baseCenter.x, y: s.baseCenter.y };
      const free = town.lots.filter((l) => !used.has(l.index));
      const mid = (l: Lot) => ({ x: (l.rect.x + l.rect.w / 2) * 16, y: (l.rect.y + l.rect.h / 2) * 16 });
      free.sort((a, b) => Math.hypot(mid(a).x - goal.x, mid(a).y - goal.y) - Math.hypot(mid(b).x - goal.x, mid(b).y - goal.y));
      if (!free[0]) return;
      i = free[0].index;
      st.civic[BED_KEY] = i;
      if (!s.shot) s.markTown();
    }
    this.lot = town.lots[i];
    const r = this.lot.rect;
    this.center = { x: Math.round((r.x + r.w / 2) * 16), y: Math.round((r.y + r.h / 2) * 16 + 4) };
  }

  /** The flat, the Cems on it, the mound and its ants, the fungus, the salt blooms. */
  private place(save: PlanetSave | null) {
    const s = this.scene, c = this.center, F = BIO.flat;
    const flat = paintFlat(F.rx, F.ry, s.planet.seed);
    const key = paintTexture(s, 'cembed-flat', flat);
    s.add.image(c.x, c.y, key).setDepth(1.6);
    this.bedLight = s.lighting.add({ x: c.x, y: c.y, radius: F.rx * 1.6, color: PALETTE[12], intensity: 0, flicker: 0.1 });
    // the Cems, lying where they fit, never on top of each other
    let seed = s.planet.seed >>> 0;
    const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
    const spots: Pt[] = [];
    for (let tries = 0; spots.length < BIO.mats && tries < 400; tries++) {
      const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * 0.78;
      const p = { x: Math.round(c.x + Math.cos(a) * F.rx * rr), y: Math.round(c.y + Math.sin(a) * F.ry * rr) };
      if (spots.every((q) => Math.abs(q.x - p.x) > 15 || Math.abs(q.y - p.y) > 8)) spots.push(p);
    }
    for (const p of spots) {
      const sprite = s.add.sprite(p.x, p.y, 'cem', 0).setDepth(2 + p.y / 10000).setFlipX(rnd() < 0.5);
      sprite.play({ key: 'cem:breathe', startFrame: Math.floor(rnd() * 3) });
      const glow = s.add.image(p.x, p.y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(PALETTE[18]).setAlpha(0).setScale(0.35, 0.18).setDepth(DEPTH_GLOW);
      this.mats.push({ sprite, glow });
    }
    // the ants' mound to the west of the flat, the fungus to the east
    const mx = c.x - F.rx - 10, my = c.y + 4;
    this.mound = s.add.sprite(mx, my + 4, 'antmound', 0).setOrigin(0.5, 1).setDepth(100 + my);
    s.addSolid(mx, my - 2, 12, 6);
    const fx = c.x + F.rx + 8, fy = c.y + 2;
    this.fungus = s.add.sprite(fx, fy + 4, 'fungus', 0).setOrigin(0.5, 1).setDepth(100 + fy);
    s.addSolid(fx, fy - 1, 10, 5);
    this.fungusLight = s.lighting.add({ x: fx, y: fy - 4, radius: 26, color: PALETTE[18], intensity: 0.15, flicker: 0.3 });
    // sunlight drinking into the Cems by day: tiny motes settling onto the flat
    this.drink = s.add.particles(c.x, c.y - 30, 'px1', {
      x: { min: -F.rx * 0.8, max: F.rx * 0.8 }, y: { min: -6, max: 6 }, lifespan: 1600, speedY: { min: 14, max: 22 },
      alpha: { start: 0, end: 0.8, ease: 'Sine.easeIn' }, tint: [PALETTE[11], PALETTE[19], PALETTE[10]], frequency: 260, blendMode: Phaser.BlendModes.ADD,
    }).setDepth(DEPTH_GLOW);
    this.gfx = s.add.graphics().setDepth(DEPTH_ANTS);
    this.glowGfx = s.add.graphics().setDepth(DEPTH_GLOW).setBlendMode(Phaser.BlendModes.ADD);
    this.ring = s.add.graphics().setDepth(6150);
    // salt blooms around the rim (saved under their own keys; they regrow like every node)
    const regrowMs = BACKEND.nodeRegrowMinutes * 60_000;
    for (let k = 0; k < BIO.blooms; k++) {
      const a = Math.PI * (0.15 + (k / BIO.blooms) * 2) + 0.4;
      const x = Math.round(c.x + Math.cos(a) * (F.rx + 6)), y = Math.round(c.y + Math.sin(a) * (F.ry + 6));
      if (Math.abs(x - mx) < 16 && Math.abs(y - my) < 12) continue;
      const key = `bed${k}`;
      let hits = save?.data.nodes?.[key]?.hits ?? 0;
      if (hits >= NODE.salt.hits && Date.now() - (save?.data.nodes?.[key]?.at ?? 0) > regrowMs) { hits = 0; s.pending.nodes[key] = { hits: 0, at: Date.now() }; }
      s.nodes.push(new CrystalNode(s, x, y, -1 - k, hits, 'salt', key));
    }
    this.sleep();
  }

  /** Before the Printworks stands: the Cems grey and slow, the mound still, no ants. */
  private sleep() {
    this.awake = false;
    for (const m of this.mats) { m.sprite.setTint(0x7c8a84); m.sprite.anims.timeScale = 0.25; }
    this.mound?.setFrame(0);
    this.drink?.stop();
  }

  /** The goal building is finished (or was already): the Cems wake and the ants come out. */
  wake(animate: boolean) {
    if (!this.active || !this.lot || this.awake) return;
    this.awake = true;
    const s = this.scene;
    this.mound?.play('antmound:busy');
    this.fungus?.play('fungus:glow');
    this.drink?.start();
    for (const m of this.mats) m.sprite.anims.timeScale = 1;
    if (animate) {
      const t = { k: 0 };
      s.tweens.add({ targets: t, k: 1, duration: 1800, ease: 'Sine.easeInOut', onUpdate: () => { const c = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.ValueToColor(0x7c8a84), Phaser.Display.Color.ValueToColor(0xffffff), 1, t.k); for (const m of this.mats) m.sprite.setTint(Phaser.Display.Color.GetColor(c.r, c.g, c.b)); }, onComplete: () => { for (const m of this.mats) m.sprite.clearTint(); } });
      s.fx.sparks(this.center.x, this.center.y - 4, PALETTE[12], 14);
      sound.cemsWake({ x: this.center.x, y: this.center.y });
      s.time.delayedCall(1400, () => s.game.events.emit('notice', 'THE CEMS WAKE: THE PRINTWORKS TAKES DESIGNS'));
    } else for (const m of this.mats) m.sprite.clearTint();
    // ants about the mound, and the line that carries the Cems their feed
    if (this.mound) for (let i = 0; i < BIO.ants.mound; i++) this.loiter.push({ x: this.mound.x + (Math.random() - 0.5) * 20, y: this.mound.y - 2 + (Math.random() - 0.5) * 10, a: Math.random() * Math.PI * 2, v: 6 + Math.random() * 6 });
    if (this.mound) this.addTrail('forage', { x: this.mound.x + 6, y: this.mound.y - 2 }, { x: this.center.x - 8, y: this.center.y + 2 }, [PALETTE[10], PALETTE[3], PALETTE[31]], BIO.ants.forage, 4);
    this.readyAt = s.time.now + 1500;
  }

  /** The supplies and the Cems on their way to a print: a line from the store and a line from the bed. */
  startFlow(id: string, to: Pt, cargo: number[], fresh = false) {
    if (!this.active || !this.lot) return;
    const hatch = this.scene.warren.hatch;
    // a print found under way has its lines already full; a new one sends its first ants out from both ends at once
    const spread = fresh ? 0.6 : 1;
    this.addTrail(`${id}:store`, { x: hatch.x, y: hatch.y + 2 }, to, cargo, BIO.ants.perTrail, 18, spread);
    this.addTrail(`${id}:bed`, { x: this.center.x, y: this.center.y }, { x: to.x + 6, y: to.y + 2 }, [PALETTE[12], PALETTE[13], PALETTE[11]], BIO.ants.perTrail, -14, spread);
  }

  /** The print is done: the lines thin out as the ants go home. */
  stopFlow(id: string) {
    for (const t of this.trails) if (t.id.startsWith(`${id}:`)) t.ending = true;
  }

  private addTrail(id: string, from: Pt, to: Pt, cargo: number[], n: number, bow: number, spread = 1) {
    if (this.trails.some((t) => t.id === id)) return;
    const c = curve(from, to, bow);
    const [v0, v1] = BIO.ants.speed;
    // spread along the line (out and back); a new line's ants are out on its first stretch, the rest still coming out
    const ants: Ant[] = Array.from({ length: n }, (_, i) => {
      const k = i / n, out = k < spread;
      return { s: out ? (k / Math.max(spread, 0.01)) * c.len * spread : -(k - spread) * c.len * 1.2, dir: i % 3 === 2 && out ? -1 : 1, v: v0 + Math.random() * (v1 - v0), phase: Math.random() * 6, color: i % 3 === 2 && out ? null : cargo[i % cargo.length] };
    });
    this.trails.push({ id, ...c, cargo, ants, ending: false });
  }

  /** Where on a trail an ant is (px), with its wiggle. */
  private antAt(t: Trail, a: Ant): Pt {
    const s = Math.max(0, Math.min(t.len, a.s));
    let i = 1;
    while (i < t.lens.length - 1 && t.lens[i] < s) i++;
    const p0 = t.pts[i - 1], p1 = t.pts[i], seg = t.lens[i] - t.lens[i - 1] || 1, k = (s - t.lens[i - 1]) / seg;
    const dx = (p1.x - p0.x) / seg, dy = (p1.y - p0.y) / seg;
    const w = Math.sin(s * 0.35 + a.phase) * BIO.ants.wiggle * (a.dir > 0 ? 1 : -1);
    return { x: p0.x + (p1.x - p0.x) * k - dy * w, y: p0.y + (p1.y - p0.y) * k + dx * w };
  }

  /** On the salt (footsteps crunch). */
  onFlat(x: number, y: number) {
    if (!this.active || !this.lot) return false;
    return ((x - this.center.x) / BIO.flat.rx) ** 2 + ((y - this.center.y) / BIO.flat.ry) ** 2 < 1;
  }

  /** The Printworks, where the design menu opens (built). */
  private get door(): (Pt & { b: Building }) | null {
    const b = this.scene.buildings?.list.find((x) => x.id === HOMEWORLD.goal && x.built && !x.vetoed);
    return b ? { ...buildingDoor(b), b } : null;
  }

  /** Standing in the Printworks' doorway (in front of it). */
  playerAtDoor() {
    const d = this.door, p = this.scene.player;
    return !!d && this.awake && !!p && Math.abs(p.x - d.x) < 9 && p.y > d.y - 2 && p.y < d.y + 12;
  }

  /** Down to the menu: the planet waits under it. */
  openMenu() {
    const s = this.scene, pl = s.player;
    if (!this.awake || s.visit || s.launching || s.time.now < this.readyAt || pl.locked) return false;
    pl.locked = true;
    pl.body.setVelocity(0, 0);
    this.readyAt = Infinity;
    this.dwell = 0;
    this.ring?.clear();
    sound.designOpen();
    s.scene.pause();
    s.scene.launch('designs', { host: s });
    return true;
  }

  /** Back from the menu: you stand just out of the doorway, and it opens again only once you have left it. */
  closed() {
    const s = this.scene, d = this.door;
    s.scene.resume();
    s.player.locked = false;
    if (d) s.player.setPosition(d.x, d.y + 16);
    this.mustLeave = true;
    this.readyAt = s.time.now + 1800;
  }

  /** A print just begun: the camera goes to watch the ants arrive and the first rows settle, then comes back to you. */
  showPrint(b: Building) {
    const s = this.scene, cam = s.cameras.main, pl = s.player;
    pl.locked = true;
    pl.body.setVelocity(0, 0);
    cam.stopFollow();
    cam.pan(b.x, b.y - 16, 900, 'Sine.easeInOut');
    s.time.delayedCall(2600, () => {
      cam.pan(pl.x, pl.y, 700, 'Sine.easeInOut', false, (_c: Phaser.Cameras.Scene2D.Camera, k: number) => {
        if (k < 1) return;
        cam.startFollow(pl.zone, true, 0.1, 0.1, 0, 8);
        pl.locked = false;
      });
    });
  }

  update(time: number, dt: number) {
    if (!this.active || !this.lot) return;
    const s = this.scene, night = s.env?.night ?? 0;
    // the Cems glow a little at night, and the bed with them; the fungus' light breathes
    const breath = 0.5 + 0.5 * Math.sin(time / 1300);
    for (const m of this.mats) m.glow.setAlpha(this.awake ? night * (0.1 + 0.08 * Math.sin(time / 900 + m.sprite.x)) : 0);
    if (this.bedLight) this.bedLight.intensity = this.awake ? (0.12 + 0.3 * night) * (0.8 + 0.2 * breath) : 0;
    if (this.fungusLight) this.fungusLight.intensity = (this.awake ? 0.25 + 0.35 * night : 0.08) * (0.7 + 0.3 * breath);
    if (this.drink) this.drink.setAlpha(1 - night);
    const p = s.player, near = !!p && Math.hypot(p.x - this.center.x, p.y - this.center.y) < 260;
    if (this.awake && time > this.nextClean) {
      // the fungus cleans: its light runs over the bed and the Cems brighten
      this.nextClean = time + BIO.fungus.cleanSeconds * 1000 * (0.8 + Math.random() * 0.4);
      if (near) this.clean();
    }
    if (this.awake && near && time > this.nextBreath) { this.nextBreath = time + 5000 + Math.random() * 4000; sound.cemBreath({ x: this.center.x, y: this.center.y }); }
    this.updateAnts(dt, time, night);
    this.updateDoor(time, dt);
  }

  private clean() {
    const s = this.scene, F = BIO.flat, f = this.fungus;
    if (!f) return;
    const ring = s.add.ellipse(f.x - 6, f.y - 4, 8, 4).setStrokeStyle(1, PALETTE[18], 0.7).setDepth(DEPTH_GLOW).setBlendMode(Phaser.BlendModes.ADD);
    s.tweens.add({ targets: ring, x: this.center.x, scaleX: (F.rx * 2) / 8, scaleY: (F.ry * 2) / 4, alpha: 0, duration: 1700, ease: 'Sine.easeOut', onComplete: () => ring.destroy() });
    for (const m of this.mats) s.time.delayedCall(Math.max(0, (f.x - m.sprite.x) * 9), () => { if (m.sprite.active) { m.sprite.setTintFill(PALETTE[12]); s.time.delayedCall(90, () => m.sprite.active && m.sprite.clearTint()); } });
    sound.fungusClean({ x: f.x, y: f.y });
  }

  private updateAnts(dt: number, time: number, night: number) {
    const g = this.gfx, gg = this.glowGfx;
    if (!g || !gg) return;
    g.clear(); gg.clear();
    if (!this.awake) return;
    const sec = dt / 1000, ink = PALETTE[25], view = this.scene.cameras.main.worldView;
    const glowA = 0.5 + 0.45 * night;
    const pl = this.scene.player;
    let nearTrail = false;
    // ants milling about the mound
    for (const a of this.loiter) {
      a.a += (Math.random() - 0.5) * 4 * sec;
      a.x += Math.cos(a.a) * a.v * sec; a.y += Math.sin(a.a) * a.v * 0.6 * sec;
      if (this.mound && Math.hypot(a.x - this.mound.x, (a.y - this.mound.y + 2) * 1.6) > 16) a.a = Math.atan2(this.mound.y - 2 - a.y, this.mound.x - a.x);
      g.fillStyle(ink, 1).fillRect(Math.round(a.x), Math.round(a.y), 1, 1);
    }
    for (const t of this.trails) {
      for (const a of t.ants) {
        a.s += a.dir * a.v * sec;
        if (a.s >= t.len) { a.s = t.len; a.dir = -1; a.color = null; }
        else if (a.s <= 0 && a.dir < 0) {
          if (t.ending) { a.v = 0; a.s = -1; continue; }
          a.dir = 1; a.color = t.cargo[Math.floor(Math.random() * t.cargo.length)];
        }
        if (a.s < 0) continue;
        const q = this.antAt(t, a);
        if (q.x < view.x - 8 || q.x > view.right + 8 || q.y < view.y - 8 || q.y > view.bottom + 8) continue;
        const x = Math.round(q.x), y = Math.round(q.y);
        g.fillStyle(ink, 1).fillRect(x, y, 2, 1);
        if (a.color !== null) { g.fillStyle(a.color, 1).fillRect(x, y - 2, 2, 2); gg.fillStyle(a.color, glowA).fillRect(x, y - 2, 2, 2); }
        if (pl && !nearTrail && Math.abs(pl.x - x) < 40 && Math.abs(pl.y - y) < 30) nearTrail = true;
      }
    }
    this.trails = this.trails.filter((t) => !t.ending || t.ants.some((a) => a.s >= 0));
    if (nearTrail && time > this.nextPatter) { this.nextPatter = time + 700 + Math.random() * 500; sound.antPatter(); }
  }

  /** The Printworks' door: a little turning model over it, and a ring that fills while you stand in it. */
  private updateDoor(time: number, dt: number) {
    const s = this.scene, d = this.door;
    if (!d || !this.awake) { if (this.holo) { this.holo.image.setVisible(false); this.holo.light.intensity = 0; } return; }
    if (!this.holo) {
      const light = s.lighting.add({ x: d.x, y: d.y - d.b.h * 12 - 12, radius: 34, color: PALETTE[18], intensity: 0.4, flicker: 0.2 });
      const image = s.add.image(d.x, d.y - 26, '__WHITE').setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH_GLOW).setAlpha(0.85).setTint(0x9ff8ff);
      this.holo = { image, light, t: 0, at: 0, design: DESIGNS[1].id };
    }
    const h = this.holo;
    h.image.setVisible(true);
    h.t += dt / 1000;
    if (time > h.at) {
      h.at = time + BIO.hologram.redrawMs;
      // every few turns it shows another design (the lantern is too slight to read at this size)
      const shown = DESIGNS.filter((x) => x.id !== 'lantern');
      const which = shown[Math.floor(h.t / 9) % shown.length].id;
      const m = designModel(which);
      if (m) {
        const r = turntableView(m, h.t * 0.9, BIO.hologram.ppv * (m.h > 16 ? 1.1 : 1.6));
        h.image.setTexture(paintTexture(s, `design-holo:${which}`, r)).setOrigin(0.5, 1);
        h.image.setPosition(d.x, d.y - d.b.h * 12 - roofHeight(d.b) - 3 + Math.sin(h.t * 2) * 1.5);
      }
    }
    h.light.intensity = 0.3 + 0.12 * Math.sin(time / 300);
    // the doorway: standing in it a moment opens the designs (walking past never does)
    const pl = s.player;
    if (this.mustLeave && !this.playerAtDoor()) this.mustLeave = false;
    const on = time > this.readyAt && !this.mustLeave && !!pl && pl.alive && !pl.locked && !s.stopped && !s.talker.talk && this.playerAtDoor();
    this.dwell = on ? this.dwell + dt : 0;
    this.ring?.clear();
    if (!this.dwell) return;
    const k = Math.min(1, this.dwell / BIO.doorDwellMs);
    this.ring?.lineStyle(1, PALETTE[12], 0.4 + 0.5 * k).beginPath().arc(d.x, d.y + 2, 10, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2).strokePath();
    if (k >= 1) this.openMenu();
  }
}
