// The town at the landing site: a paved square around the vessel, the Replicator pad and the cradle, streets running
// out from it, and lots along the streets: a home lot for every copy (named build slots: the house at the back, a
// shed, gardens, a flag by the path, a sign at the corner, two lamp posts at the frontage) and larger civic lots for
// the buildings at the square's north edge and the street ends. Lamp spots stand along the streets, and the way down
// to the warren is dug in a corner of the square, out of every walking line. Pure tile math, deterministic per world
// (only its size decides how far the streets reach); tunables in src/data/town.json. Who lives where is saved per
// planet (planet_states.data.town); planetGen keeps the whole town open floor.
import TOWN from '../data/town.json';
import type { Building, PlanetData, StructureSave } from '../net/store';
import type { PlanetMap } from './planetGen';

export interface Pt { x: number; y: number }
/** tiles */
export interface Rect { x: number; y: number; w: number; h: number }
/** the side of the lot its street (or the square) is on */
export type Face = 'n' | 's' | 'e' | 'w';
export interface Slot { name: string; kinds: string[]; x: number; y: number }
export interface Lot {
  /** index in Town.lots (planet_states.data.town points here); home lots first, nearest the square first */
  index: number;
  kind: 'home' | 'civic';
  rect: Rect;
  face: Face;
  /** the street it lies on and how far along it (tiles from the square's edge) the lot ends */
  street: Face; reach: number;
  /** home: build slots and the two lamp posts at the frontage (px, feet); civic: none */
  slots: Slot[]; lamps: Pt[];
  /** home: the house slot's door; civic: where a building's foot goes (px) */
  spot: Pt;
  /** where whoever lives here likes to stand (px) */
  yard: Pt;
  /** the middle of its frontage, on the verge (px) */
  front: Pt;
}
export interface Town {
  square: Rect;
  streets: { dir: Face; rect: Rect; length: number }[];
  lots: Lot[];
  /** street lamp spots (px, feet) */
  posts: Pt[];
  /** the way down to the warren (px) */
  hatch: Pt;
  /** everything, lots included (tiles) */
  bounds: Rect;
  margin: number;
}
/** planet_states.data.town: copy id -> lot index, building id -> lot index */
export interface TownState { lots: Record<string, number>; civic: Record<string, number> }

export const TOWN_LAYOUT = TOWN.layout;
export const TOWN_TUNING = TOWN;
const T = 16;

const overlaps = (a: Rect, b: Rect, gap: number) => a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
const contains = (r: Rect, x: number, y: number) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
/** the street's rect grown by its verges on the long sides */
const withVerge = (dir: Face, r: Rect, v: number): Rect => (dir === 'w' || dir === 'e' ? { x: r.x, y: r.y - v, w: r.w, h: r.h + v * 2 } : { x: r.x - v, y: r.y, w: r.w + v * 2, h: r.h });

/** A slot's spot inside a lot: along / depth (tiles, 0 = the west or north end / the row by the street) -> px feet. */
function lotPoint(rect: Rect, face: Face, a: number, d: number): Pt {
  const D = face === 'n' || face === 's' ? rect.h : rect.w;
  let col: number, row: number;
  if (face === 's') { col = a; row = D - 1 - d; }
  else if (face === 'n') { col = a; row = d; }
  else if (face === 'w') { col = d; row = a; }
  else { col = D - 1 - d; row = a; }
  return { x: Math.round((rect.x + col) * T + T / 2), y: Math.round((rect.y + row) * T + 14) };
}

/** Where the lot meets its street: the middle of the frontage, out on the verge (px). */
function frontOf(rect: Rect, face: Face): Pt {
  if (face === 's') return { x: (rect.x + rect.w / 2) * T, y: (rect.y + rect.h) * T + 8 };
  if (face === 'n') return { x: (rect.x + rect.w / 2) * T, y: rect.y * T - 8 };
  if (face === 'w') return { x: rect.x * T - 8, y: (rect.y + rect.h / 2) * T };
  return { x: (rect.x + rect.w) * T + 8, y: (rect.y + rect.h / 2) * T };
}

