import Phaser from 'phaser';
import { PALETTE, SUPPLIES } from '../../core/data';
import { HOME, isHome } from '../../core/home';
import { session } from '../../core/session';
import type { Building, ReplicantSave } from '../../net/store';
import { planetFor } from '../../world/galaxy';
import type { Light } from '../../fx/Lighting';
import HOMEWORLD from '../../data/homeworld.json';
import TUT from '../../data/tutorial.json';
import type { PlanetScene } from '../PlanetScene';

type State = NonNullable<ReplicantSave['traits']['tutorial']>;
type Pt = { x: number; y: number };
type Lines = keyof typeof TUT.lines;
const MATERIALS = SUPPLIES.materials as Record<string, { icon: number; color: number }>;
/** what Thales' printer still waits for (homeworld.json founded), and which of it the homeworld has none of */
export const GOAL_COST = ((HOMEWORLD.founded as { id: string; cost?: Record<string, number> }[]).find((f) => f.id === HOMEWORLD.goal)?.cost ?? {}) as Record<string, number>;
const LACKS = planetFor(HOME.star, HOME.planet)?.lacks ?? [];
const TRIP = TUT.tripNeed as Record<string, number>;

/**
 * The beginning (story/STORY.md The beginning; tunables src/data/tutorial.json): the steps a new player's Vessel goes
 * through, Thales' words at each, a mote of his light that drifts ahead toward what the step wants next, what the
 * printer still waits for, the growing at every step, and the star map's gate until the first designs stand.
 * A Vessel without traits.tutorial (from before the beginning existed, or handed over) has no gate and nothing to grow.
 * Part of PlanetScene (src/scenes/PlanetScene.ts); `s` is the scene.
 */
export class Tutorial {
  constructor(readonly s: PlanetScene) {}

  private wisp?: { img: Phaser.GameObjects.Image; core: Phaser.GameObjects.Image; light: Light; trail: Phaser.GameObjects.Particles.ParticleEmitter; x: number; y: number; t: number };
  private readout?: { box: Phaser.GameObjects.Container; at: Pt; key: string };
  private nextCheck = 0;
  /** a word of Thales' waiting for you to be free to hear it, and what follows it */
  private queued?: { which: Lines; then?: () => void };

  reset() { this.wisp = undefined; this.readout = undefined; this.nextCheck = 0; this.queued = undefined; }

  get state(): State | null { return session.replicant?.traits.tutorial ?? null; }
  /** The beginning is under way: the stars are not open yet. */
  get active() { const st = this.state; return !!st && st.step !== 'open' && !this.s.visit; }
  get onTarget() { return this.s.planet.star === TUT.target.star && this.s.planet.planetIndex === TUT.target.planet; }

  /** Until the stars open, the ship flies only to the Cems' world and home. */
  allows(star: string, planet: number) {
    return !this.active || isHome(star, planet) || (star === TUT.target.star && planet === TUT.target.planet);
  }
  /** The worlds the map may launch to ('star:planet'). */
  allowedKeys() { return [`${HOME.star}:${HOME.planet}`, `${TUT.target.star}:${TUT.target.planet}`]; }
  /** Those trips cost no fuel and need nobody left behind: Thales filled the tanks. */
  free(star: string, planet: number) { return this.active && this.allows(star, planet); }
  /** Why the map will not fly anywhere else yet. */
  get gateWhy() { return this.state?.step === 'designs' ? TUT.gateWhy.designs : TUT.gateWhy.printer; }
  /** Where the step wants the ship to go next (the map rings it), or null. */
  get guide(): { star: string; planet: number } | null {
    const st = this.state;
    if (!this.active || st?.step !== 'printer') return null;
    if (this.onTarget) return this.lackedShort().length ? null : { star: HOME.star, planet: HOME.planet };
    const g = this.goal, waits = !!g && !g.paid && LACKS.some((m) => this.have(m) < (GOAL_COST[m] ?? 0));
    return isHome(this.s.planet.star, this.s.planet.planetIndex) && waits && st.told.includes('printer') ? { ...TUT.target } : null;
  }

  private save() {
    const me = session.replicant, st = session.store;
    if (!me || this.s.shot || !st) return;
    st.patchTraits(me.id, { tutorial: me.traits.tutorial }).catch((e) => console.warn('tutorial save failed', e));
  }

