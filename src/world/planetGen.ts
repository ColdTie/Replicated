// Seeded planet surface: a floating island of floor and rock, a few ruins, resource nodes and enemy spawns.
import type { PlanetDef } from '../core/data';
import { fbm, mulberry32, randInt, type Rng } from '../core/rng';
import { BEACON } from '../core/data';

export const enum Cell { Void = 0, Floor = 1, Rock = 2, Ruin = 3, Water = 4 }

// Frame indexes in tools/sprites/tiles.json
export const TILE = {
  empty: 0, floor: [1, 2], pebble: 3, moss: [4, 17], shadow: 5, crack: 6,
  rockTop: [7, 16, 18], rockRim: 8, rockFace: 9, rockVein: 10,
  cliff: 11, cliffFade: 12, ruinTop: 13, ruinFace: 14, ruinFloor: 15,
  water: [19, 20], waterTop: 21,
} as const;
export const COLLIDE_TILES = [0, 7, 8, 9, 10, 11, 12, 13, 14, 16, 18];

// Frame indexes in tools/sprites/decor.json
export const DECOR = {
  tuft: 0, tuftSmall: 1, mushroom: 2, pebbles: 3, pillar: 4, machine: 5, door: 6, pod: 7,
  lily: 8, reeds: 9, flower: 10, doorOpen: 11, machineEmpty: 12,
} as const;

export interface Point { x: number; y: number }
export interface PlanetMap {
  w: number;
  h: number;
  cells: Uint8Array;
  ground: number[][];
  walls: number[][];
  spawn: Point;               // tile coords of the landing site
  nodes: Point[];             // tile coords
  enemies: { type: string; x: number; y: number }[];
  decor: { frame: number; x: number; y: number }[]; // pixel coords (feet)
  glows: { x: number; y: number; kind: 'door' | 'mushroom' | 'machine' }[];
  /** Big y-sorted props (trees, towers) in pixel coords (feet) */
  props: { sprite: 'tree' | 'tower'; frame: number; x: number; y: number }[];
  /** Solid rectangles for props, pixel coords, centered */
  blockers: { x: number; y: number; w: number; h: number }[];
  /** Ruins: sealed door (feet), broken machine holding a core (feet), spot inside where the reward appears */
  ruins: { door: Point; machine: Point; inside: Point }[];
  /** Fixed base layout around the landing site, pixel coords */
  base: { vessel: Point; cradle: Point; pad: Point; center: Point };
  /** Beacon worlds: the monolith (feet, pixels), where its keeper sleeps, and the stone plaza (tiles) */
  beacon?: { x: number; y: number; guardian: Point; plaza: { x: number; y: number; w: number; h: number } };
}