/**
 * The footpath from the street to a door (px polyline): straight up to a door that faces the street, otherwise along
 * the house's side (or the row in front of it) and in. half = half the width of what stands there.
 */
export function footpath(lot: Lot, door: Pt, half = 12): Pt[] {
  const r = lot.rect;
  if (lot.face === 's') return [{ x: door.x, y: (r.y + r.h) * T + 12 }, { x: door.x, y: door.y + 2 }];
  if (lot.face === 'n') { const sx = door.x + half; return [{ x: sx, y: r.y * T - 12 }, { x: sx, y: door.y + 7 }, { x: door.x, y: door.y + 7 }]; }
  if (lot.face === 'w') return [{ x: r.x * T - 12, y: door.y + 7 }, { x: door.x, y: door.y + 7 }];
  return [{ x: (r.x + r.w) * T + 12, y: door.y + 7 }, { x: door.x, y: door.y + 7 }];
}

/** The town for a world of w x h tiles whose base center is tile (cx, cy). */
export function layoutTown(w: number, h: number, cx: number, cy: number, islandRadius: number): Town {
  const C = TOWN;
  const sw = C.street.width, v = C.street.verge;
  const sq: Rect = { x: cx + C.square.x, y: cy + C.square.y, w: C.square.w, h: C.square.h };
  // how far from the center the town may reach and still stand on the island (its coast is ragged)
  const k = Math.max(0.3, islandRadius - C.islandSafety);
  const lo = { x: cx - Math.floor((w / 2) * k) + C.margin, y: cy - Math.floor((h / 2) * k) + C.margin };
  const hi = { x: cx + Math.floor((w / 2) * k) - C.margin, y: cy + Math.floor((h / 2) * k) - C.margin };
  const onIsland = (r: Rect) => r.x >= lo.x && r.y >= lo.y && r.x + r.w - 1 <= hi.x && r.y + r.h - 1 <= hi.y;
  const row = cy + C.street.row, col = cx + C.street.col;
  const civ = C.civic, lot = C.lot;

  // streets: as long as asked, shortened to leave room for the civic lot at the end (or to fit at all)
  const room: Record<Face, number> = { w: sq.x - lo.x, e: hi.x - (sq.x + sq.w) + 1, n: sq.y - lo.y, s: hi.y - (sq.y + sq.h) + 1 };
  const streets: Town['streets'] = [];
  const endCivic: Partial<Record<Face, boolean>> = {};
  for (const dir of ['w', 'e', 'n', 's'] as Face[]) {
    const want = C.streets[dir];
    let L = Math.min(want, room[dir] - civ.depth);
    if (L >= 6) endCivic[dir] = true;
    else L = Math.max(0, Math.min(want, room[dir]));
    if (L <= 0) continue;
    const rect = dir === 'w' ? { x: sq.x - L, y: row, w: L, h: sw } : dir === 'e' ? { x: sq.x + sq.w, y: row, w: L, h: sw }
      : dir === 'n' ? { x: col, y: sq.y - L, w: sw, h: L } : { x: col, y: sq.y + sq.h, w: sw, h: L };
    streets.push({ dir, rect, length: L });
  }
  const streetOf = (dir: Face) => streets.find((s) => s.dir === dir);
  const paved = [sq, ...streets.map((s) => withVerge(s.dir, s.rect, v))];

  // lots: civic ones first (the square's north edge, then the street ends), then homes along the streets
  type Draft = Omit<Lot, 'index' | 'slots' | 'lamps' | 'spot' | 'yard' | 'front'>;
  const drafts: Draft[] = [];
  const fits = (r: Rect) => onIsland(r) && !paved.some((p) => overlaps(r, p, 0)) && !drafts.some((d) => overlaps(r, d.rect, C.clearance));
  const reachFrom = (dir: Face, r: Rect) => (dir === 'w' ? sq.x - r.x : dir === 'e' ? r.x + r.w - (sq.x + sq.w) : dir === 'n' ? sq.y - r.y : r.y + r.h - (sq.y + sq.h));
  for (const at of C.civicAt) {
    let r: Rect | null = null, face: Face = 's', street: Face = 'n';
    if (at === 'nw' || at === 'ne') {
      const x = at === 'nw' ? col - v - civ.along : col + sw + v;
      r = { x, y: sq.y - 1 - civ.depth, w: civ.along, h: civ.depth }; face = 's'; street = 'n';
    } else {
      const s = streetOf(at as Face);
      if (!s || !endCivic[at as Face]) continue;
      street = at as Face;
      const mid = (n: number, size: number) => n + Math.floor(sw / 2) - Math.floor(size / 2);
      if (at === 'w') { r = { x: s.rect.x - civ.depth, y: mid(row, civ.along), w: civ.depth, h: civ.along }; face = 'e'; }
      else if (at === 'e') { r = { x: s.rect.x + s.rect.w, y: mid(row, civ.along), w: civ.depth, h: civ.along }; face = 'w'; }
      else if (at === 'n') { r = { x: mid(col, civ.along), y: s.rect.y - civ.depth, w: civ.along, h: civ.depth }; face = 's'; }
      else { r = { x: mid(col, civ.along), y: s.rect.y + s.rect.h, w: civ.along, h: civ.depth }; face = 'n'; }
    }
    if (r && fits(r)) drafts.push({ kind: 'civic', rect: r, face, street, reach: reachFrom(street, r) });
  }
  const homes: Draft[] = [];
  const addHome = (r: Rect, face: Face, street: Face) => { const d = { kind: 'home' as const, rect: r, face, street, reach: reachFrom(street, r) }; drafts.push(d); homes.push(d); };
  for (const dir of ['w', 'e', 'n', 's'] as Face[]) {
    const s = streetOf(dir);
    if (!s || ((dir === 'n' || dir === 's') && !C.crossLots.includes(dir))) continue;
    const end = dir === 'w' ? s.rect.x : dir === 'e' ? s.rect.x + s.rect.w - 1 : dir === 'n' ? s.rect.y : s.rect.y + s.rect.h - 1;
    for (const side of [0, 1]) {
      // walk outward from the square one tile at a time, taking every spot that is free
      for (let t = dir === 'w' || dir === 'e' ? C.lotStart : 1; ; t++) {
        let r: Rect, face: Face;
        if (dir === 'w' || dir === 'e') {
          const x = dir === 'w' ? sq.x - t - lot.along : sq.x + sq.w + t;
          if (dir === 'w' ? x < end : x + lot.along - 1 > end) break;
          r = side === 0 ? { x, y: row - v - lot.depth, w: lot.along, h: lot.depth } : { x, y: row + sw + v, w: lot.along, h: lot.depth };
          face = side === 0 ? 's' : 'n';
        } else {
          const y = dir === 'n' ? sq.y - t - lot.along : sq.y + sq.h + t;
          if (dir === 'n' ? y < end : y + lot.along - 1 > end) break;
          r = side === 0 ? { x: col - v - lot.depth, y, w: lot.depth, h: lot.along } : { x: col + sw + v, y, w: lot.depth, h: lot.along };
          face = side === 0 ? 'e' : 'w';
        }
        if (fits(r)) { addHome(r, face, dir); t += lot.along + C.gap - 1; }
      }
    }
  }

  // homes nearest the square first (the main street before the cross streets), then the civic lots in their order
  const sqDist = (r: Rect) => {
    const mx = r.x + r.w / 2, my = r.y + r.h / 2;
    const dx = Math.max(sq.x - mx, 0, mx - (sq.x + sq.w)), dy = Math.max(sq.y - my, 0, my - (sq.y + sq.h));
    return Math.hypot(dx, dy);
  };
  const cross = (d: Draft) => (d.street === 'n' || d.street === 's' ? 1 : 0);
  homes.sort((a, b) => cross(a) - cross(b) || sqDist(a.rect) - sqDist(b.rect) || a.rect.y - b.rect.y || a.rect.x - b.rect.x);
  const ordered = [...homes, ...drafts.filter((d) => d.kind === 'civic')];
  const lots: Lot[] = ordered.map((d, index) => {
    const { rect, face } = d;
    const front = frontOf(rect, face);
    if (d.kind === 'civic') {
      // a building stands with its foot a tile in from the lot's lower edge, centered
      const spot = { x: Math.round((rect.x + rect.w / 2) * T), y: (rect.y + rect.h - 1) * T + 6 };
      const yard = face === 's' ? { x: spot.x, y: spot.y + 12 } : face === 'n' ? { x: spot.x, y: spot.y + 10 } : { x: face === 'w' ? rect.x * T + 10 : (rect.x + rect.w) * T - 10, y: spot.y + 8 };
      return { ...d, index, slots: [], lamps: [], spot, yard, front };
    }
    const slots = C.slots.map((s) => ({ name: s.name, kinds: s.kinds, ...lotPoint(rect, face, s.at[0], s.at[1]) }));
    const lamps = C.lamps.map(([a, dd]) => lotPoint(rect, face, a, dd));
    const house = slots.find((s) => s.name === 'house')!;
    const spot = { x: house.x + 9, y: house.y };
    const yard = lotPoint(rect, face, C.yard[0], C.yard[1]);
    return { ...d, index, slots, lamps, spot, yard, front };
  });

  // lamp spots along the streets (both verges) and at the square's corners, clear of the lots' own lamps and paths
  const posts: Pt[] = [];
  const hatch = { x: (cx + C.hatch[0]) * T + T / 2, y: (cy + C.hatch[1]) * T + T / 2 };
  const near = (p: Pt, list: Pt[], d: number) => list.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < d);
  const lotLamps = lots.flatMap((l) => l.lamps);
  const fronts = lots.map((l) => l.front);
  for (const s of streets) {
    for (const side of [0, 1]) {
      for (let t = 1; t < s.length; t += C.postEvery) {
        let tx: number, ty: number;
        if (s.dir === 'w' || s.dir === 'e') { tx = s.dir === 'w' ? s.rect.x + s.rect.w - 1 - t : s.rect.x + t; ty = side === 0 ? s.rect.y - 1 : s.rect.y + s.rect.h; }
        else { ty = s.dir === 'n' ? s.rect.y + s.rect.h - 1 - t : s.rect.y + t; tx = side === 0 ? s.rect.x - 1 : s.rect.x + s.rect.w; }
        const p = { x: tx * T + T / 2, y: ty * T + 14 };
        if (!near(p, lotLamps, 40) && !near(p, fronts, 28) && !near(p, posts, 40)) posts.push(p);
      }
    }
  }
  for (const [x, y] of [[sq.x, sq.y], [sq.x + sq.w - 1, sq.y], [sq.x, sq.y + sq.h - 1], [sq.x + sq.w - 1, sq.y + sq.h - 1]]) {
    const p = { x: x * T + T / 2, y: y * T + 14 };
    if (!near(p, [hatch], 56) && !near(p, posts, 40)) posts.push(p);
  }

  const all = [sq, ...paved, ...lots.map((l) => l.rect)];
  const bx = Math.min(...all.map((r) => r.x)), by = Math.min(...all.map((r) => r.y));
  const bounds = { x: bx, y: by, w: Math.max(...all.map((r) => r.x + r.w)) - bx, h: Math.max(...all.map((r) => r.y + r.h)) - by };
  return { square: sq, streets, lots, posts, hatch, bounds, margin: C.margin };
}

