// Painted rock: one full-color image per planet for the rock outcrops, drawn over the wall tiles (which stay for
// collision). Rock tops are relief-shaded noise in the biome's rock ramp with contour cracks, a lit rim along the
// upper and left edges and a dark outline on the right; tops grow moss or carry snow in the hollows, and ember
// rock splits into plates with glowing seams. Where an outcrop ends, the cell below the top shows its front face:
// a lit lip, vertical streaks and strata, darkening toward the ground. Styles live in src/data/floor.json (rock).
import FLOOR from '../data/floor.json';
import { fbm, mulberry32, valueNoise } from '../core/rng';
import type { PaintedGround } from './groundPaint';
import { Cell, type PlanetMap } from './planetGen';

interface RockStyle { ramp: string[]; cover?: string[]; coverage?: number; seams?: string[]; cracks: number; relief: number }
type RGB = [number, number, number];

const STYLES = FLOOR.styles as Record<string, { rock?: RockStyle }>;
const rockStyle = (id: string): RockStyle => (STYLES[id]?.rock ?? STYLES[FLOOR.default].rock)!;

const rgb = (h: string): RGB => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
function ramp(stops: RGB[], t: number, out: RGB) {
  const f = clamp01(t) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(f)), k = f - i;
  const a = stops[i], b = stops[i + 1];
  out[0] = a[0] + (b[0] - a[0]) * k; out[1] = a[1] + (b[1] - a[1]) * k; out[2] = a[2] + (b[2] - a[2]) * k;
}
function hash(x: number, y: number, s: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function coarseField(W: number, H: number, step: number, scale: number, seed: number, octaves = 4) {
  const gw = Math.ceil(W / step) + 3, gh = Math.ceil(H / step) + 3;
  const g = new Float32Array(gw * gh);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) g[y * gw + x] = fbm(x * step / scale, y * step / scale, seed, octaves);
  return (x: number, y: number) => {
    const fx = Math.max(0, x) / step, fy = Math.max(0, y) / step, ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy;
    const i = iy * gw + ix;
    const a = g[i] + (g[i + 1] - g[i]) * tx;
    const b = g[i + gw] + (g[i + gw + 1] - g[i + gw]) * tx;
    return a + (b - a) * ty;
  };
}

