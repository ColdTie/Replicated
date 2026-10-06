// Painted floor: one continuous, full-color ground image per planet instead of repeating 16px floor tiles.
// Relief-shaded noise fields blend bare soil and cover (grass, snow, sand, moss, ash), then the surface kind adds
// its own detail (blades, ripples, pores, glowing cracks, craters), pebbles, ruin slabs, shadows under rock and damp
// pond banks. Styles live in src/data/floor.json. Deterministic per planet seed.
import FLOOR from '../data/floor.json';
import { fbm, mulberry32, valueNoise, type Rng } from '../core/rng';
import { Cell, TILE, type PlanetMap } from './planetGen';

type Kind = 'grass' | 'snow' | 'sand' | 'spore' | 'basalt' | 'regolith';
interface FloorStyle {
  kind: Kind;
  relief: number;
  coverage: number;
  pebbles: number;
  soil: string[];
  cover: string[];
  detail: string[];
  flowers?: string[];
  leaves?: string[];
  stone: string[];
}
type RGB = [number, number, number];

const STYLES = FLOOR.styles as Record<string, FloorStyle>;
export const floorStyle = (id: string): FloorStyle => STYLES[id] ?? STYLES[FLOOR.default];

const rgb = (h: string): RGB => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Color ramp: t in 0..1 walks the stops with linear blending. */
function ramp(stops: RGB[], t: number, out: RGB) {
  const f = clamp01(t) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(f)), k = f - i;
  const a = stops[i], b = stops[i + 1];
  out[0] = a[0] + (b[0] - a[0]) * k;
  out[1] = a[1] + (b[1] - a[1]) * k;
  out[2] = a[2] + (b[2] - a[2]) * k;
}

function hash(x: number, y: number, s: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Low-frequency fbm sampled on a coarse grid and bilinearly interpolated (fast enough for the whole planet). */
function coarseField(W: number, H: number, step: number, scale: number, seed: number, octaves = 4) {
  const gw = Math.ceil(W / step) + 2, gh = Math.ceil(H / step) + 2;
  const g = new Float32Array(gw * gh);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) g[y * gw + x] = fbm(x * step / scale, y * step / scale, seed, octaves);
  return (x: number, y: number) => {
    const fx = x / step, fy = y / step, ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy;
    const i = iy * gw + ix;
    const a = g[i] + (g[i + 1] - g[i]) * tx;
    const b = g[i + gw] + (g[i + gw + 1] - g[i + gw]) * tx;
    return a + (b - a) * ty;
  };
}

export interface PaintedGround { width: number; height: number; data: Uint8ClampedArray<ArrayBuffer> }

