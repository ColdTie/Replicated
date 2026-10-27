// The Cem bed (story/STORY.md; tunables src/data/bioworks.json): where the supplies you gather are shipped and the
// Cems build from. A salt flat on a lot of the town near the Printworks with the Cems lying on it, breathing and
// drinking the light (they glow faintly at night); the ants' mound on one side, from where columns of ants carry the
// Cems their feed and, while a design is printed, carry its supplies from the store and the Cems from the bed to it;
// the fungus on the other side, whose light runs over the bed now and then as it cleans it; salt blooms around the rim.
// It sleeps (grey, still) until Thales' Printworks is finished; then the Cems wake and the Printworks' door opens the
// design menu (src/scenes/DesignScene.ts), with a little turning model of a design over it.
// The bed travels: launching from a world whose Cems are awake, the ship's hold takes a culture of them (a glass jar,
// replicants.traits.culture). On a world without a bed a ghost of the flat waits on the free lot nearest the square,
// with what it still needs over it; standing on it with the salt in the store seeds it (planet_states.data.cembed):
// the jar flies from the ship and breaks open, the Cems take to the salt and wake at once, and a design stone on the
// bed's rim opens the design menu where there is no Printworks.
// The strain (bioworks.json strain): wild Cems from the Cems' world (src/entities/WildCems.ts), brought to the door of a
// finished Biolab, are changed into a strain that prints faster; the bed takes it up, the hold's culture carries it,
// and every awake bed you walk onto with it aboard takes it up too.
import Phaser from 'phaser';
import { sound } from '../audio/Sound';
import { BACKEND, PALETTE, SUPPLIES } from '../core/data';
import { designModel, DESIGNS, paintTexture, turntableView } from '../core/designs';
import { isHome } from '../core/home';
import { session } from '../core/session';
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
export function paintFlat(rx: number, ry: number, seed: number) {
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

/** A culture of Cems the ship's hold carries, if any. */
export const shipCulture = () => session.replicant?.traits.culture ?? null;

export class Bioworks {
  /** the homeworld's bed, founded with the town (it wakes with the Printworks) */
  readonly founded: boolean;
  /** this world has a Cem bed (founded, or seeded from a culture) */
  active: boolean;
  lot?: Lot;
  center: Pt = { x: 0, y: 0 };
  awake = false;
  /** the strain this bed's Cems are (bioworks.json strain), if the Biolab's changed Cems reached it */
  strain?: string;
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
  /** a seeded bed's design stone (where the menu opens on a world without the Printworks); dir 1: you stand south of it */
  private plinth?: { x: number; y: number; dir: 1 | -1; sprite: Phaser.GameObjects.Sprite; light: Light };
  /** no bed yet, but the ship holds a culture: the flat's outline on the lot it would take, the jar over it */
  private ghost?: { gfx: Phaser.GameObjects.Graphics; jar: Phaser.GameObjects.Sprite; light: Light; readout: Phaser.GameObjects.Container; dwell: number; seeding: boolean };
  /** standing at a Biolab's door with wild Cems aboard (ms), and while it changes them */
  private labDwell = 0;
  private labRing?: Phaser.GameObjects.Graphics;
  private altering = false;

  constructor(private scene: PlanetScene, save: PlanetSave | null) {
    this.founded = BIO.worlds.includes(scene.planet.id) && isHome(scene.planet.star, scene.planet.planetIndex) && !scene.visit;
    this.active = this.founded || (!scene.visit && !!save?.data.cembed);
    if (this.active) {
      this.strain = save?.data.cembed?.strain;
      this.reserve(save);
      if (!this.lot) return;
      this.place(save);
      if (!this.founded) this.wake(false);
      return;
    }
    // a world without a bed, the ship here with a culture aboard: the bed it could have
    if (!scene.visit && !scene.vesselAway && shipCulture()) this.showGhost(save);
  }

  /** The free lot a bed takes: the one nearest the goal (the homeworld's Printworks), else nearest the square. */
  private pickLot(save: PlanetSave | null): Lot | undefined {
    const s = this.scene, town = s.map.town, st = s.townState;
    const used = new Set([...Object.values(st.lots), ...Object.values(st.civic)]);
    const goal = save?.data.buildings?.find((b) => b.id === HOMEWORLD.goal) ?? { x: s.baseCenter.x, y: s.baseCenter.y };
    const mid = (l: Lot) => ({ x: (l.rect.x + l.rect.w / 2) * 16, y: (l.rect.y + l.rect.h / 2) * 16 });
    return town.lots.filter((l) => !used.has(l.index))
      .sort((a, b) => Math.hypot(mid(a).x - goal.x, mid(a).y - goal.y) - Math.hypot(mid(b).x - goal.x, mid(b).y - goal.y))[0];
  }

  /** The bed's lot: kept in planet_states.data.town.civic.cembed; the first time, the free lot nearest the goal. */
  private reserve(save: PlanetSave | null) {
    const s = this.scene, town = s.map.town, st = s.townState;
    let i = st.civic[BED_KEY];
    if (i === undefined || !town.lots[i]) {
      const free = this.pickLot(save);
      if (!free) return;
      i = free.index;
      st.civic[BED_KEY] = i;
      if (!s.shot) s.markTown();
    }
    this.setLot(town.lots[i]);
  }

  private setLot(lot: Lot) {
    this.lot = lot;
    const r = lot.rect;
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
    this.ring ??= s.add.graphics().setDepth(6150);
    // salt blooms around the rim (saved under their own keys; they regrow like every node)
    const regrowMs = BACKEND.nodeRegrowMinutes * 60_000;
    for (let k = 0; k < BIO.blooms; k++) {
      const a = Math.PI * (0.15 + (k / BIO.blooms) * 2) + 0.4;
      const x = Math.round(c.x + Math.cos(a) * (F.rx + 6)), y = Math.round(c.y + Math.sin(a) * (F.ry + 6));
      if (Math.abs(x - mx) < 16 && Math.abs(y - my) < 12) continue;
      const key = `bed${k}`;
      let hits = save?.data.nodes?.[key]?.hits ?? 0;
      if (hits >= NODE.salt.hits && Date.now() - (save?.data.nodes?.[key]?.at ?? 0) > regrowMs) { hits = 0; s.pending.nodes[key] = { hits: 0, at: Date.now() }; }
      const node = new CrystalNode(s, x, y, -1 - k, hits, 'salt', key);
      s.nodes.push(node);
      // seeded while you play: the world's colliders were made before these blooms
      if (s.player) s.physics.add.collider(s.player.zone, node.zone);
    }
    if (!this.founded) this.placePlinth();
    this.sleep();
  }

  /** A seeded bed's design stone: on the rim toward the street (the south rim when the street runs past a side). */
  private placePlinth() {
    const s = this.scene, c = this.center, F = BIO.flat;
    const dir: 1 | -1 = this.lot?.face === 'n' ? -1 : 1;
    const x = c.x, y = c.y + dir * (F.ry + (dir > 0 ? 6 : 2));
    const sprite = s.add.sprite(x, y + 1, 'plinth', 0).setOrigin(0.5, 1).setDepth(100 + y);
    sprite.play('plinth:glow');
    s.addSolid(x, y - 2, 8, 4);
    const light = s.lighting.add({ x, y: y - 11, radius: 22, color: PALETTE[12], intensity: 0.3, flicker: 0.2 });
    this.plinth = { x, y, dir, sprite, light };
  }

  /** Before the Printworks stands: the Cems grey and slow, the mound still, no ants. */
  private sleep() {
    this.awake = false;
    for (const m of this.mats) { m.sprite.setTint(0x7c8a84); m.sprite.anims.timeScale = 0.25; }
    this.mound?.setFrame(0);
    this.drink?.stop();
  }

  // ------------------------------------------------------------ the bed travels: a culture in the hold, a bed seeded

  /** The bed this world could have: its outline on the lot it would take, the culture's jar floating over it. */
  private showGhost(save: PlanetSave | null) {
    const s = this.scene, lot = this.pickLot(save);
    if (!lot) return;
    this.setLot(lot);
    const c = this.center;
    const gfx = s.add.graphics().setDepth(1.7);
    const jar = s.add.sprite(c.x, c.y - 14, 'culture', 0).setBlendMode(Phaser.BlendModes.ADD).setTint(0x9ff8ff).setAlpha(0.7).setDepth(DEPTH_GLOW);
    jar.play('culture:breathe');
    const light = s.lighting.add({ x: c.x, y: c.y - 8, radius: 34, color: PALETTE[12], intensity: 0.3, flicker: 0.15 });
    const readout = s.add.container(c.x, c.y - 36).setDepth(6200).setAlpha(0);
    this.ghost = { gfx, jar, light, readout, dwell: 0, seeding: false };
    this.ring ??= s.add.graphics().setDepth(6150);
    this.drawReadout();
  }

  /** What the seeding takes, against what the store holds: an icon and have/need per material. */
  private drawReadout() {
    const g = this.ghost;
    if (!g) return;
    const s = this.scene, cost = BIO.seed.cost as Record<string, number>, entries = Object.entries(cost);
    g.readout.removeAll(true);
    entries.forEach(([m, n], i) => {
      const have = Math.min(n, Math.floor(s.supplies[m] ?? 0)), x = (i - (entries.length - 1) / 2) * 30;
      const icon = (SUPPLIES.materials as Record<string, { icon: number }>)[m]?.icon ?? 0;
      g.readout.add(s.add.image(x - 7, 0, 'supplies', icon));
      g.readout.add(s.add.bitmapText(x + 1, -3, 'pixel', `${have}/${n}`).setTint(have >= n ? PALETTE[12] : PALETTE[21]));
    });
  }

  /** A culture came aboard while here (or a screenshot stages one): the ghost of the bed appears. */
  offer(save: PlanetSave | null) {
    if (!this.active && !this.ghost && !this.scene.visit && shipCulture()) this.showGhost(save);
  }

  /** Landed with a culture aboard on a world without a bed: a word about it once the title card has gone. */
  announce() {
    if (this.ghost) this.scene.time.delayedCall(3800, () => this.ghost && this.scene.game.events.emit('notice', 'THE CEMS IN THE HOLD COULD LIVE HERE'));
  }

  /** The ghost has all it needs. */
  canSeed() { return !!this.ghost && !this.ghost.seeding && !this.scene.warren.shortage(BIO.seed.cost); }

  /** Standing on the ghost's middle. */
  playerOnGhost() {
    const p = this.scene.player;
    return !!this.ghost && !!p && ((p.x - this.center.x) / (BIO.flat.rx * 0.5)) ** 2 + ((p.y - this.center.y) / (BIO.flat.ry * 0.6)) ** 2 < 1;
  }

  /**
   * Seeds the bed: the salt flies from the store to the flat, the culture from the ship; the jar breaks open over the
   * salt, the Cems spill out and take to it, the mound and the fungus come up and the bed wakes. Saved at once.
   */
  seed() {
    const s = this.scene, g = this.ghost, me = session.replicant;
    if (!g || !this.canSeed()) return false;
    g.seeding = true;
    this.ring?.clear();
    s.warren.pay(BIO.seed.cost);
    this.reserve(session.planet);
    if (!this.lot) { g.seeding = false; return false; }
    const c = this.center, culture = shipCulture();
    for (const m of Object.keys(BIO.seed.cost)) s.flyMaterial(m, s.warren.hatch, c, 0);
    s.tweens.add({ targets: [g.readout], alpha: 0, duration: 300 });
    // the jar comes down out of the ship
    const v = s.vesselPos, jar = s.add.sprite(v.x, v.y - 12, 'culture', 0).setDepth(6300);
    const arc = { t: 0 }, sx = jar.x, sy = jar.y;
    sound.cultureLoad({ x: v.x, y: v.y });
    s.tweens.add({ targets: g.jar, alpha: 0, duration: 500 });
    s.tweens.add({
      targets: arc, t: 1, delay: 500, duration: 1100, ease: 'Sine.easeInOut',
      onUpdate: () => jar.setPosition(sx + (c.x - sx) * arc.t, sy + (c.y - 10 - sy) * arc.t - Math.sin(arc.t * Math.PI) * 40),
      onComplete: () => {
        jar.destroy();
        s.fx.sparks(c.x, c.y - 8, PALETTE[12], 16);
        s.fx.sparks(c.x, c.y - 8, PALETTE[19], 6);
        s.shake(120, 0.002);
        sound.cultureSeed({ x: c.x, y: c.y });
        g.gfx.destroy(); g.jar.destroy(); s.lighting.remove(g.light); g.readout.destroy();
        this.ghost = undefined;
        this.active = true;
        this.strain = culture?.strain;
        this.place(session.planet);
        this.wake(true, 'THE CEMS TAKE TO THE SALT: THIS WORLD CAN BUILD');
      },
    });
    const data = { at: Date.now(), by: me?.id, from: culture?.from, ...(culture?.strain ? { strain: culture.strain } : {}) };
    if (!s.shot) { s.pending.cembed = data; void s.flushPlanet(); }
    if (session.planet) session.planet.data.cembed = data;
    s.mindLog.push({ t: s.mindClock, text: `${me?.name ?? 'the original'} seeded a Cem bed here from a culture the ship brought; the Cems build on this world now` });
    return true;
  }

  /** Where a copy tends the bed: a point on the salt's rim (north or south, clear of the mound and the fungus) near it. */
  tendSpot(x: number, y: number): Pt | null {
    if (!this.active || !this.awake || !this.lot) return null;
    const c = this.center, F = BIO.flat;
    const side = y < c.y ? -1 : 1, a = side * (Math.PI / 2 + (Math.random() - 0.5) * 1.6) + (x < c.x ? 0.15 : -0.15) * side;
    return { x: Math.round(c.x + Math.cos(a) * (F.rx - 6)), y: Math.round(c.y + Math.sin(a) * (F.ry - 2)) };
  }

  /** A stroke of tending: the Cems nearest the hands brighten, a little light rises. */
  tended(x: number, y: number) {
    const s = this.scene;
    const near = this.mats.filter((m) => Math.hypot(m.sprite.x - x, m.sprite.y - y) < 30);
    for (const m of near) { m.sprite.setTintFill(PALETTE[12]); s.time.delayedCall(100, () => m.sprite.active && m.sprite.clearTint()); }
    s.fx.sparks(x, y - 2, PALETTE[12], 3);
    sound.cemBreath({ x, y });
  }

  /** Launching from here with the Cems awake: a jar of them goes aboard (true when one did). */
  sendCulture(to: Pt) {
    if (!this.active || !this.awake) return false;
    const s = this.scene, far = Math.hypot(this.center.x - to.x, this.center.y - to.y) > 260;
    const from = far ? s.warren.hatch : this.center;
    const jar = s.add.sprite(from.x, from.y - 10, 'culture', 0).setDepth(6300);
    const arc = { t: 0 }, sx = jar.x, sy = jar.y;
    s.tweens.add({
      targets: arc, t: 1, duration: 800, ease: 'Sine.easeInOut',
      onUpdate: () => jar.setPosition(sx + (to.x - sx) * arc.t, sy + (to.y - 10 - sy) * arc.t - Math.sin(arc.t * Math.PI) * 30),
      onComplete: () => { jar.destroy(); s.fx.sparks(to.x, to.y - 10, PALETTE[12], 4); },
    });
    sound.cultureLoad({ x: to.x, y: to.y });
    return true;
  }

  private updateGhost(time: number, dt: number) {
    const g = this.ghost, s = this.scene;
    if (!g) return;
    const c = this.center, F = BIO.flat, breath = 0.5 + 0.5 * Math.sin(time / 900);
    // the flat's outline, dashed, breathing in the Cems' green
    // (salt white, so it reads on green worlds too)
    g.gfx.clear();
    g.gfx.fillStyle(PALETTE[20], 0.1 + 0.06 * breath).fillEllipse(c.x, c.y, F.rx * 2, F.ry * 2);
    const n = 44;
    for (let i = 0; i < n; i += 2) {
      const a0 = (i / n) * Math.PI * 2 + time / 6000, a1 = ((i + 1) / n) * Math.PI * 2 + time / 6000;
      g.gfx.lineStyle(1, PALETTE[2], 0.45 + 0.35 * breath).lineBetween(c.x + Math.cos(a0) * F.rx, c.y + Math.sin(a0) * F.ry, c.x + Math.cos(a1) * F.rx, c.y + Math.sin(a1) * F.ry);
    }
    for (let i = 0; i < n; i += 4) {
      const a0 = (i / n) * Math.PI * 2 - time / 9000;
      g.gfx.fillStyle(PALETTE[12], 0.35 + 0.4 * breath).fillRect(Math.round(c.x + Math.cos(a0) * F.rx * 0.6), Math.round(c.y + Math.sin(a0) * F.ry * 0.6), 1, 1);
    }
    if (g.seeding) return;
    g.jar.y = c.y - 14 + Math.sin(time / 500) * 2;
    g.light.intensity = 0.2 + 0.15 * breath;
    // near: what it still needs; standing on it with all of it: the ring fills and the bed is seeded
    const p = s.player, near = !!p && Math.hypot(p.x - c.x, p.y - c.y) < BIO.seed.readoutPx;
    g.readout.setAlpha(Phaser.Math.Clamp(g.readout.alpha + (near ? dt : -dt) / 250, 0, 1));
    if (near && time % 500 < dt) this.drawReadout();
    const on = !!p && p.alive && !p.locked && !s.stopped && !s.talker.talk && this.playerOnGhost() && this.canSeed();
    g.dwell = on ? g.dwell + dt : 0;
    this.ring?.clear();
    if (!g.dwell) return;
    const k = Math.min(1, g.dwell / BIO.seed.dwellMs);
    this.ring?.lineStyle(1, PALETTE[12], 0.4 + 0.5 * k).beginPath().arc(c.x, c.y, 12, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2).strokePath();
    if (k >= 1) this.seed();
  }

  /** The goal building is finished (or was already), or the bed was just seeded: the Cems wake and the ants come out. */
  wake(animate: boolean, notice = 'THE CEMS WAKE: THE PRINTWORKS TAKES DESIGNS') {
    if (!this.active || !this.lot || this.awake) return;
    this.awake = true;
    const s = this.scene;
    this.mound?.play('antmound:busy');
    this.fungus?.play('fungus:glow');
    this.drink?.start();
    for (const m of this.mats) m.sprite.anims.timeScale = this.breath;
    if (animate) {
      const t = { k: 0 };
      s.tweens.add({ targets: t, k: 1, duration: 1800, ease: 'Sine.easeInOut', onUpdate: () => { const c = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.ValueToColor(0x7c8a84), Phaser.Display.Color.ValueToColor(0xffffff), 1, t.k); for (const m of this.mats) m.sprite.setTint(Phaser.Display.Color.GetColor(c.r, c.g, c.b)); }, onComplete: () => { for (const m of this.mats) m.sprite.clearTint(); } });
      s.fx.sparks(this.center.x, this.center.y - 4, PALETTE[12], 14);
      sound.cemsWake({ x: this.center.x, y: this.center.y });
      s.time.delayedCall(1400, () => s.game.events.emit('notice', notice));
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

  /**
   * Where the design menu opens: the Printworks' door (built) on the homeworld, a seeded bed's design stone elsewhere.
   * top: where the turning model floats; dir 1: you stand south of it, -1: north.
   */
  private get door(): (Pt & { top: number; dir: 1 | -1 }) | null {
    if (this.plinth) return { x: this.plinth.x, y: this.plinth.y + (this.plinth.dir > 0 ? 0 : -14), top: this.plinth.y - 14, dir: this.plinth.dir };
    const b = this.scene.buildings?.list.find((x) => x.id === HOMEWORLD.goal && x.built && !x.vetoed);
    return b ? { ...buildingDoor(b), top: b.y - b.h * 12 - roofHeight(b) - 6, dir: 1 } : null;
  }

  /** Standing in the Printworks' doorway (in front of it), or before the design stone. */
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
    if (d) s.player.setPosition(d.x, d.dir > 0 ? d.y + 16 : d.y - 4);
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

  // ------------------------------------------------------------ the strain: wild Cems changed at a Biolab

  /** How long this bed's prints take against an ordinary bed's. */
  get speed() { return this.strain ? BIO.strain.printTimes : 1; }
  private get breath() { return this.strain ? BIO.strain.breath : 1; }

  /** A finished Biolab on this world, if any. */
  private get biolab() { return this.scene.buildings?.list.find((b) => b.design === 'biolab' && b.built && !b.vetoed); }

  /** Standing at the Biolab's door (in front of the middle of its front). */
  playerAtLab() {
    const b = this.biolab, p = this.scene.player;
    return !!b && !!p && Math.abs(p.x - b.x) < 10 && p.y > b.y - 2 && p.y < b.y + 14;
  }

  /** The bed takes up the strain: its Cems flash, then breathe quicker. Saved with the bed (data.cembed.strain). */
  private adopt(notice?: string) {
    const s = this.scene, c = this.center;
    this.strain = BIO.strain.id;
    for (const m of this.mats) {
      m.sprite.anims.timeScale = this.breath;
      m.sprite.setTintFill(PALETTE[12]);
      s.time.delayedCall(140 + Math.random() * 200, () => m.sprite.active && m.sprite.clearTint());
    }
    s.fx.sparks(c.x, c.y - 4, PALETTE[12], 16);
    s.fx.sparks(c.x, c.y - 4, PALETTE[19], 6);
    sound.cemsWake({ x: c.x, y: c.y });
    if (notice) s.time.delayedCall(900, () => s.game.events.emit('notice', notice));
    const data = { ...(session.planet?.data.cembed ?? { at: Date.now() }), strain: this.strain };
    if (session.planet) session.planet.data.cembed = data;
    if (!s.shot && !s.visit) { s.pending.cembed = data; void s.flushPlanet(); }
  }

  /**
   * The Biolab changes the wild Cems in the hold: the jar flies from the ship into its domes, the vats pulse in the
   * Cems' green while they change, and the strain goes into this world's bed and into the hold's culture.
   */
  alter() {
    const s = this.scene, b = this.biolab, me = session.replicant, st = session.store;
    if (!b || !me?.traits.wild || this.altering || !this.awake) return false;
    this.altering = true;
    this.labDwell = 0;
    this.labRing?.clear();
    const v = s.vesselPos, to = { x: b.x, y: b.y - 22 };
    const jar = s.add.sprite(v.x, v.y - 12, 'culture', 0).setTint(0xf4ffc8).setDepth(6300);
    const arc = { t: 0 }, sx = jar.x, sy = jar.y;
    sound.cultureLoad({ x: v.x, y: v.y });
    s.tweens.add({
      targets: arc, t: 1, duration: 1000, ease: 'Sine.easeInOut',
      onUpdate: () => jar.setPosition(sx + (to.x - sx) * arc.t, sy + (to.y - sy) * arc.t - Math.sin(arc.t * Math.PI) * 36),
      onComplete: () => {
        jar.destroy();
        const light = s.lighting.add({ x: to.x, y: to.y, radius: 40, color: PALETTE[12], intensity: 0, flicker: 0.2 });
        const pulses = 4, each = BIO.strain.alterMs / pulses;
        for (let i = 0; i < pulses; i++) s.time.delayedCall(i * each, () => {
          s.tweens.add({ targets: light, intensity: 0.9, duration: each * 0.35, yoyo: true, ease: 'Sine.easeInOut' });
          s.fx.sparks(to.x + (i % 2 ? 9 : -9), to.y + 2, PALETTE[12], 5);
          sound.cemBreath({ x: to.x, y: to.y });
        });
        s.time.delayedCall(BIO.strain.alterMs, () => {
          s.lighting.remove(light);
          s.fx.sparks(to.x, to.y, PALETTE[19], 14);
          s.shake(100, 0.002);
          sound.cultureSeed({ x: to.x, y: to.y });
          this.altering = false;
          this.adopt(`THE BIOLAB CHANGES THE WILD CEMS: ${BIO.strain.name} PRINTS FASTER`);
        });
      },
    });
    me.traits.wild = null;
    me.traits.culture = { from: `${s.planet.star}:${s.planet.planetIndex}`, at: Date.now(), strain: BIO.strain.id };
    if (st && !s.shot) st.patchTraits(me.id, { wild: null, culture: me.traits.culture }).catch((e) => console.warn('strain save failed', e));
    s.mindLog.push({ t: s.mindClock, text: `${me.name} brought wild Cems to the Biolab and it changed them into ${BIO.strain.name.toLowerCase()}, as Alaina once changed the first; this bed prints faster now` });
    return true;
  }

  /** The strain aboard reaches a bed without it (you walk onto the salt), and the Biolab's door with wild Cems aboard. */
  private updateStrain(dt: number) {
    const s = this.scene, p = s.player, me = session.replicant;
    if (!this.awake || s.visit || !p || !me) return;
    if (!this.strain && me.traits.culture?.strain && this.onFlat(p.x, p.y)) {
      this.adopt(`${BIO.strain.name} TAKES TO THE BED`);
      s.mindLog.push({ t: s.mindClock, text: `${me.name} brought ${BIO.strain.name.toLowerCase()} to this bed; it prints faster now` });
    }
    const b = this.biolab;
    if (!b || !me.traits.wild || this.altering) { if (this.labDwell) { this.labDwell = 0; this.labRing?.clear(); } return; }
    const on = p.alive && !p.locked && !s.stopped && !s.talker.talk && this.playerAtLab();
    this.labDwell = on ? this.labDwell + dt : 0;
    this.labRing ??= s.add.graphics().setDepth(6150);
    this.labRing.clear();
    if (!this.labDwell) return;
    const k = Math.min(1, this.labDwell / BIO.strain.dwellMs);
    this.labRing.lineStyle(1, PALETTE[12], 0.4 + 0.5 * k).beginPath().arc(b.x, b.y + 4, 10, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2).strokePath();
    if (k >= 1) this.alter();
  }

  update(time: number, dt: number) {
    if (this.ghost) this.updateGhost(time, dt);
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
    this.updateStrain(dt);
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
      const light = s.lighting.add({ x: d.x, y: d.top - 9, radius: 34, color: PALETTE[18], intensity: 0.4, flicker: 0.2 });
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
        const r = turntableView(m, h.t * 0.9, BIO.hologram.ppv * (m.h > 16 ? 1.1 : 1.6) * (this.plinth ? 0.7 : 1));
        // anchored by the middle of the model's foot, so it stands on the roof or the stone's lens
        const foot = r.toImage(m.w / 2, m.d / 2, 0);
        h.image.setTexture(paintTexture(s, `design-holo:${which}`, r)).setOrigin(foot.x / r.width, foot.y / r.height);
        h.image.setPosition(d.x, d.top + Math.sin(h.t * 2) * 1.5);
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
