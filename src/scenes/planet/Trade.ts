import { PALETTE, SUPPLIES } from '../../core/data';
import { session } from '../../core/session';
import { starById } from '../../world/galaxy';
import type { PlanetScene } from '../PlanetScene';

const SIG = SUPPLIES.signature;
const ALL = new Set(Object.values(SIG.byWorld));

/**
 * Each world makes one material only it has; the copies win it while they work, the vessel's hold carries it to the
 * next world, and what came from far away lifts every copy's mood there. Tunables: supplies.json signature.
 * Part of PlanetScene (src/scenes/PlanetScene.ts); `s` is the scene.
 */
export class Trade {
  constructor(readonly s: PlanetScene) {}

  /** live winnings not yet a whole unit */
  private owed = 0;

  reset() { this.owed = 0; }

  /** This world's own material. */
  get own(): string { return (SIG.byWorld as Record<string, string>)[this.s.planet.id] ?? 'regolith'; }

  /** "ice glass" */
  static nameOf(m: string) { return (SIG.names as Record<string, string>)[m] ?? m; }

  /** Materials from other worlds in the store: each kind lifts every copy's mood a little. */
  get importMood() {
    const own = this.own;
    const kinds = [...ALL].filter((m) => m !== own && (this.s.supplies[m] ?? 0) >= 1).length;
    return Math.min(SIG.importMoodMax, kinds * SIG.importMood);
  }

  /** What the copies won of it while nobody was here. */
  accrueAway(hours: number) {
    const n = Math.floor(hours * SIG.perCopyHour * this.s.npcs.filter((c) => !c.blank).length);
    if (n > 0) this.s.warren.add(this.own, n);
  }

  /** While you play: now and then a copy brings a piece of it to the store. */
  update(dt: number) {
    const s = this.s;
    if (s.shot || s.visit) return;
    const workers = s.npcs.filter((c) => !c.blank && !c.below);
    if (!workers.length) return;
    this.owed += (dt / 3_600_000) * SIG.perCopyHour * workers.length;
    if (this.owed < 1) return;
    this.owed -= 1;
    const by = workers[Math.floor(Math.random() * workers.length)];
    s.flyMaterial(this.own, { x: by.x, y: by.y - 10 }, s.warren.hatch, 1);
  }

  /** Launching: the hold takes up to `hold` of this world's material from the store. */
  loadHold() {
    const s = this.s, me = session.replicant, st = session.store;
    if (!me || s.visit) return;
    const own = this.own;
    const n = Math.min(SIG.hold, Math.floor(s.supplies[own] ?? 0));
    if (n < 1) return;
    s.supplies[own] = Math.round(((s.supplies[own] ?? 0) - n) * 100) / 100;
    s.markSupplies();
    me.traits.cargo = { material: own, n, from: s.planet.star };
    s.flyMaterial(own, s.warren.hatch, s.vesselPos, 0);
    s.mindLog.push({ t: s.mindClock, text: `${me.name} loaded ${n} ${Trade.nameOf(own)} into the vessel's hold` });
    if (st && !s.shot) st.patchTraits(me.id, { cargo: me.traits.cargo }).catch((e) => console.warn('cargo save failed', e));
  }

  /** Landed: the hold is emptied into this world's store, flying from the vessel to the hatch. */
  unload() {
    const s = this.s, me = session.replicant, st = session.store;
    const c = me?.traits.cargo;
    if (!me || !c || s.visit) return;
    me.traits.cargo = null;
    if (st && !s.shot) st.patchTraits(me.id, { cargo: null }).catch((e) => console.warn('cargo save failed', e));
    if (c.from === s.planet.star && c.material === this.own) { s.warren.add(c.material, c.n); return; }
    s.time.delayedCall(1200, () => s.flyMaterial(c.material, s.vesselPos, s.warren.hatch, c.n));
    const from = starById(c.from)?.name ?? c.from;
    s.mindLog.push({ t: s.mindClock, text: `${me.name} brought ${c.n} ${Trade.nameOf(c.material)} from ${from}` });
    if (c.material !== this.own) s.time.delayedCall(2200, () => s.fx.sparks(s.warren.hatch.x, s.warren.hatch.y - 8, PALETTE[(SUPPLIES.materials as Record<string, { color: number }>)[c.material]?.color ?? 19], 12));
  }
}