export function paintRock(map: PlanetMap, styleId: string, seed: number): PaintedGround {
  const st = rockStyle(styleId);
  const T = 16, W = map.w * T, H = map.h * T;
  const data = new Uint8ClampedArray(W * H * 4);
  const rock = st.ramp.map(rgb), cover = st.cover?.map(rgb), seams = st.seams?.map(rgb);
  const r = mulberry32(seed ^ 0x70c4);
  const cellAt = (tx: number, ty: number) => (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h ? Cell.Void : map.cells[ty * map.w + tx]);
  const isRock = (tx: number, ty: number) => cellAt(tx, ty) === Cell.Rock;

  const height = coarseField(W, H, 3, 46, seed + 101);
  const tone = coarseField(W, H, 8, 180, seed + 113, 3);
  const mossy = coarseField(W, H, 4, 70, seed + 127, 3);
  const thr = 0.5 + (0.5 - (st.coverage ?? 0)) * 0.5;
  const tmp: RGB = [0, 0, 0], tmp2: RGB = [0, 0, 0];
  const put = (i: number, c: RGB, k = 1) => { data[i] = c[0] * k; data[i + 1] = c[1] * k; data[i + 2] = c[2] * k; data[i + 3] = 255; };

  // ember-style plates: jittered voronoi, seam where two plates meet
  const PLATE = 18;
  const plateEdge = (x: number, y: number) => {
    const gx = Math.floor(x / PLATE), gy = Math.floor(y / PLATE);
    let f1 = 1e9, f2 = 1e9;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const cx = gx + ox, cy = gy + oy;
      const dx = (cx + 0.15 + hash(cx, cy, seed) * 0.7) * PLATE - x, dy = (cy + 0.15 + hash(cx, cy, seed + 1) * 0.7) * PLATE - y;
      const d = dx * dx + dy * dy;
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
    return Math.sqrt(f2) - Math.sqrt(f1);
  };

  for (let ty = 0; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) {
    if (!isRock(tx, ty)) continue;
    const face = !isRock(tx, ty + 1);
    const openU = !isRock(tx, ty - 1), openL = !isRock(tx - 1, ty), openR = !isRock(tx + 1, ty);
    const faceL = openL || !isRock(tx - 1, ty + 1), faceR = openR || !isRock(tx + 1, ty + 1);
    for (let py = 0; py < T; py++) for (let px = 0; px < T; px++) {
      const x = tx * T + px, y = ty * T + py, i = (y * W + x) * 4;
      if (face) {
        // front face: lip at the top, streaked and banded, darker toward the ground
        const v = py / (T - 1);
        const streak = valueNoise(x / 2.3, y / 7, seed + 3) - 0.5;
        const strata = valueNoise(x / 15, y / 2.6, seed + 9);
        let t = 0.5 - v * 0.42 + streak * 0.16 + (tone(x, y) - 0.5) * 0.1;
        if (strata > 0.74) t -= 0.12;
        if (py === 0) t = openU ? 0.97 : 0.86; else if (py === 1) t = Math.max(t, 0.7);
        if (py >= T - 2) t -= 0.14;
        if (faceL && px === 0) t = 0.12; else if (faceR && px === T - 1) t = 0.08;
        else if (faceL && px === 1) t += 0.12;
        ramp(rock, t, tmp);
        put(i, tmp);
        continue;
      }
      // top: relief from the height field, light from the upper left
      const h = height(x, y);
      const dx = height(x + 1, y) - height(x - 1, y), dy = height(x, y + 1) - height(x, y - 1);
      const fine = valueNoise(x / 2.6, y / 2.6, seed + 5) - 0.5;
      let t = 0.5 + (-dx - dy) * st.relief + fine * 0.1 + (tone(x, y) - 0.5) * 0.14 + (h - 0.5) * 0.25;
      let k = 1;
      // contour cracks following the relief
      if (st.cracks > 0) {
        const c = fbm(x / 10, y / 10, seed + 21, 3) * 6 * st.cracks;
        const gate = valueNoise(x / 22, y / 22, seed + 8);
        if (Math.abs(c - Math.round(c)) < 0.045 && gate > 0.42) k = 0.62;
      }
      ramp(rock, t, tmp);
      // moss or snow gathers in the hollows, away from the edges
      if (cover && !(openU && py < 2) && !(openL && px < 2) && !(openR && px > T - 3)) {
        const m = mossy(x, y) + (0.5 - h) * 0.6 + fine * 0.25;
        if (m > thr) {
          ramp(cover, clamp01((m - thr) * 3) * 0.7 + fine * 0.6 + 0.15, tmp2);
          const a = clamp01((m - thr) * 6);
          tmp[0] += (tmp2[0] - tmp[0]) * a; tmp[1] += (tmp2[1] - tmp[1]) * a; tmp[2] += (tmp2[2] - tmp[2]) * a;
          k = Math.max(k, 0.9);
        }
      }
      // glowing seams between plates
      if (seams) {
        const e = plateEdge(x, y);
        if (e < 1.1) { ramp(seams, 0.3 + valueNoise(x / 6, y / 6, seed + 31) * 0.7, tmp); k = 1; }
        else if (e < 2.2) k *= 0.8;
      }
      // rim: lit along the top and left where the outcrop starts, a dark outline on the right
      if (openU && py === 0) { ramp(rock, 0.98, tmp); k = 1; }
      else if (openU && py === 1) { ramp(rock, Math.max(t, 0.78), tmp); k = 1; }
      if (openL && px === 0) { ramp(rock, 0.15, tmp); k = 1; } else if (openL && px === 1) { ramp(rock, Math.max(t, 0.8), tmp); k = 1; }
      if (openR && px === T - 1) { ramp(rock, 0.08, tmp); k = 1; }
      put(i, tmp, k);
    }
    // a few bright glints where the top catches the light
    if (!face && r() < 0.3) {
      const gx = tx * T + 2 + Math.floor(r() * 12), gy = ty * T + 2 + Math.floor(r() * 12);
      ramp(rock, 1, tmp);
      put((gy * W + gx) * 4, tmp);
    }
  }
  return { width: W, height: H, data };
}