/**
 * mask per tile: 3 paved (the square, streets and verges), 2 a lot, 1 open ground within the margin around and between
 * them, 0 elsewhere; dist = tiles from the nearest paved or lot tile (0 on them, 8-way, capped at 255).
 */
export function townMask(town: Town, w: number, h: number) {
  const mask = new Uint8Array(w * h);
  const stamp = (r: Rect, v: number) => {
    for (let y = Math.max(0, r.y); y < Math.min(h, r.y + r.h); y++) for (let x = Math.max(0, r.x); x < Math.min(w, r.x + r.w); x++) mask[y * w + x] = Math.max(mask[y * w + x], v);
  };
  for (const l of town.lots) stamp(l.rect, 2);
  stamp(town.square, 3);
  for (const s of town.streets) stamp(withVerge(s.dir, s.rect, TOWN.street.verge), 3);
  const dist = new Uint8Array(w * h).fill(255);
  const queue: number[] = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) { dist[i] = 0; queue.push(i); }
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi], x = i % w, y = (i / w) | 0, d = dist[i] + 1;
    if (d > 254) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= w || ny >= h || dist[ny * w + nx] <= d) continue;
      dist[ny * w + nx] = d;
      queue.push(ny * w + nx);
    }
  }
  for (let i = 0; i < mask.length; i++) if (!mask[i] && dist[i] <= town.margin) mask[i] = 1;
  return { mask, dist };
}