export function paintGround(map: PlanetMap, styleId: string, seed: number): PaintedGround {
  const st = floorStyle(styleId);
  const T = 16, W = map.w * T, H = map.h * T;
  const data = new Uint8ClampedArray(W * H * 4);
  const soil = st.soil.map(rgb), cover = st.cover.map(rgb), detail = st.detail.map(rgb), stone = st.stone.map(rgb);
  const r: Rng = mulberry32(seed ^ 0x5eed);

  const cellAt = (tx: number, ty: number) => (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h ? Cell.Void : map.cells[ty * map.w + tx]);
  const isRuin = (tx: number, ty: number) => map.ground[ty]?.[tx] === TILE.ruinFloor;
  const solid = (c: number) => c === Cell.Rock || c === Cell.Ruin;
  const floorPx = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && cellAt(x >> 4, y >> 4) === Cell.Floor;

  const height = coarseField(W, H, 4, 90, seed + 11);
  const lush = coarseField(W, H, 4, 130, seed + 23);
  const tone = coarseField(W, H, 8, 260, seed + 37, 3);
  const heat = coarseField(W, H, 8, 170, seed + 41, 3);

  // Per-pixel height (coarse relief + fine grain) for slope shading. NaN marks pixels that are not open floor.
  // Everything below walks the planet cell by cell so neighbor checks happen once per 16x16 cell, not per pixel.
  const hb = new Float32Array(W * H).fill(NaN);
  const fine = new Float32Array(W * H);
  for (let ty = 0; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) {
    if (cellAt(tx, ty) !== Cell.Floor) continue;
    for (let y = ty * T; y < ty * T + T; y++) for (let x = tx * T; x < tx * T + T; x++) {
      const i = y * W + x;
      const f = valueNoise(x / 3.2, y / 3.2, seed + 5);
      fine[i] = f;
      const hc = height(x, y);
      let h = hc + (f - 0.5) * 0.012;
      if (st.kind === 'sand') h += Math.sin(x * 0.38 + y * 0.11 + hc * 22) * 0.03;
      else if (st.kind === 'snow') h += Math.pow(Math.max(0, Math.sin(x * 0.06 + y * 0.34 + hc * 16)), 8) * 0.03;
      hb[i] = h;
    }
  }

  const coverMask = new Uint8Array(W * H);
  const base = map.base.center;
  const thr = 0.5 + (0.5 - st.coverage) * 0.4;
  const cs: RGB = [0, 0, 0], cc: RGB = [0, 0, 0];
  const grassy = st.kind === 'grass' || st.kind === 'spore';

  // Basalt: jittered-grid voronoi plates; plate() leaves the crack distance (F2 - F1) and the plate's id here
  const PLATE = 22;
  let pEdge = 0, pId = 0;
  const plate = (x: number, y: number) => {
    const gx = Math.floor(x / PLATE), gy = Math.floor(y / PLATE);
    let f1 = 1e9, f2 = 1e9;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const cx = gx + ox, cy = gy + oy;
      const dx = (cx + 0.15 + hash(cx, cy, seed) * 0.7) * PLATE - x, dy = (cy + 0.15 + hash(cx, cy, seed + 1) * 0.7) * PLATE - y;
      const d = dx * dx + dy * dy;
      if (d < f1) { f2 = f1; f1 = d; pId = hash(cx, cy, seed + 2); } else if (d < f2) f2 = d;
    }
    pEdge = Math.sqrt(f2) - Math.sqrt(f1);
  };

  for (let ty = 0; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) {
    if (cellAt(tx, ty) !== Cell.Floor) continue;
    const ruin = isRuin(tx, ty);
    // Shadows from rock and ruin walls (above casts down, sides darken the edges), damp pond banks, the island lip
    const sU = solid(cellAt(tx, ty - 1)), sL = solid(cellAt(tx - 1, ty)), sR = solid(cellAt(tx + 1, ty));
    const sUL = solid(cellAt(tx - 1, ty - 1)), sUR = solid(cellAt(tx + 1, ty - 1));
    const wL = cellAt(tx - 1, ty) === Cell.Water, wR = cellAt(tx + 1, ty) === Cell.Water;
    const wU = cellAt(tx, ty - 1) === Cell.Water, wD = cellAt(tx, ty + 1) === Cell.Water;
    const lip = cellAt(tx, ty + 1) === Cell.Void;

    for (let ly = 0; ly < T; ly++) for (let lx = 0; lx < T; lx++) {
      const x = tx * T + lx, y = ty * T + ly;
      const i = y * W + x, o = i * 4;
      const f = fine[i], wn = hash(x, y, seed + 9);
      const h0 = hb[i];
      let hUL = hb[i - W - 1], hDR = hb[i + W + 1];
      if (hUL !== hUL) hUL = h0;
      if (hDR !== hDR) hDR = h0;
      const shade = Math.max(-0.35, Math.min(0.35, (hDR - hUL) * -st.relief * 6));

      if (ruin) {
        // Worn stone slabs in running bond, each its own tone, mortar lines, a lit top edge, cracks and creeping moss
        const row = y >> 3, off = (row & 1) * 6;
        const col = Math.floor((x + off) / 12);
        const sx = (x + off) - col * 12, sy = y & 7;
        const sid = hash(col, row, seed + 77);
        let t = 0.35 + sid * 0.35 + (f - 0.5) * 0.25 + (wn - 0.5) * 0.08 + shade * 0.5;
        if (sy === 1) t += 0.14;
        if (sx === 1) t += 0.06;
        if (sy === 7 || sx === 11) t -= 0.1;
        ramp(stone, t, cs);
        const mortar = sx === 0 || sy === 0;
        if (mortar) { cs[0] *= 0.45; cs[1] *= 0.45; cs[2] *= 0.5; }
        if (sid > 0.82 && Math.abs((sx - 6) - (sy - 4) * 1.4) < 0.7) { cs[0] *= 0.55; cs[1] *= 0.55; cs[2] *= 0.6; }
        const moss = lush(x, y) + (f - 0.5) * 0.3;
        if (grassy && moss > 0.55 && (mortar || moss > 0.68)) {
          ramp(cover, 0.3 + (moss - 0.55) * 2 + (wn - 0.5) * 0.3, cc);
          const k = mortar ? 0.9 : smoothstep(0.68, 0.78, moss) * 0.8;
          cs[0] += (cc[0] - cs[0]) * k; cs[1] += (cc[1] - cs[1]) * k; cs[2] += (cc[2] - cs[2]) * k;
        }
        data[o] = cs[0]; data[o + 1] = cs[1]; data[o + 2] = cs[2]; data[o + 3] = 255;
        continue;
      }

      // Cover mask: where grass, snow or drift lies; worn bare around the base
      const bx = x - base.x, by = y - base.y;
      const worn = smoothstep(84, 34, Math.sqrt(bx * bx + by * by) + (f - 0.5) * 40);
      let m = smoothstep(thr - 0.05, thr + 0.05, lush(x, y) + (f - 0.5) * 0.16 + (wn - 0.5) * 0.05);
      m *= 1 - worn * (st.kind === 'grass' ? 0.8 : 0.5);
      coverMask[i] = Math.round(m * 255);

      const tv = (tone(x, y) - 0.5) * 0.7;
      let ts = 0.45 + shade + tv + (f - 0.5) * 0.3 + (wn - 0.5) * 0.12;
      let tc = 0.5 + shade + tv + (f - 0.5) * 0.35 + (wn - 0.5) * 0.14 - (1 - m) * 0.25;
      let hot = 0;

      if (st.kind === 'sand') {
        const rip = Math.cos(x * 0.38 + y * 0.11 + height(x, y) * 22) * 0.1;
        ts += rip; tc += rip;
      } else if (st.kind === 'snow') {
        tc += Math.pow(Math.max(0, Math.sin(x * 0.06 + y * 0.34 + height(x, y) * 16)), 8) * 0.25;
        // glassy ice: diagonal glints across the bare patches
        if (valueNoise((x - y) * 0.05, (x + y) * 0.5, seed + 3) > 0.78) ts += 0.3;
      } else if (st.kind === 'basalt') {
        plate(x, y);
        if (pEdge < 1.4) {
          // crack: dark, and in hot regions a glowing seam (bright core, orange halo)
          const seam = smoothstep(0.5, 0.62, heat(x, y));
          ramp(soil, 0.02, cs);
          if (seam > 0) {
            ramp(detail, 0.25 + seam * 0.75 - pEdge * 0.25, cc);
            cs[0] += (cc[0] - cs[0]) * seam; cs[1] += (cc[1] - cs[1]) * seam; cs[2] += (cc[2] - cs[2]) * seam;
          }
          data[o] = cs[0]; data[o + 1] = cs[1]; data[o + 2] = cs[2]; data[o + 3] = 255;
          continue;
        }
        ts += (pId - 0.5) * 0.3 + smoothstep(1.5, 4, pEdge) * 0.06 - 0.03;
        tc += (pId - 0.5) * 0.2;
        // heat bleeding into the plates next to hot seams
        hot = smoothstep(0.52, 0.66, heat(x, y)) * smoothstep(5, 1.4, pEdge);
      }

      ramp(soil, ts, cs);
      ramp(cover, tc, cc);
      const R = cs[0] + (cc[0] - cs[0]) * m + 70 * hot, G = cs[1] + (cc[1] - cs[1]) * m + 18 * hot, B = cs[2] + (cc[2] - cs[2]) * m;

      let ao = 0;
      if (sU && ly < 13) ao = 0.62 * Math.pow(1 - ly / 13, 1.5);
      if (sL && lx < 6) ao = Math.max(ao, 0.42 * (1 - lx / 6));
      if (sR && lx > 10) ao = Math.max(ao, 0.3 * (1 - (15 - lx) / 5));
      if (sUL) ao = Math.max(ao, 0.4 * Math.max(0, 1 - Math.sqrt(lx * lx + ly * ly) / 9));
      if (sUR) ao = Math.max(ao, 0.32 * Math.max(0, 1 - Math.sqrt((15 - lx) * (15 - lx) + ly * ly) / 8));
      let dw = 99;
      if (wL) dw = lx;
      if (wR) dw = Math.min(dw, 15 - lx);
      if (wU) dw = Math.min(dw, ly);
      if (wD) dw = Math.min(dw, 15 - ly);
      if (dw < 6) ao = Math.max(ao, 0.38 * (1 - dw / 6));
      const lift = lip && ly >= 14 ? (ly === 15 ? 0.28 : 0.12) : 0;
      const k = (1 - ao) * (1 + lift);
      data[o] = R * k; data[o + 1] = G * k; data[o + 2] = B * k; data[o + 3] = 255;
    }
  }

  // Helpers for the stamped detail passes
  const blend = (x: number, y: number, c: RGB, a: number, overVoid = false) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    if (data[i + 3] === 0) {
      if (!overVoid) return;
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = Math.round(a * 255);
      return;
    }
    data[i] += (c[0] - data[i]) * a; data[i + 1] += (c[1] - data[i + 1]) * a; data[i + 2] += (c[2] - data[i + 2]) * a;
  };
  const scale = (x: number, y: number, k: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    if (data[i + 3] === 0) return;
    data[i] *= k; data[i + 1] *= k; data[i + 2] *= k;
  };
  const open = (x: number, y: number) => floorPx(x, y) && !isRuin(x >> 4, y >> 4);
  const covered = (x: number, y: number) => coverMask[y * W + x] / 255;
  const area = W * H;
  const tmp: RGB = [0, 0, 0];

  // Surface detail per kind
  if (st.kind === 'grass') {
    // Grass blades: dark root to light tip, leaning with the wind field, each casting a 1px shadow
    const n = Math.round(area * 0.05);
    for (let b = 0; b < n; b++) {
      const x = Math.floor(r() * W), y = Math.floor(r() * H);
      if (!open(x, y)) continue;
      const m = covered(x, y);
      if (r() > m * 0.9 + 0.05) continue;
      const len = 2 + Math.floor(r() * (2 + m * 3));
      const lean = Math.round((valueNoise(x / 40, y / 40, seed + 61) - 0.5) * 3 + (r() - 0.5));
      const top = 0.45 + r() * 0.55;
      scale(x + 1, y, 0.78);
      for (let s = 0; s < len; s++) {
        const px = x + Math.round(lean * (s / len) * (s / len)), py = y - s;
        ramp(detail, (s / (len - 1 || 1)) * top + (r() - 0.5) * 0.12, tmp);
        blend(px, py, tmp, 0.9, true);
      }
    }
    // Clover clusters
    for (let c = 0; c < area * 0.0012; c++) {
      const x = Math.floor(r() * W), y = Math.floor(r() * H);
      if (!open(x, y) || covered(x, y) < 0.5) continue;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]]) {
        ramp(detail, 0.65 + r() * 0.35, tmp);
        blend(x + dx, y + dy, tmp, dx || dy ? 0.75 : 0.5);
      }
      scale(x + 1, y + 2, 0.75);
    }
    // Tiny flowers: one bright petal pixel over a dark stem
    if (st.flowers) {
      const fl = st.flowers.map(rgb);
      for (let c = 0; c < area * 0.0005; c++) {
        const x = Math.floor(r() * W), y = Math.floor(r() * H);
        if (!open(x, y) || covered(x, y) < 0.6) continue;
        const col = fl[Math.floor(r() * fl.length)];
        blend(x, y + 1, detail[0], 0.9);
        blend(x, y, col, 1);
        if (r() < 0.5) { blend(x - 1, y, col, 0.55); blend(x + 1, y, col, 0.55); }
      }
    }
    // Fallen leaves under trees
    if (st.leaves) {
      const lv = st.leaves.map(rgb);
      for (const p of map.props) {
        if (p.sprite !== 'tree') continue;
        for (let c = 0; c < 26; c++) {
          const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 26;
          const x = Math.round(p.x + Math.cos(a) * d), y = Math.round(p.y - 4 + Math.sin(a) * d * 0.6);
          if (!open(x, y)) continue;
          const col = lv[Math.floor(r() * lv.length)];
          blend(x, y, col, 0.85);
          if (r() < 0.6) blend(x + 1, y, col, 0.6);
        }
      }
    }
    // Grass fringe hanging over the island's top edge
    for (let y = 0; y < H; y += T) for (let x = 0; x < W; x++) {
      if (!open(x, y) || cellAt(x >> 4, (y >> 4) - 1) !== Cell.Void || r() > 0.55) continue;
      const len = 1 + Math.floor(r() * 3);
      for (let s = 1; s <= len; s++) {
        ramp(detail, 0.3 + (s / len) * 0.5, tmp);
        blend(x, y - s, tmp, 0.9, true);
      }
    }
  } else if (st.kind === 'snow') {
    const white = detail[0], ice = detail[detail.length - 1];
    for (let c = 0; c < area * 0.002; c++) {
      const x = Math.floor(r() * W), y = Math.floor(r() * H);
      if (!open(x, y)) continue;
      blend(x, y, covered(x, y) > 0.5 ? white : ice, 0.55 + r() * 0.45);
    }
  } else if (st.kind === 'sand') {
    // Dark grit in the ripple troughs, pale crests
    for (let c = 0; c < area * 0.004; c++) {
      const x = Math.floor(r() * W), y = Math.floor(r() * H);
      if (!open(x, y)) continue;
      blend(x, y, detail[r() < 0.6 ? 0 : 1], 0.35 + r() * 0.3);
    }
  } else if (st.kind === 'spore') {
    // Spongy pores in clusters: dark hole, lit lower rim; a few glowing specks
    for (let c = 0; c < area * 0.0006; c++) {
      const cx = r() * W, cy = r() * H;
      const count = 3 + Math.floor(r() * 7);
      for (let p = 0; p < count; p++) {
        const px = cx + (r() - 0.5) * 18, py = cy + (r() - 0.5) * 12, rad = 0.8 + r() * 1.8;
        for (let y = Math.floor(py - rad - 1); y <= py + rad + 1; y++) for (let x = Math.floor(px - rad - 1); x <= px + rad + 1; x++) {
          if (!open(x, y)) continue;
          const d = Math.hypot(x - px, (y - py) * 1.2) / rad;
          if (d < 0.75) blend(x, y, detail[0], 0.9);
          else if (d < 1.25 && y > py) blend(x, y, detail[1], 0.6);
        }
      }
    }
    for (let c = 0; c < area * 0.0007; c++) {
      const x = Math.floor(r() * W), y = Math.floor(r() * H);
      if (!open(x, y)) continue;
      blend(x, y, detail[2 + Math.floor(r() * (detail.length - 2))], 0.9);
    }
  } else if (st.kind === 'regolith') {
    // Craters: shaded bowl (dark near wall toward the light, lit far wall) with a raised rim
    const n = Math.round(area * 0.00016);
    for (let c = 0; c < n; c++) {
      const cx = r() * W, cy = r() * H, rad = 3 + Math.pow(r(), 2.2) * 16;
      for (let y = Math.floor(cy - rad * 1.4); y <= cy + rad * 1.4; y++) for (let x = Math.floor(cx - rad * 1.4); x <= cx + rad * 1.4; x++) {
        if (!open(x, y)) continue;
        const dx = (x - cx) / rad, dy = (y - cy) / (rad * 0.8), d = Math.hypot(dx, dy);
        if (d < 1) scale(x, y, 0.74 + (dx + dy) * 0.22 * d);
        else if (d < 1.35) scale(x, y, 1 + -(dx + dy) / d * 0.22 * (1 - (d - 1) / 0.35));
      }
    }
    for (let c = 0; c < area * 0.0012; c++) {
      const x = Math.floor(r() * W), y = Math.floor(r() * H);
      if (!open(x, y)) continue;
      blend(x, y, detail[Math.floor(r() * detail.length)], 0.5 + r() * 0.4);
    }
  }

  // Pebbles everywhere: lit top-left, dark bottom-right, a cast shadow on the ground below
  for (let c = 0; c < area * st.pebbles / 10000; c++) {
    const px = Math.floor(r() * W), py = Math.floor(r() * H);
    if (!open(px, py)) continue;
    const pw = 1 + Math.floor(r() * 3), ph = 1 + Math.floor(r() * 2), tint = r() * 0.35;
    for (let x = -1; x <= pw; x++) scale(px + x, py + ph, 0.62);
    for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
      ramp(stone, 0.35 + tint + (y === 0 ? 0.35 : 0) + (x === 0 ? 0.1 : 0) - (y === ph - 1 && ph > 1 ? 0.15 : 0), tmp);
      blend(px + x, py + y, tmp, 1);
    }
  }

  return { width: W, height: H, data };
}