  /** A new Vessel at the opening: the beginning starts. */
  start() {
    const me = session.replicant;
    if (!me || me.traits.tutorial || me.traits.awake) return;
    me.traits.tutorial = { step: 'wake', grown: 0, printed: [], told: [] };
    this.save();
  }

  /** Awake and named: the first growing, and Thales' printer waits. */
  begin() {
    const st = this.state;
    if (!st || st.step !== 'wake') return;
    st.step = 'printer';
    this.save();
    // (after the title card has faded)
    this.s.time.delayedCall(3800, () => this.grow(1));
  }

  /** Grows to `level` (once each): the Vessel's light, halo and motes widen, with a bloom and a rising chord. */
  grow(level: number) {
    const st = this.state;
    if (!st || st.grown >= level) return;
    st.grown = Math.min(TUT.grow.levels, level);
    this.save();
    this.s.player?.setGrowth(st.grown, true);
    this.s.mindLog.push({ t: this.s.mindClock, text: `${session.replicant?.name ?? 'The new Vessel'} grew` });
  }

  /** Landed: on the Cems' world for the first time, it grows. */
  landed() {
    const st = this.state;
    if (!st || st.step !== 'printer' || !this.onTarget || st.landed) return;
    st.landed = true;
    this.save();
    this.s.time.delayedCall(2600, () => this.grow(2));
  }

  /** The printer took what it waited for. */
  fed() { this.grow(3); }

  /**
   * Thales' printer is finished and the Cems wake: they come aboard the ship (they go wherever you go from now on),
   * the Vessel grows, Thales says what they can do.
   */
  cemsAwake(animate = true) {
    const st = this.state;
    if (!st || (st.step !== 'printer' && st.step !== 'wake')) return;
    st.step = 'designs';
    this.save();
    this.s.trade.takeCulture(animate);
    if (!animate) { this.grow(4); return; }
    this.s.time.delayedCall(2600, () => { this.grow(4); this.s.time.delayedCall(1800, () => this.queue('awake')); });
  }

  /** One of your designs stands: the first few open the stars. */
  designDone(b: Building) {
    const st = this.state, me = session.replicant;
    if (!st || st.step !== 'designs' || !b.design || !me || b.by !== me.id || st.printed.includes(b.id)) return;
    st.printed = [...st.printed, b.id];
    this.save();
    if (st.printed.length >= TUT.designs) this.s.time.delayedCall(1800, () => this.open());
  }

  private open() {
    const st = this.state;
    if (!st || st.step === 'open') return;
    st.step = 'open';
    this.save();
    this.grow(5);
    this.hideWisp();
    const card = () => this.s.game.events.emit('titlecard', 'THE STARS ARE OPEN', 'GO FAR, AND COME HOME SOMETIMES');
    this.s.time.delayedCall(2200, () => { if (this.s.homeworld.thales) this.queue('open', card); else card(); });
  }

  /** Thales will say this as soon as you are free to hear it. */
  private queue(which: Lines, then?: () => void) { this.queued = { which, then }; }

  /** Thales says one of his words (true when he did; he must be here and you free to listen). */
  say(which: Lines, then?: () => void): boolean {
    const s = this.s, th = s.homeworld.thales, st = this.state;
    if (!th || !st || !s.talker.canTalk() || s.talker.talk) return false;
    if (!st.told.includes(which)) { st.told = [...st.told, which]; this.save(); }
    th.sprite.setFlipX(s.player.x < th.x);
    s.talker.openScripted(th, TUT.lines[which], () => then?.());
    return true;
  }

  /** The materials the homeworld lacks that the trip still wants (tutorial.json tripNeed, counted in this store). */
  private lackedShort() {
    return LACKS.filter((m) => (TRIP[m] ?? 0) > 0 && Math.floor(this.s.supplies[m] ?? 0) < TRIP[m]);
  }

  private have(m: string) { return m === 'ember' ? this.s.embers : Math.floor(this.s.supplies[m] ?? 0); }

  private get goal() { return this.s.buildings?.list.find((b) => b.id === HOMEWORLD.goal); }

