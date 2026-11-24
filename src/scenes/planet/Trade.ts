import { MIND, PALETTE, SUPPLIES } from '../../core/data';
import { session } from '../../core/session';
import { planetFor, starById } from '../../world/galaxy';
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

  reset() { this.owed = 0; this.grown = 0; this.pressed = 0; }

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

  /** What the copies won of it while nobody was here, and what the Lightbeds grew. */
  accrueAway(hours: number) {
    const n = Math.floor(hours * SIG.perCopyHour * this.s.npcs.filter((c) => !c.blank).length);
    if (n > 0) this.s.warren.add(this.own, n);
    const g = Math.floor(hours * MIND.lightbed.perHour * this.lightbeds);
    if (g > 0) {
      this.s.warren.add('lignin', g);
      this.s.mindLog.push({ t: this.s.mindClock, text: `The Lightbed grew ${g} lignin while you were away` });
    }
    const k = this.keep(Math.floor(hours * MIND.lightkeep.perHour * this.lightkeeps));
    if (k > 0) this.s.mindLog.push({ t: this.s.mindClock, text: `The Lightkeep pressed ${k} lignin into kept light while you were away` });
  }

  /** Ember Gold's Lightkeep (designs.json lightkeep): how many finished ones stand here. */
  get lightkeeps() { return this.s.buildings?.builtOf('lightkeep') ?? 0; }

  /** lignin pressed live and not yet a whole block */
  private pressed = 0;

  /** Presses up to n of the store's lignin into kept light (lightlignin), never past mind.json lightkeep.hold blocks
   * a Lightkeep. Returns how many blocks were made. */
  keep(n: number) {
    const s = this.s, room = MIND.lightkeep.hold * this.lightkeeps - Math.floor(s.supplies.lightlignin ?? 0);
    const m = Math.min(n, room, Math.floor(s.supplies.lignin ?? 0));
    if (m <= 0) return 0;
    const got = s.warren.add('lightlignin', m);
    if (got > 0) { s.supplies.lignin -= got; s.markSupplies(); }
    return got;
  }

  /** Ember Gold's Lightbed (designs.json lightbed): how many finished ones stand here; each grows lignin by the clock. */
  get lightbeds() { return this.s.buildings?.builtOf('lightbed') ?? 0; }

  /** lignin grown live and not yet a whole block */
  private grown = 0;

  /** While you play: now and then a copy brings a piece of it to the store. */
  update(dt: number) {
    const s = this.s;
    if (s.shot || s.visit) return;
    const beds = this.lightbeds;
    if (beds) {
      this.grown += (dt / 3_600_000) * MIND.lightbed.perHour * beds;
      if (this.grown >= 1) {
        this.grown -= 1;
        const bed = s.buildings.list.find((b) => b.design === 'lightbed' && b.built && !b.vetoed);
        const from = bed ? { x: bed.x, y: bed.y - 8 } : s.warren.hatch;
        s.flyMaterial('lignin', from, s.warren.hatch, 1);
      }
    }
    if (this.lightkeeps) {
      this.pressed += (dt / 3_600_000) * MIND.lightkeep.perHour * this.lightkeeps;
      if (this.pressed >= 1) { this.pressed -= 1; this.keep(1); }
    }
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

  /**
   * Launching from a world whose Cems are awake: a culture of them goes into the hold (src/entities/Bioworks.ts) and
   * stays there (the Cems in it keep growing), refreshed from every awake bed you leave.
   */
  loadCulture() {
    const s = this.s, me = session.replicant, st = session.store;
    if (!me || s.visit || !s.bioworks?.sendCulture(s.vesselPos)) return;
    const first = !me.traits.culture;
    // the strain, once the hold or this bed has it, stays in the culture
    const strain = s.bioworks.strain ?? me.traits.culture?.strain;
    me.traits.culture = { from: `${s.planet.star}:${s.planet.planetIndex}`, at: Date.now(), ...(strain ? { strain } : {}) };
    if (first) s.mindLog.push({ t: s.mindClock, text: `${me.name} took a culture of the Cems aboard the ship, to seed a bed on other worlds` });
    if (st && !s.shot) st.patchTraits(me.id, { culture: me.traits.culture }).catch((e) => console.warn('culture save failed', e));
  }

  /**
   * The Cems first wake for you (Thales' printer is finished): a culture of them goes aboard the ship at once. From
   * then on they travel with you (story/STORY.md The beginning: they must be brought, and that happens by itself).
   */
  takeCulture(animate: boolean) {
    const s = this.s, me = session.replicant, st = session.store;
    if (!me || s.visit || me.traits.culture) return;
    const strain = s.bioworks?.strain;
    me.traits.culture = { from: `${s.planet.star}:${s.planet.planetIndex}`, at: Date.now(), ...(strain ? { strain } : {}) };
    if (animate && !s.vesselAway) s.time.delayedCall(1800, () => s.bioworks?.sendCulture(s.vesselPos));
    s.mindLog.push({ t: s.mindClock, text: `a culture of the Cems went aboard ${me.name}'s ship: they travel with it now` });
    if (st && !s.shot) st.patchTraits(me.id, { culture: me.traits.culture }).catch((e) => console.warn('culture save failed', e));
  }

  /**
   * Launching for a world that lacks a material (planets.json lacks: the homeworld has no copper or quartz): the hold
   * also takes up to signature.lacksHold of each from this store, for the store there. Where a finished Seedarc stands
   * (Watcher's wish, designs.json seedarc) it also takes up to mind.json seedarc.carry living seed, for the planters
   * of the world it lands on.
   */
  loadGoods(to: string, toPlanet: number) {
    const s = this.s, me = session.replicant, st = session.store;
    if (!me || s.visit) return;
    const lacks = planetFor(to, toPlanet)?.lacks ?? [];
    const items: Record<string, number> = {};
    for (const m of lacks) {
      const n = Math.min(SIG.lacksHold, Math.floor(s.supplies[m] ?? 0));
      if (n < 1) continue;
      items[m] = n;
      s.supplies[m] = Math.round(((s.supplies[m] ?? 0) - n) * 100) / 100;
      s.time.delayedCall(Object.keys(items).length * 250, () => s.flyMaterial(m, s.warren.hatch, s.vesselPos, 0));
    }
    const seeds = Math.min(MIND.seedarc.carry, Math.floor(s.supplies.seed ?? 0));
    if (s.buildings?.stands('seedarc') && seeds >= 1 && !items.seed && `${to}:${toPlanet}` !== `${s.planet.star}:${s.planet.planetIndex}`) {
      items.seed = seeds;
      s.supplies.seed = Math.round(((s.supplies.seed ?? 0) - seeds) * 100) / 100;
      s.time.delayedCall(Object.keys(items).length * 250, () => s.flyMaterial('seed', s.warren.hatch, s.vesselPos, 0));
    }
    if (!Object.keys(items).length) return;
    s.markSupplies();
    me.traits.goods = { from: `${s.planet.star}:${s.planet.planetIndex}`, to: `${to}:${toPlanet}`, items };
    s.mindLog.push({ t: s.mindClock, text: `${me.name} loaded ${Object.entries(items).map(([m, n]) => `${n} ${m}`).join(' and ')} into the ship's hold` });
    if (st && !s.shot) st.patchTraits(me.id, { goods: me.traits.goods }).catch((e) => console.warn('goods save failed', e));
  }

  /** Landed: the hold is emptied into this world's store, flying from the vessel to the hatch. */
  unload() {
    this.unloadGoods();
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

  /** What the hold brought for a world that lacks it: into the store, wherever the ship landed. */
  private unloadGoods() {
    const s = this.s, me = session.replicant, st = session.store;
    const g = me?.traits.goods;
    if (!me || !g || s.visit) return;
    me.traits.goods = null;
    if (st && !s.shot) st.patchTraits(me.id, { goods: null }).catch((e) => console.warn('goods save failed', e));
    Object.entries(g.items).forEach(([m, n], i) => s.time.delayedCall(1200 + i * 500, () => s.flyMaterial(m, s.vesselPos, s.warren.hatch, n)));
    s.mindLog.push({ t: s.mindClock, text: `${me.name} brought ${Object.entries(g.items).map(([m, n]) => `${n} ${m}`).join(' and ')} home in the ship's hold` });
  }
}
