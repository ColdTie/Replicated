import { session } from '../../core/session';
import type { Gift, PlanetSave, ReplicantSave } from '../../net/store';
import { TOWN_LAYOUT, assignHomes, buildingSpot, inRect, migrateToTown, type Lot } from '../../world/town';
import type { PlanetScene } from '../PlanetScene';

/**
 * The town: moving an old save in once, who lives on which lot, the gifts the original granted.
 * Part of PlanetScene (src/scenes/PlanetScene.ts); `s` is the scene.
 */
export class Town {
  constructor(readonly s: PlanetScene) {}

  /**
   * The town: a save from before it (no layout) moves into it once (every build onto its builder's lot, buildings onto
   * civic lots, the hatch into the square, old-world indexes reset), written back through the usual delta; then every
   * copy without a lot gets the next free one, in birth order.
   */
  settleTown(save: PlanetSave | null, rows: ReplicantSave[]) {
    const town = this.s.map.town;
    const ids = rows.map((r) => r.id);
    const data = save?.data;
    // only with the copies in hand: their builds go to their own lots (a failed load tries again next time)
    if (data && (data.layout ?? 0) < TOWN_LAYOUT && this.s.npcsLoaded) {
      const oldNodes = Object.keys(data.nodes ?? {});
      const res = migrateToTown(data, town, ids, this.s.map.base.pad);
      this.s.migrated = true;
      const p = this.s.pending;
      p.layout = TOWN_LAYOUT;
      p.structures = data.structures ?? [];
      if (data.buildings) p.buildings = structuredClone(data.buildings);
      if (data.warren) p.warren = structuredClone(data.warren);
      p.felled = [];
      for (const k of oldNodes) p.nodes[k] = { hits: 0, at: 0 };
      if (res.stray.length) console.warn('town: no place for', res.stray.join(', '));
      console.info(`town: moved ${res.moved} builds and ${data.buildings?.length ?? 0} buildings into the town (layout ${TOWN_LAYOUT})`);
    }
    this.s.townState = structuredClone(data?.town ?? { lots: {}, civic: {} });
    // buildings stand on their civic lots (a stale write from an old layout cannot move them for good)
    let moved = false;
    for (const b of data?.buildings ?? []) {
      const i = this.s.townState.civic[b.id], lot = i === undefined ? undefined : town.lots[i];
      if (!lot || b.vetoed) continue;
      const at = buildingSpot(lot);
      if (b.x !== at.x || b.y !== at.y) { b.x = at.x; b.y = at.y; moved = true; }
    }
    if (moved && data?.buildings) this.s.pending.buildings = structuredClone(data.buildings);
    // a birth whose row never saved must not hold a lot
    let stale = false;
    for (const k of Object.keys(this.s.townState.lots)) if (k.startsWith('pending')) { delete this.s.townState.lots[k]; stale = true; }
    if (assignHomes(town, this.s.townState, ids).length || this.s.migrated || stale) this.markTown();
  }

  /**
   * What the original granted (data.gifts): each gift becomes builds credited to the copy that asked, on open ground
   * near what it asked for (a building's door, its home, the square), in a ring when asked; then the gift is gone.
   * A gift that finds no room stays for the next load.
   */
  grantGifts(gifts: Gift[] | undefined) {
    if (!gifts?.length || this.s.shot || this.s.visit || !this.s.village) return;
    const town = this.s.map.town, T = 16;
    const paved = (x: number, y: number) => {
      const tx = Math.floor(x / T), ty = Math.floor(y / T);
      return inRect(town.square, tx, ty) || town.streets.some((s) => inRect(s.rect, tx, ty));
    };
    const taken = this.s.village.structures.map((s) => ({ x: s.x, y: s.y }));
    const open = (x: number, y: number, spacing: number) => this.s.isClear(x, y, 14, 8) && !paved(x - 7, y) && !paved(x + 7, y) && !paved(x, y + 6)
      && taken.every((q) => Math.hypot(q.x - x, q.y - y) >= spacing) && this.s.nodes.every((n) => Math.hypot(n.x - x, n.y - y) >= 18);
    const left: Gift[] = [];
    for (const g of gifts) {
      const npc = this.s.npcs.find((n) => n.data.id === g.by);
      const count = Math.max(1, Math.min(12, g.count ?? 1));
      // where it should be: beside a building's front (never on its doorstep), at the copy's home, or by the square
      let anchor = { x: town.hatch.x, y: town.hatch.y + 40 };
      if (g.near?.startsWith('building:')) {
        const want = g.near.slice(9).toLowerCase();
        const b = this.s.buildings.list.find((x) => !x.vetoed && (x.id === want || x.name.toLowerCase() === want));
        if (b) anchor = { x: b.x + b.w * 8 + 14, y: b.y + 4 };
      } else if (g.near === 'home' && npc?.home) anchor = { ...npc.home };
      else if (g.near === 'square') anchor = { x: (town.square.x + town.square.w / 2) * T, y: (town.square.y + town.square.h) * T + 28 };
      // the nearest spot (spiralling out) where every build of it fits
      let spots: { x: number; y: number }[] = [];
      search: for (let r = 0; r <= 220; r += 8) {
        for (let a = 0; a < (r ? 16 : 1); a++) {
          const cx = anchor.x + Math.cos((a / 16) * Math.PI * 2) * r, cy = anchor.y + Math.sin((a / 16) * Math.PI * 2) * r * 0.75;
          const pts = count === 1 ? [{ x: cx, y: cy }] : Array.from({ length: count }, (_, k) => {
            const t = (k / count) * Math.PI * 2, rr = g.ring ?? 22;
            return { x: cx + Math.cos(t) * rr, y: cy + Math.sin(t) * rr * 0.7 };
          });
          if (pts.every((q) => open(q.x, q.y, 16))) { spots = pts; break search; }
        }
      }
      if (!spots.length || !this.s.village.grant(g.type, g.by, spots, npc?.data.traits.trail)) { left.push(g); continue; }
      taken.push(...spots);
      const name = npc?.data.name ?? 'a copy';
      this.s.minds.mindLog.push({ t: this.s.minds.mindClock, text: `${session.replicant?.name ?? 'the original'} granted ${name}'s wish: ${g.why ?? `${count} ${g.type}`}` });
      if (npc) { npc.onWorked(true); this.s.fx.sparks(npc.x, npc.y - 16, npc.trailColor, 6); }
    }
    this.s.pending.gifts = left;
  }

  /** Town assignments changed: write them with the next flush. */
  markTown() {
    this.s.pending.town = structuredClone(this.s.townState);
  }

  /** The lot a copy lives on (undefined when the town is full). */
  homeLot(id: string): Lot | undefined {
    const i = this.s.townState.lots[id];
    return i === undefined ? undefined : this.s.map.town.lots[i];
  }
}