export const inRect = contains;

/** Which lot (index) contains this pixel, or -1. */
export function lotAt(town: Town, x: number, y: number) {
  const tx = Math.floor(x / T), ty = Math.floor(y / T);
  return town.lots.findIndex((l) => contains(l.rect, tx, ty));
}

/**
 * Lot assignment: every copy without a lot gets the next free home lot, in birth order (as listed). A lot is taken
 * when a copy lives there or a building stands on it. Returns the ids that were given a lot just now.
 */
export function assignHomes(town: Town, state: TownState, ids: string[]) {
  const given: string[] = [];
  for (const id of ids) {
    if (state.lots[id] !== undefined && town.lots[state.lots[id]]) continue;
    const i = nextFreeLot(town, state, 'home');
    if (i < 0) break;
    state.lots[id] = i;
    given.push(id);
  }
  return given;
}

/** The first lot of this kind nobody lives on and no building stands on (-1 when the town is full). */
export function nextFreeLot(town: Town, state: TownState, kind: 'home' | 'civic') {
  const used = new Set([...Object.values(state.lots), ...Object.values(state.civic)]);
  return town.lots.findIndex((l) => l.kind === kind && !used.has(l.index));
}

/**
 * A path over open ground (4-way over tiles a copy can walk: floor and water, not rock, ruin walls or the void),
 * pulled tight into a few waypoints (px). Null when there is no way. Copies walk through solids (trees, buildings),
 * so only the tiles count.
 */