  update(time: number, dt: number) {
    const s = this.s;
    if (this.queued && !s.shot && s.player && this.say(this.queued.which, this.queued.then)) this.queued = undefined;
    if (s.shot || !s.player || !this.active) { this.hideWisp(); this.showReadout(null); return; }
    const st = this.state!;
    const home = isHome(s.planet.star, s.planet.planetIndex);
    if (time > this.nextCheck) {
      this.nextCheck = time + 500;
      // the printer already stands (a galaxy where it was finished before this Vessel woke)
      // (once the Cems are awake: when you finish it yourself, the Cems' waking moves the beginning on, with words)
      if (st.step === 'printer' && home && this.goal?.built && s.bioworks?.awake) this.cemsAwake(false);
      // designs of yours finished while nobody was here
      if (st.step === 'designs') for (const b of s.buildings.list) if (b.design && b.built && !b.vetoed) this.designDone(b);
    }
    // Thales' word by his printer, the first time you come to him there
    const th = s.homeworld.thales;
    const atPost = !!th?.home && Math.hypot(th.x - th.home.x, th.y - th.home.y) < HOMEWORLD.thales.keepPx + 12;
    if (st.step === 'printer' && home && th && atPost && !st.told.includes('printer') && !th.hold && Math.hypot(th.x - s.player.x, th.y - s.player.y) < TUT.talkPx) this.say('printer');
    this.updateWisp(time, dt, this.target());
    this.updateReadout(time);
  }

  /** What the step wants next, as a place (null: nothing to point at right now). */
  private target(): Pt | null {
    const s = this.s, st = this.state!;
    const home = isHome(s.planet.star, s.planet.planetIndex);
    if (s.talker.talk || s.player.locked) return null;
    if (st.step === 'printer') {
      if (home) {
        const th = s.homeworld.thales;
        if (!st.told.includes('printer')) return th ? { x: th.x, y: th.y } : null;
        const g = this.goal;
        if (!g || g.paid || g.built) return null;
        const short = Object.keys(GOAL_COST).filter((m) => this.have(m) < GOAL_COST[m]);
        const here = short.filter((m) => !LACKS.includes(m));
        if (here.length) return this.nearestSource(here);
        if (short.length) return s.boardSpot;
        return null;
      }
      if (this.onTarget) { const short = this.lackedShort(); return short.length ? this.nearestSource(short) : s.boardSpot; }
      return s.boardSpot;
    }
    if (st.step === 'designs') {
      const bw = s.bioworks;
      if (!bw) return null;
      if (bw.ghostSpot) return bw.ghostSpot;
      if (!bw.awake || s.buildings.printing.length) return null;
      return bw.menuSpot;
    }
    return null;
  }

  /** The nearest node (or tree, for wood) of any of these materials. */
  private nearestSource(materials: string[]): Pt | null {
    const s = this.s, p = s.player;
    let best: Pt | null = null, bd = TUT.wisp.maxPx;
    const consider = (x: number, y: number) => { const d = Math.hypot(x - p.x, y - p.y); if (d < bd) { bd = d; best = { x, y }; } };
    for (const n of s.nodes) if (n.alive && materials.includes(n.kind)) consider(n.x, n.y);
    if (materials.includes('wood')) for (const t of s.trees) if (t.alive) consider(t.x, t.y);
    return best;
  }

  // ------------------------------------------------------------ the wisp: a mote of Thales' light that leads the way