export function generatePlanet(def: PlanetDef, seed = def.seed): PlanetMap {
  const [w, h] = def.size;
  const r = mulberry32(seed);
  const cells = new Uint8Array(w * h);
  const ruinFloor = new Uint8Array(w * h);
  const idx = (x: number, y: number) => y * w + x;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? Cell.Void : cells[idx(x, y)]);
  const cx = Math.floor(w / 2), cy = Math.floor(h / 2);

  // 1. Island silhouette
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const nx = (x - cx) / (w / 2), ny = (y - cy) / (h / 2);
    const d = Math.hypot(nx, ny) + (fbm(x * 0.07, y * 0.07, seed) - 0.5) * 0.55;
    const border = x < 3 || y < 3 || x >= w - 3 || y >= h - 4;
    cells[idx(x, y)] = !border && d < def.islandRadius ? Cell.Floor : Cell.Void;
  }

  // 2. Rock outcrops, smoothed with a couple of cellular automaton passes
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (at(x, y) === Cell.Floor && fbm(x * 0.11, y * 0.11, seed + 77) > def.rockThreshold) cells[idx(x, y)] = Cell.Rock;
  }
  for (let pass = 0; pass < 2; pass++) {
    const next = cells.slice();
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      if (at(x, y) === Cell.Void) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && at(x + dx, y + dy) === Cell.Rock) n++;
      if (n >= 5) next[idx(x, y)] = Cell.Rock;
      else if (n <= 2) next[idx(x, y)] = Cell.Floor;
    }
    cells.set(next);
  }

  // 3. Clear the landing site
  for (let y = cy - 6; y <= cy + 6; y++) for (let x = cx - 7; x <= cx + 7; x++) {
    if (Math.hypot((x - cx) / 7, (y - cy) / 6) <= 1) cells[idx(x, y)] = Cell.Floor;
  }

  // 4. Ruins: broken rectangular rooms with a doorway at the bottom and a glowing door on the back wall
  const ruinRects: { x: number; y: number; w: number; h: number }[] = [];
  const decor: PlanetMap['decor'] = [];
  const glows: PlanetMap['glows'] = [];
  const ruins: PlanetMap['ruins'] = [];
  for (let attempt = 0; attempt < 200 && ruinRects.length < def.ruins; attempt++) {
    const rw = randInt(r, 7, 10), rh = randInt(r, 5, 7);
    const rx = randInt(r, 4, w - rw - 5), ry = randInt(r, 4, h - rh - 6);
    if (Math.hypot(rx + rw / 2 - cx, ry + rh / 2 - cy) < 16) continue;
    let ok = true;
    for (let y = ry - 2; y < ry + rh + 3 && ok; y++) for (let x = rx - 2; x < rx + rw + 2; x++) if (at(x, y) === Cell.Void) { ok = false; break; }
    if (!ok || ruinRects.some((o) => rx < o.x + o.w + 4 && rx + rw + 4 > o.x && ry < o.y + o.h + 4 && ry + rh + 4 > o.y)) continue;
    ruinRects.push({ x: rx, y: ry, w: rw, h: rh });
    const doorX = rx + Math.floor(rw / 2);
    for (let y = ry - 1; y <= ry + rh + 1; y++) for (let x = rx - 1; x <= rx + rw; x++) cells[idx(x, y)] = Cell.Floor;
    for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) {
      const edge = x === rx || x === rx + rw - 1 || y === ry || y === ry + rh - 1;
      const topWall = y === ry || y === ry + 1;
      if (y === ry + 1) { // back wall is two tiles tall so it reads as a wall face
        if (x !== rx && x !== rx + rw - 1) { cells[idx(x, y)] = Cell.Ruin; continue; }
      }
      if (edge || topWall) {
        const gap = (y === ry + rh - 1 && Math.abs(x - doorX) <= 1) || (!topWall && r() < 0.28);
        cells[idx(x, y)] = gap ? Cell.Floor : Cell.Ruin;
        if (gap) ruinFloor[idx(x, y)] = 1;
      } else {
        ruinFloor[idx(x, y)] = 1;
      }
    }
    // glowing sealed door on the back wall and a broken machine that still holds the door's core.
    // (The r() calls stay in the same order so existing planets keep their layout.)
    const door = { x: doorX * 16 + 8, y: (ry + 2) * 16 + 1 };
    r();
    const mx = rx + 1 + Math.floor(r() * 2), my = ry + rh - 2;
    ruins.push({ door, machine: { x: mx * 16 + 8, y: my * 16 + 15 }, inside: { x: door.x, y: door.y + 18 } });
    decor.push({ frame: DECOR.pillar, x: (rx + rw - 2) * 16 + 8, y: (ry + rh - 2) * 16 + 15 });
  }

  // 5. Keep only floor reachable from the landing site. Rocky worlds (ember, moon) could wall the
  // landing site into a tiny pocket and the conversion below then turned the whole rest of the island
  // to rock (Fomalhaut was 138 walkable tiles). If the reachable area is too small, carve winding
  // canyons out from the center through the rock and check again.
  const flood = () => {
    const seen = new Uint8Array(w * h);
    const stack = [idx(cx, cy)];
    seen[idx(cx, cy)] = 1;
    let reached = 0;
    while (stack.length) {
      const i = stack.pop()!;
      reached++;
      const x = i % w, y = (i / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (at(nx, ny) !== Cell.Floor || seen[idx(nx, ny)]) continue;
        seen[idx(nx, ny)] = 1;
        stack.push(idx(nx, ny));
      }
    }
    return { seen, reached };
  };
  let flooded = flood();
  const rc = mulberry32(seed ^ 0xca0e);
  for (let round = 0; round < 4 && flooded.reached < w * h * 0.3; round++) {
    for (let sp = 0; sp < 5; sp++) {
      let px = cx + 0.5, py = cy + 0.5;
      let a = ((sp + round * 0.5) / 5) * Math.PI * 2 + rc() * 0.9;
      for (let step = 0; step < Math.max(w, h); step++) {
        px += Math.cos(a); py += Math.sin(a);
        a += (fbm(px * 0.13, py * 0.13, seed + 55 + round * 31) - 0.5) * 1.1;
        const xi = Math.round(px), yi = Math.round(py);
        if (xi < 3 || yi < 3 || xi >= w - 3 || yi >= h - 4 || at(xi, yi) === Cell.Void) break;
        for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (at(xi + dx, yi + dy) === Cell.Rock) cells[idx(xi + dx, yi + dy)] = Cell.Floor;
        }
      }
    }
    flooded = flood();
  }
  const seen = flooded.seen;
  for (let i = 0; i < cells.length; i++) if (cells[i] === Cell.Floor && !seen[i]) cells[i] = Cell.Rock;

  // 6. Tile frames
  const solid = (c: Cell) => c === Cell.Rock || c === Cell.Ruin;
  const ground: number[][] = [];
  const walls: number[][] = [];
  for (let y = 0; y < h; y++) {
    const g: number[] = [], wl: number[] = [];
    for (let x = 0; x < w; x++) {
      const c = at(x, y), above = at(x, y - 1), above2 = at(x, y - 2), below = at(x, y + 1);
      if (c === Cell.Void) {
        g.push(-1);
        wl.push(above !== Cell.Void ? TILE.cliff : above2 !== Cell.Void ? TILE.cliffFade : TILE.empty);
        continue;
      }
      // ground under everything that is not void
      let gt: number = TILE.floor[r() < 0.5 ? 0 : 1];
      const moss = fbm(x * 0.15, y * 0.15, seed + 404);
      if (ruinFloor[idx(x, y)]) gt = TILE.ruinFloor;
      else if (moss > 0.6 && r() < (moss - 0.6) * 4) gt = TILE.moss[r() < 0.5 ? 0 : 1];
      else if (r() < 0.05) gt = TILE.pebble;
      else if (r() < 0.04) gt = TILE.crack;
      if (c === Cell.Floor && solid(above)) gt = TILE.shadow;
      g.push(gt);
      if (c === Cell.Rock) {
        if (below !== Cell.Rock) wl.push(r() < 0.18 ? TILE.rockVein : TILE.rockFace);
        else wl.push(above !== Cell.Rock ? TILE.rockRim : TILE.rockTop[Math.floor(r() * 3)]);
      } else if (c === Cell.Ruin) {
        wl.push(solid(below) ? TILE.ruinTop : TILE.ruinFace);
      } else wl.push(-1);
    }
    ground.push(g);
    walls.push(wl);
  }

  // 7. Placement helpers
  const isOpen = (x: number, y: number) => at(x, y) === Cell.Floor && !solid(at(x, y - 1));
  const taken: Point[] = [];
  const farFrom = (x: number, y: number, list: Point[], d: number) => list.every((p) => Math.hypot(p.x - x, p.y - y) >= d);
  const scatter = (count: number, minCenter: number, spacing: number, score: (x: number, y: number) => boolean, rr: Rng) => {
    const out: Point[] = [];
    for (let attempt = 0; attempt < count * 80 && out.length < count; attempt++) {
      const x = randInt(rr, 2, w - 3), y = randInt(rr, 2, h - 3);
      if (!isOpen(x, y) || Math.hypot(x - cx, y - cy) < minCenter) continue;
      if (ruinFloor[idx(x, y)] || !score(x, y) || !farFrom(x, y, out, spacing) || !farFrom(x, y, taken, 2)) continue;
      out.push({ x, y });
    }
    taken.push(...out);
    return out;
  };

  const nearRock = (x: number, y: number) => {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (solid(at(x + dx, y + dy))) return true;
    return false;
  };
  const nodes = scatter(Math.ceil(def.resourceNodes * 0.7), 6, 6, nearRock, r);
  nodes.push(...scatter(def.resourceNodes - nodes.length, 6, 6, () => true, r));

  const enemies: PlanetMap['enemies'] = [];
  for (const [type, count] of Object.entries(def.enemies)) {
    for (const p of scatter(count, 13, 7, () => true, r)) enemies.push({ type, ...p });
  }

  // 7b. Landmarks: overgrown towers and trees
  const props: PlanetMap['props'] = [];
  const blockers: PlanetMap['blockers'] = [];
  const towerSpot = (x: number, y: number) => isOpen(x + 1, y) && isOpen(x, y - 1) && isOpen(x + 1, y - 1) && isOpen(x, y - 2) && isOpen(x + 1, y - 2);
  for (const p of scatter(def.towers ?? 0, 9, 14, towerSpot, r)) {
    props.push({ sprite: 'tower', frame: r() < 0.5 ? 0 : 1, x: p.x * 16 + 16, y: p.y * 16 + 16 });
    blockers.push({ x: p.x * 16 + 16, y: p.y * 16 + 11, w: 28, h: 10 });
    taken.push({ x: p.x + 1, y: p.y }, { x: p.x, y: p.y - 1 }, { x: p.x + 1, y: p.y - 1 });
  }
  if (def.trees) {
    const treeCount = Math.round(w * h * def.trees * 0.25);
    for (const p of scatter(treeCount, 6, 3, (x, y) => isOpen(x, y - 1), r)) {
      props.push({ sprite: 'tree', frame: r() < 0.7 ? 0 : 2, x: p.x * 16 + 8, y: p.y * 16 + 14 });
      blockers.push({ x: p.x * 16 + 8, y: p.y * 16 + 12, w: 8, h: 5 });
    }
  }

  // 8. Decor: tufts and pebbles everywhere, mushrooms and spore pods on moss
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    if (!isOpen(x, y) || Math.hypot(x - cx, y - cy) < 3.5 || ruinFloor[idx(x, y)]) continue;
    if (taken.some((p) => p.x === x && p.y === y)) continue;
    if (r() > def.decorDensity) continue;
    const onMoss = ground[y][x] === TILE.moss[0] || ground[y][x] === TILE.moss[1];
    const roll = r();
    let frame: number = roll < 0.45 ? DECOR.tuft : roll < 0.75 ? DECOR.tuftSmall : DECOR.pebbles;
    if (onMoss && r() < 0.45) frame = r() < 0.6 ? DECOR.mushroom : DECOR.pod;
    const px = x * 16 + randInt(r, 3, 13), py = y * 16 + randInt(r, 8, 15);
    decor.push({ frame, x: px, y: py });
    if (frame === DECOR.mushroom) glows.push({ x: px, y: py - 7, kind: 'mushroom' });
  }

  // 9. Ponds, reeds, lily pads and flowers, carved last so everything placed above keeps its spot
  if (def.ponds || def.flowers) {
    const r2 = mulberry32(seed ^ 0x9e3779b9);
    const blocked = new Uint8Array(w * h);
    for (const p of [...taken, ...nodes]) blocked[idx(p.x, p.y)] = 1;
    for (const b of blockers) blocked[idx(Math.floor(b.x / 16), Math.floor(b.y / 16))] = 1;
    for (const e of enemies) blocked[idx(e.x, e.y)] = 1;
    for (const rr of ruinRects) for (let y = rr.y - 2; y < rr.y + rr.h + 2; y++) for (let x = rr.x - 2; x < rr.x + rr.w + 2; x++) if (x >= 0 && y >= 0 && x < w && y < h) blocked[idx(x, y)] = 1;
    let made = 0;
    for (let attempt = 0; attempt < 300 && made < (def.ponds ?? 0); attempt++) {
      const px = randInt(r2, 6, w - 7), py = randInt(r2, 6, h - 7);
      if (Math.hypot(px - cx, py - cy) < 13 || at(px, py) !== Cell.Floor || blocked[idx(px, py)]) continue;
      const rad = 2.2 + r2() * 2.3;
      let carved = 0;
      for (let y = Math.floor(py - rad - 1); y <= py + rad + 1; y++) for (let x = Math.floor(px - rad * 1.4 - 1); x <= px + rad * 1.4 + 1; x++) {
        if (at(x, y) !== Cell.Floor || blocked[idx(x, y)] || ruinFloor[idx(x, y)]) continue;
        const d = Math.hypot((x - px) / 1.4, y - py) / rad + (fbm(x * 0.4, y * 0.4, seed + 991) - 0.5) * 0.6;
        if (d < 1) { cells[idx(x, y)] = Cell.Water; carved++; }
      }
      if (carved) made++;
    }
    const isWater = (x: number, y: number) => at(x, y) === Cell.Water;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!isWater(x, y)) continue;
      ground[y][x] = isWater(x, y - 1) ? TILE.water[(x + y) & 1] : TILE.waterTop;
      if (isWater(x, y - 1) && isWater(x, y + 1) && r2() < 0.12) decor.push({ frame: DECOR.lily, x: x * 16 + randInt(r2, 4, 12), y: y * 16 + randInt(r2, 10, 15) });
    }
    // drop decor that ended up in the water, then reeds along the banks
    for (let i = decor.length - 1; i >= 0; i--) {
      const d = decor[i];
      if (d.frame !== DECOR.lily && isWater(Math.floor(d.x / 16), Math.floor((d.y - 1) / 16))) decor.splice(i, 1);
    }
    for (let i = glows.length - 1; i >= 0; i--) if (isWater(Math.floor(glows[i].x / 16), Math.floor((glows[i].y + 7) / 16))) glows.splice(i, 1);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      if (!isOpen(x, y) || blocked[idx(x, y)]) continue;
      const bank = isWater(x - 1, y) || isWater(x + 1, y) || isWater(x, y - 1) || isWater(x, y + 1);
      if (bank && r2() < 0.35) decor.push({ frame: DECOR.reeds, x: x * 16 + randInt(r2, 4, 12), y: y * 16 + randInt(r2, 10, 15) });
      else if (!bank && def.flowers && r2() < def.flowers && Math.hypot(x - cx, y - cy) > 3.5 && !ruinFloor[idx(x, y)]) {
        decor.push({ frame: DECOR.flower, x: x * 16 + randInt(r2, 3, 13), y: y * 16 + randInt(r2, 8, 15) });
      }
    }
  }

  // 10. Starter crystals: a small cluster just outside the base so no landing ever feels barren.
  // Placed last with its own rng and appended to the end of `nodes`, so existing planets keep their
  // layout and saved node damage (indexed by position in `nodes`) stays valid.
  {
    const r3 = mulberry32(seed ^ 0x51a7);
    const starters: Point[] = [];
    for (let attempt = 0; attempt < 400 && starters.length < 3; attempt++) {
      const a = r3() * Math.PI * 2, d = 8 + r3() * 5;
      const x = Math.round(cx + Math.cos(a) * d), y = Math.round(cy + Math.sin(a) * d);
      if (x < 2 || y < 2 || x >= w - 2 || y >= h - 2 || !isOpen(x, y) || ruinFloor[idx(x, y)]) continue;
      if (!farFrom(x, y, starters, 3) || !farFrom(x, y, taken, 2) || !farFrom(x, y, nodes, 4)) continue;
      starters.push({ x, y });
    }
    taken.push(...starters);
    nodes.push(...starters);
  }

  // 11. Beacon worlds: a stone plaza far from the landing site with the dormant monolith at its head and the
  // keeper asleep in front of it. Placed last (own rng) and it never moves a crystal node, so saved node damage
  // keeps its indexes; rock inside the plaza is carved away, decor and creatures there are cleared.
  let beacon: PlanetMap['beacon'];
  if (def.beacon) {
    const r4 = mulberry32(seed ^ 0xbeac);
    const [bw0, bh0] = BEACON.beacon.plaza;
    let best = null as Point | null, bestScore = -1, bw = bw0, bh = bh0, hw = 0, hh = 0;
    // crystals may stand on the plaza (beacon worlds are rich), only the monolith and the keeper's lane stay clear
    const fits = (px: number, py: number) => {
      if (at(px, py) !== Cell.Floor || !seen[idx(px, py)]) return false;
      for (let y = py - hh; y <= py + hh; y++) for (let x = px - hw; x <= px + hw; x++) {
        const c = at(x, y);
        if (c === Cell.Void || c === Cell.Water || c === Cell.Ruin || ruinFloor[idx(x, y)]) return false;
        if (Math.abs(x - px) <= 1 && y <= py - hh + 5 && nodes.some((n) => n.x === x && n.y === y)) return false;
      }
      return true;
    };
    for (const shrink of [0, 2]) {
      bw = bw0 - shrink; bh = bh0 - shrink; hw = Math.floor(bw / 2); hh = Math.floor(bh / 2);
      for (let y = hh + 3; y < h - hh - 4; y++) for (let x = hw + 3; x < w - hw - 4; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d < BEACON.beacon.minFromBase) continue;
        const score = d + r4() * 6;
        if (score > bestScore && fits(x, y)) { best = { x, y }; bestScore = score; }
      }
      if (best) break;
    }
    if (best !== null) {
      const rect = { x: best.x - hw, y: best.y - hh, w: bw, h: bh };
      const inside = (px: number, py: number) => px >= rect.x * 16 && px < (rect.x + rect.w) * 16 && py >= rect.y * 16 && py < (rect.y + rect.h) * 16;
      for (let y = rect.y; y < rect.y + rect.h; y++) for (let x = rect.x; x < rect.x + rect.w; x++) {
        cells[idx(x, y)] = Cell.Floor;
        ruinFloor[idx(x, y)] = 1;
        ground[y][x] = TILE.ruinFloor;
        walls[y][x] = -1;
      }
      for (let i = decor.length - 1; i >= 0; i--) if (inside(decor[i].x, decor[i].y - 1)) decor.splice(i, 1);
      for (let i = glows.length - 1; i >= 0; i--) if (inside(glows[i].x, glows[i].y + 7)) glows.splice(i, 1);
      for (let i = props.length - 1; i >= 0; i--) if (inside(props[i].x, props[i].y - 1)) { props.splice(i, 1); blockers.splice(i, 1); }
      for (let i = enemies.length - 1; i >= 0; i--) if (inside(enemies[i].x * 16 + 8, enemies[i].y * 16 + 8)) enemies.splice(i, 1);
      const mx = best.x * 16 + 8, my = (rect.y + 2) * 16 + 12;
      blockers.push({ x: mx, y: my - 5, w: 22, h: 10 });
      taken.push({ x: best.x, y: rect.y + 1 }, { x: best.x, y: rect.y + 2 });
      for (const [ox, oy] of [[1, 1], [rect.w - 2, 1], [1, rect.h - 2], [rect.w - 2, rect.h - 2]]) {
        if (nodes.some((n) => n.x === rect.x + ox && n.y === rect.y + oy)) continue;
        decor.push({ frame: DECOR.pillar, x: (rect.x + ox) * 16 + 8, y: (rect.y + oy) * 16 + 15 });
      }
      beacon = { x: mx, y: my, guardian: { x: mx, y: my + 38 }, plaza: rect };
    }
  }

  const c = { x: cx * 16 + 8, y: cy * 16 + 8 };
  const base = {
    center: c,
    vessel: { x: c.x - 40, y: c.y - 6 },
    cradle: { x: c.x, y: c.y + 22 },
    pad: { x: c.x + 46, y: c.y + 12 },
  };
  return { w, h, cells, ground, walls, spawn: { x: cx, y: cy }, nodes, enemies, decor, glows, props, blockers, ruins, base, beacon };
}