export function surfaceRoute(map: PlanetMap, from: Pt, to: Pt, maxCells = 20000): Pt[] | null {
  const W = map.w, H = map.h;
  const ok = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && map.walls[y][x] < 0;
  const sx = Math.floor(from.x / T), sy = Math.floor(from.y / T), ex = Math.floor(to.x / T), ey = Math.floor(to.y / T);
  if (!ok(ex, ey)) return null;
  const prev = new Int32Array(W * H).fill(-1);
  const start = sy * W + sx, goal = ey * W + ex;
  prev[start] = start;
  const queue = [start];
  let found = start === goal;
  for (let qi = 0; qi < queue.length && !found && qi < maxCells; qi++) {
    const i = queue[qi], x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, j = ny * W + nx;
      if (!ok(nx, ny) || prev[j] >= 0) continue;
      prev[j] = i;
      if (j === goal) { found = true; break; }
      queue.push(j);
    }
  }
  if (!found) return null;
  const cells: Pt[] = [];
  for (let i = goal; i !== start; i = prev[i]) cells.push({ x: (i % W) * T + T / 2, y: ((i / W) | 0) * T + T / 2 });
  cells.reverse();
  // string pulling: keep a waypoint only where the straight line from the last one would cross a wall
  const clear = (a: Pt, b: Pt) => {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4);
    for (let s = 1; s <= n; s++) { const t = s / n; if (!ok(Math.floor((a.x + (b.x - a.x) * t) / T), Math.floor((a.y + (b.y - a.y) * t) / T))) return false; }
    return true;
  };
  const out: Pt[] = [];
  let at = from;
  for (let i = 0; i < cells.length; i++) {
    if (i + 1 < cells.length && clear(at, cells[i + 1])) continue;
    out.push(cells[i]);
    at = cells[i];
  }
  out.push(to);
  return out;
}