  private makeWisp() {
    const s = this.s, col = PALETTE[TUT.wisp.color];
    const img = s.add.image(s.player.x, s.player.y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(col).setScale(0.16).setAlpha(0).setDepth(6200);
    const core = s.add.image(s.player.x, s.player.y, 'px').setBlendMode(Phaser.BlendModes.ADD).setTint(0xfff4c0).setAlpha(0).setDepth(6201);
    const light = s.lighting.add({ x: s.player.x, y: s.player.y, radius: 20, color: col, intensity: 0, flicker: 0.2 });
    const trail = s.add.particles(0, 0, 'px1', {
      lifespan: 700, speed: { min: 2, max: 8 }, alpha: { start: 0.8, end: 0 }, scale: { start: 1, end: 0.3 },
      tint: [col, PALETTE[10], 0xfff4c0], frequency: 70, blendMode: Phaser.BlendModes.ADD, emitting: false,
    }).setDepth(6199);
    this.wisp = { img, core, light, trail, x: s.player.x, y: s.player.y - 14, t: 0 };
  }

  private hideWisp() {
    const w = this.wisp;
    if (!w) return;
    w.img.setAlpha(0); w.core.setAlpha(0); w.light.intensity = 0; w.trail.stop();
  }

  private updateWisp(time: number, dt: number, to: Pt | null) {
    const s = this.s, p = s.player;
    const d = to ? Math.hypot(to.x - p.x, to.y - p.y) : 0;
    const show = !!to && d > TUT.wisp.showPx;
    if (!show && !this.wisp) return;
    if (!this.wisp) this.makeWisp();
    const w = this.wisp!;
    w.t += dt / 1000;
    const a = Math.max(0, Math.min(1, w.img.alpha / 0.85 + (show ? dt : -dt) / 400));
    if (show) {
      // it hovers ahead of you on the way there, bobbing, and leans further out the farther it is
      const ux = (to!.x - p.x) / d, uy = (to!.y - p.y) / d, lead = TUT.wisp.lead + Math.min(14, d / 60);
      const tx = p.x + ux * lead, ty = p.y - 12 + uy * lead * 0.7 + Math.sin(w.t * 3) * 2;
      w.x += (tx - w.x) * Math.min(1, dt / 160);
      w.y += (ty - w.y) * Math.min(1, dt / 160);
      if (!w.trail.emitting) w.trail.start();
    } else if (w.trail.emitting) w.trail.stop();
    const pulse = 0.85 + 0.15 * Math.sin(w.t * 6);
    w.img.setPosition(Math.round(w.x), Math.round(w.y)).setAlpha(0.85 * a).setScale(0.16 * pulse);
    w.core.setPosition(Math.round(w.x), Math.round(w.y)).setAlpha(a);
    w.trail.setPosition(w.x, w.y);
    w.light.x = w.x; w.light.y = w.y; w.light.intensity = 0.55 * a;
    void time;
  }

  // ------------------------------------------------------------ what the printer still waits for

  /** Near the printer (or, on the Cems' world, the ship): an icon and have/need for each material it waits for. */
  private updateReadout(time: number) {
    const s = this.s, st = this.state!, p = s.player;
    let at: Pt | null = null, mats: string[] = [], need = GOAL_COST;
    const home = isHome(s.planet.star, s.planet.planetIndex);
    const g = this.goal;
    if (st.step === 'printer' && home && g && !g.paid && st.told.includes('printer')) {
      const pr = s.buildings.printers.get(g.id);
      at = pr ? { x: pr.x, y: pr.y - 34 } : { x: g.x, y: g.y - g.h * 12 - 18 };
      mats = Object.keys(GOAL_COST);
    } else if (st.step === 'printer' && this.onTarget) {
      at = { x: s.vesselPos.x, y: s.vesselPos.y - 34 };
      mats = LACKS.filter((m) => TRIP[m]);
      need = TRIP;
    }
    const near = !!at && Math.hypot(p.x - at.x, p.y - at.y - 30) < TUT.readoutPx;
    if (!near) { this.showReadout(null); return; }
    const key = mats.map((m) => `${m}${Math.min(need[m], this.have(m))}`).join(',');
    if (this.readout?.key === key) { this.readout.box.setAlpha(Math.min(1, this.readout.box.alpha + 0.08)); return; }
    const had = !!this.readout;
    this.showReadout(null);
    const box = s.add.container(at!.x, at!.y).setDepth(6200).setAlpha(had ? 1 : 0);
    const per = 30, rows = Math.ceil(mats.length / 3);
    mats.forEach((m, i) => {
      const col = i % 3, row = Math.floor(i / 3), inRow = Math.min(3, mats.length - row * 3);
      const x = (col - (inRow - 1) / 2) * per, y = (row - (rows - 1) / 2) * 11;
      const have = Math.min(need[m], this.have(m)), done = have >= need[m];
      box.add(s.add.image(x - 7, y, 'supplies', MATERIALS[m]?.icon ?? 0).setAlpha(done ? 1 : 0.8));
      box.add(s.add.bitmapText(x + 1, y - 3, 'pixel', `${have}/${need[m]}`).setTint(done ? PALETTE[12] : PALETTE[21]));
    });
    this.readout = { box, at: at!, key };
    void time;
  }

  private showReadout(v: null) {
    if (v === null && this.readout) { this.readout.box.destroy(); this.readout = undefined; }
  }
}