// ------------------------------------------------------------ building on the lots

/** Something already stands here (a build, or a job claimed for it). */
const takenAt = (p: Pt, taken: Pt[]) => taken.some((q) => Math.abs(q.x - p.x) < 3 && Math.abs(q.y - p.y) < 3);

/**
 * Where a build of this kind goes on a home lot: the first free slot that takes it (its favourite kinds first);
 * a lamp takes a frontage post, then the nearest free street post within lampReachPx. Null when nothing is free.
 * A lot whose own slots and lamp posts are all taken is full: nothing more goes there (that is the cap).
 */
export function slotFor(town: Town, lot: Lot, kind: string, taken: Pt[]): Pt | null {
  if (lotFull(lot, taken)) return null;
  if (kind === 'lamp') {
    const own = lot.lamps.find((p) => !takenAt(p, taken));
    if (own) return own;
    const d = (p: Pt) => Math.hypot(p.x - lot.front.x, p.y - lot.front.y);
    return town.posts.filter((p) => !takenAt(p, taken) && d(p) < TOWN.lampReachPx).sort((a, b) => d(a) - d(b))[0] ?? null;
  }
  const fit = lot.slots.filter((s) => s.kinds.includes(kind) && !takenAt(s, taken));
  fit.sort((a, b) => a.kinds.indexOf(kind) - b.kinds.indexOf(kind));
  return fit[0] ? { x: fit[0].x, y: fit[0].y } : null;
}

export function lotFull(lot: Lot, taken: Pt[]) {
  return lot.kind === 'home' && lot.slots.every((s) => takenAt(s, taken)) && lot.lamps.every((p) => takenAt(p, taken));
}

/** Where a building's foot goes on a lot (px): a civic lot's spot, or the middle of a home lot near its lower edge. */
export function buildingSpot(lot: Lot): Pt {
  if (lot.kind === 'civic') return { ...lot.spot };
  const r = lot.rect;
  return { x: Math.round((r.x + r.w / 2) * T), y: (r.y + r.h - 1) * T + 6 };
}

/** The door of a building (px), for its footpath. */
export function buildingDoor(b: { x: number; y: number; w: number; door: string }): Pt {
  return b.door === 'west' ? { x: b.x - b.w * 8 + 4, y: b.y } : b.door === 'east' ? { x: b.x + b.w * 8 - 4, y: b.y } : { x: b.x, y: b.y };
}

/** Free lot for a building: a civic lot first, else the next home lot nobody lives on (-1 when there is none). */
export function lotForBuilding(town: Town, state: TownState) {
  const civic = nextFreeLot(town, state, 'civic');
  return civic >= 0 ? civic : nextFreeLot(town, state, 'home');
}

/** Copies in the order they were born: created_at where the rows carry it, then id; otherwise as listed. */
export function birthOrder<R extends { id: string }>(rows: R[]): R[] {
  const at = (r: R) => (r as { created_at?: string }).created_at;
  return rows.map((r, i) => ({ r, i })).sort((a, b) => {
    const x = at(a.r), y = at(b.r);
    if (x && y && x !== y) return x < y ? -1 : 1;
    if (x && y) return a.r.id < b.r.id ? -1 : a.r.id > b.r.id ? 1 : 0;
    return a.i - b.i;
  }).map((e) => e.r);
}

/** The lots in use and what to paint to them: the door at the end of each footpath (and how wide what stands there is). */
export function occupiedLots(town: Town, state: TownState, buildings: Building[] = []) {
  const out = new Map<number, { door: Pt; half: number }>();
  for (const i of Object.values(state.lots)) { const l = town.lots[i]; if (l) out.set(i, { door: l.spot, half: 12 }); }
  for (const [id, i] of Object.entries(state.civic)) {
    const b = buildings.find((x) => x.id === id && !x.vetoed);
    if (b && town.lots[i]) out.set(i, { door: buildingDoor(b), half: b.w * 8 + 6 });
  }
  return out;
}

/**
 * Moves a planet saved before the town (no layout, or an older one) into it, once: every copy gets a lot in birth
 * order, every structure but the Replicator goes to a slot on its builder's lot (builds without a builder here, or
 * that do not fit, go to the nearest free slot anywhere in town), buildings move onto civic lots (everything else
 * about them kept), the warren's way down moves to the hatch in the square, and state indexed by the old world's
 * layout (crystal damage, felled trees) is reset. Mutates data; returns what was moved and anything that found no
 * place at all (kept where it was).
 */
export function migrateToTown(data: PlanetData, town: Town, copyIds: string[], pad: Pt) {
  const state: TownState = { lots: {}, civic: {} };
  assignHomes(town, state, copyIds);
  const stray: string[] = [];
  // buildings first, so the homes they might borrow are known
  for (const b of [...(data.buildings ?? [])].sort((a, c) => a.at - c.at)) {
    if (b.vetoed) continue;
    const i = lotForBuilding(town, state);
    if (i < 0) { stray.push(`building ${b.name}`); continue; }
    const p = buildingSpot(town.lots[i]);
    b.x = p.x; b.y = p.y;
    state.civic[b.id] = i;
  }
  const taken: Pt[] = [];
  const structures = data.structures ?? [];
  const homeOf = (by?: string) => (by && state.lots[by] !== undefined ? town.lots[state.lots[by]] : undefined);
  const overflow: StructureSave[] = [];
  for (const s of [...structures].sort((a, c) => a.at - c.at)) {
    if (s.type === 'replicator') { s.x = pad.x; s.y = pad.y; continue; }
    const lot = homeOf(s.by);
    const p = lot ? slotFor(town, lot, s.type, taken) : null;
    if (p) { s.x = p.x; s.y = p.y; taken.push(p); } else overflow.push(s);
  }
  // the rest: the nearest free slot on any home lot no building stands on (spare lots first), nearest its builder
  const borrowed = new Set(Object.values(state.civic));
  const lived = new Set(Object.values(state.lots));
  const kept: StructureSave[] = [];
  for (const s of overflow) {
    const from = homeOf(s.by)?.front ?? { x: (town.square.x + town.square.w / 2) * T, y: (town.square.y + town.square.h / 2) * T };
    const d = (l: Lot) => Math.hypot(l.front.x - from.x, l.front.y - from.y) + (lived.has(l.index) ? 400 : 0);
    let p: Pt | null = null;
    for (const l of town.lots.filter((x) => x.kind === 'home' && !borrowed.has(x.index)).sort((a, c) => d(a) - d(c))) {
      if (lotFull(l, taken)) continue;
      p = s.type === 'lamp' ? (l.lamps.find((q) => !takenAt(q, taken)) ?? null) : slotFor(town, l, s.type, taken);
      if (p) break;
    }
    if (!p && s.type === 'lamp') p = town.posts.filter((q) => !takenAt(q, taken)).sort((a, c) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(c.x - from.x, c.y - from.y))[0] ?? null;
    if (p) { s.x = p.x; s.y = p.y; taken.push(p); } else { kept.push(s); stray.push(`${s.type} by ${s.by ?? 'nobody'}`); }
  }
  if (data.warren) data.warren.hatch = { ...town.hatch };
  const nodes: Record<string, { hits: number; at: number }> = {};
  for (const k of Object.keys(data.nodes ?? {})) nodes[k] = { hits: 0, at: 0 };
  data.nodes = nodes;
  data.felled = [];
  data.town = state;
  data.layout = TOWN.layout;
  return { state, moved: structures.length - kept.length, stray, kept };
}
