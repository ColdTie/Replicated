// The Cems' designs as voxel models (src/data/designs.json): parts become a grid of material voxels, the grid gives the
// design its volume, complexity, price and print time, and a small ray caster draws it: in the world from the game's
// 3/4 camera (the printed layers solid, the newest still living Cems, the rest a faint guide lattice) and in the design
// menu as a turntable. Pure: no Phaser and no JSON imports, so tools/design-preview.mjs can run it in Node.

export type Box6 = [number, number, number, number, number, number];
export interface Part {
  box?: Box6; gable?: Box6; hip?: Box6; dome?: Box6; cyl?: Box6; cone?: Box6; carve?: Box6; paint?: Box6;
  mat?: string; ridge?: 'x' | 'y'; repeat?: number; step?: [number, number, number];
}
export interface DesignDef {
  id: string; name: string; gives: string; about: string; needs?: string[]; parts: Part[];
  /** 'post': stands at a free street lamp spot instead of taking a lot */ place?: 'post';
  /** printed only on this world (a planets.json id) */ only?: string;
  /** at most this many on a world (standing or being printed) */ max?: number;
}
export interface MaterialDef { ramp: number[]; alt?: number[]; glass?: boolean; emissive?: boolean }
export interface Costing {
  weights: Record<string, number>; matWeight: number; special: Record<string, number>;
  perVoxel: Record<string, Record<string, number>>; markup: number; woodPerComplexity: number;
  baseSeconds: number; secondsPerVoxel: number; secondsPerComplexity: number; nurseryCut: number;
  tiers: { below: number; name: string }[];
}
export interface Catalog { view: { pitch: number; ppv: number; turntablePitch: number; turntableSpeed: number; light: number[] }; materials: Record<string, MaterialDef>; costing: Costing; designs: DesignDef[] }

export interface Model {
  def: DesignDef;
  w: number; d: number; h: number;
  /** material index + 1 per voxel (0 empty); index x + y*w + z*w*d */
  vox: Uint8Array;
  /** material names by index */
  mats: string[];
  /** print order per voxel (-1 empty): layer by layer from the ground, back row first, the head running to and fro */
  rank: Int32Array;
  /** the voxel printed at each step (the inverse of rank) */
  order: Int32Array;
  volume: number;
  counts: Record<string, number>;
  complexity: number;
  tier: string;
  /** what it costs to print (ember from the Ember pool, the rest from the world's store) */
  cost: Record<string, number>;
  /** print time with no nursery, seconds */
  seconds: number;
}

const SHAPES = ['box', 'gable', 'hip', 'dome', 'cyl', 'cone', 'carve', 'paint'] as const;
type Shape = typeof SHAPES[number];

/** Is voxel (i, j, k) of a w x d x h box inside the shape? */
function inside(shape: Shape, i: number, j: number, k: number, w: number, d: number, h: number, ridge: 'x' | 'y') {
  const fx = (i + 0.5 - w / 2) / (w / 2), fy = (j + 0.5 - d / 2) / (d / 2), fz = (k + 0.5) / h;
  switch (shape) {
    case 'gable': {
      if (ridge === 'x') { const inset = Math.floor((k + 0.5) * (d / 2) / h); return j >= inset && j < d - inset; }
      const inset = Math.floor((k + 0.5) * (w / 2) / h); return i >= inset && i < w - inset;
    }
    case 'hip': {
      const ix = Math.floor((k + 0.5) * (w / 2) / h), iy = Math.floor((k + 0.5) * (d / 2) / h);
      return i >= ix && i < w - ix && j >= iy && j < d - iy;
    }
    case 'dome': return fx * fx + fy * fy + fz * fz <= 1.02;
    case 'cyl': return fx * fx + fy * fy <= 1.02;
    case 'cone': { const r = 1 - k / h; return fx * fx + fy * fy <= r * r * 1.02; }
    default: return true;
  }
}

/** Builds a design's grid from its parts and works out what it costs. */
export function buildModel(def: DesignDef, cat: Catalog): Model {
  const mats = Object.keys(cat.materials);
  const C = cat.costing;
  // the extent of every part (repeats included)
  let w = 1, d = 1, h = 1;
  const placed: { shape: Shape; box: Box6; mat: number; ridge: 'x' | 'y' }[] = [];
  let complexity = 0;
  for (const p of def.parts) {
    const shape = SHAPES.find((s) => p[s]);
    if (!shape) continue;
    const b = p[shape]!;
    const n = Math.max(1, p.repeat ?? 1), st = p.step ?? [0, 0, 0];
    complexity += (C.weights[shape] ?? 1) * n;
    for (let r = 0; r < n; r++) {
      const box: Box6 = [b[0] + st[0] * r, b[1] + st[1] * r, b[2] + st[2] * r, b[3], b[4], b[5]];
      placed.push({ shape, box, mat: Math.max(0, mats.indexOf(p.mat ?? 'lignin')) + 1, ridge: p.ridge ?? 'x' });
      if (shape !== 'carve' && shape !== 'paint') { w = Math.max(w, box[0] + box[3]); d = Math.max(d, box[1] + box[4]); h = Math.max(h, box[2] + box[5]); }
    }
  }
  const vox = new Uint8Array(w * d * h);
  const at = (x: number, y: number, z: number) => x + y * w + z * w * d;
  for (const p of placed) {
    const [x0, y0, z0, bw, bd, bh] = p.box;
    for (let k = 0; k < bh; k++) for (let j = 0; j < bd; j++) for (let i = 0; i < bw; i++) {
      const x = x0 + i, y = y0 + j, z = z0 + k;
      if (x < 0 || y < 0 || z < 0 || x >= w || y >= d || z >= h || !inside(p.shape, i, j, k, bw, bd, bh, p.ridge)) continue;
      const v = at(x, y, z);
      if (p.shape === 'carve') vox[v] = 0;
      else if (p.shape === 'paint') { if (vox[v]) vox[v] = p.mat; }
      else vox[v] = p.mat;
    }
  }
  // volume, materials, complexity
  const counts: Record<string, number> = {};
  let volume = 0;
  for (const v of vox) if (v) { volume++; counts[mats[v - 1]] = (counts[mats[v - 1]] ?? 0) + 1; }
  complexity += (Object.keys(counts).length - 1) * C.matWeight;
  for (const [m, n] of Object.entries(counts)) complexity += (C.special[m] ?? 0) * n;
  complexity = Math.round(complexity);
  const tier = C.tiers.find((t) => complexity < t.below)?.name ?? C.tiers[C.tiers.length - 1].name;
  // the price: every voxel's material, marked up by complexity; the ants' and fungus' feed; the time
  const raw: Record<string, number> = {};
  for (const [m, n] of Object.entries(counts)) for (const [res, per] of Object.entries(C.perVoxel[m] ?? {})) raw[res] = (raw[res] ?? 0) + n * per;
  const cost: Record<string, number> = {};
  for (const [res, n] of Object.entries(raw)) cost[res] = Math.max(1, Math.ceil(n * (1 + complexity * C.markup)));
  cost.wood = Math.max(1, Math.ceil(complexity * C.woodPerComplexity));
  const seconds = Math.round((C.baseSeconds + volume * C.secondsPerVoxel) * (1 + complexity * C.secondsPerComplexity));
  // print order: layer by layer, the back row first, the head running to and fro along each row
  const order: number[] = [];
  for (let z = 0; z < h; z++) for (let yy = 0; yy < d; yy++) {
    const y = d - 1 - yy, back = (z * d + yy) % 2 === 1;
    for (let xx = 0; xx < w; xx++) { const x = back ? w - 1 - xx : xx; if (vox[at(x, y, z)]) order.push(at(x, y, z)); }
  }
  const rank = new Int32Array(vox.length).fill(-1);
  order.forEach((v, r) => { rank[v] = r; });
  return { def, w, d, h, vox, mats, rank, order: Int32Array.from(order), volume, counts, complexity, tier, cost, seconds };
}

// ------------------------------------------------------------------ drawing

export interface RenderOpts {
  /** camera turn around the model (radians; 0 = from the front) and how far it looks down (degrees) */
  yaw: number; pitch: number;
  /** px per voxel */
  ppv: number;
  /** voxels printed so far (print order); the rest show as the guide lattice. Absent: all of it */
  cut?: number;
  /** how many of the last printed voxels are still living Cems (drawn in the cem material) */
  alive?: number;
  /** a fixed canvas (the turntable); otherwise the image fits the model at this angle */
  size?: [number, number];
  /** RGB per palette index */
  palette: [number, number, number][];
  light: number[];
}
export interface Rendered {
  width: number; height: number; data: Uint8ClampedArray<ArrayBuffer>;
  /** lit (emissive) pixels seen, image px */
  lit: { x: number; y: number }[];
  /** where a point of the model (voxel units) lands in the image (px) */
  toImage(x: number, y: number, z: number): { x: number; y: number };
}

const GHOST: [number, number, number] = [44, 232, 245];

/**
 * Ray casts the model, one ray per pixel (orthographic): faces shaded by a fixed light in the world (so a turntable
 * shows the light sweep around it), lignin laminated layer by layer, glass seen through, a 1px dark outline and dark
 * contours where one surface passes in front of another. Unprinted voxels are a faint cyan lattice.
 */
export function renderModel(m: Model, cat: Catalog, o: RenderOpts): Rendered {
  const { w, d, h } = m;
  const yaw = o.yaw, p = (o.pitch * Math.PI) / 180;
  const f = [Math.sin(yaw) * Math.cos(p), Math.cos(yaw) * Math.cos(p), -Math.sin(p)];
  const r = [Math.cos(yaw), -Math.sin(yaw), 0];
  const u = [Math.sin(yaw) * Math.sin(p), Math.cos(yaw) * Math.sin(p), Math.cos(p)];
  const c = [w / 2, d / 2, h / 2];
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  // where the box lands on screen (voxel units from the center)
  let x0: number, x1: number, y0: number, y1: number;
  if (o.size) {
    x0 = -o.size[0] / 2 / o.ppv; x1 = -x0; y0 = -o.size[1] / 2 / o.ppv; y1 = -y0;
  } else {
    x0 = y0 = Infinity; x1 = y1 = -Infinity;
    for (const cx of [0, w]) for (const cy of [0, d]) for (const cz of [0, h]) {
      const q = [cx - c[0], cy - c[1], cz - c[2]];
      const sx = dot(q, r), sy = dot(q, u);
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
  }
  const pad = o.size ? 0 : 1;
  const W = o.size ? o.size[0] : Math.ceil((x1 - x0) * o.ppv) + pad * 2;
  const H = o.size ? o.size[1] : Math.ceil((y1 - y0) * o.ppv) + pad * 2;
  const data = new Uint8ClampedArray(W * H * 4);
  const depth = new Float32Array(W * H).fill(Infinity);
  const solid = new Uint8Array(W * H);
  const lit: { x: number; y: number }[] = [];
  const L = (() => { const l = o.light, n = Math.hypot(l[0], l[1], l[2]) || 1; return [l[0] / n, l[1] / n, l[2] / n]; })();
  const mats = m.mats.map((name) => cat.materials[name]);
  const cemIdx = m.mats.indexOf('cem');
  const cut = o.cut ?? Infinity, alive = o.alive ?? 0;
  const far = w + d + h + 4;
  const step = [Math.sign(f[0]), Math.sign(f[1]), Math.sign(f[2])];
  const tDelta = [Math.abs(1 / f[0]), Math.abs(1 / f[1]), Math.abs(1 / f[2])];
  const dims = [w, d, h];

  // the color of a face of a voxel
  const shade = (mi: number, axis: number, sgn: number, hit: number[], vi: number): [number, number, number] => {
    const mat = mats[mi];
    const n = [0, 0, 0]; n[axis] = sgn;
    const lam = dot(n, L);
    let tone = lam > 0.62 ? 0 : lam > 0.2 ? 1 : 2;
    const layer = Math.floor(hit[2] - (axis === 2 && sgn > 0 ? 0.5 : 0));
    let ramp = mat.ramp;
    if (mat.alt && axis !== 2 && layer % 2 === 1) ramp = mat.alt;
    // a darker seam under every third layer of lignin, the way laminated metal shows its folds
    if (mat.alt && axis !== 2 && layer % 3 === 0 && hit[2] - layer < 1 / (o.ppv * Math.cos(p)) + 0.02) tone = Math.min(2, tone + 1);
    // a glint on the odd top of a laminated voxel
    if (mat.alt && axis === 2 && sgn > 0 && (vi * 7) % 23 === 0) return o.palette[30] ?? o.palette[ramp[0]];
    return o.palette[ramp[tone]];
  };

  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const sx = x0 + (i - pad + 0.5) / o.ppv, sy = y1 - (j - pad + 0.5) / o.ppv;
    const O = [c[0] + r[0] * sx + u[0] * sy - f[0] * far, c[1] + r[1] * sx + u[1] * sy - f[1] * far, c[2] + r[2] * sx + u[2] * sy - f[2] * far];
    // into the box (slabs)
    let tmin = -Infinity, tmax = Infinity, axis = 0;
    let miss = false;
    for (let a = 0; a < 3; a++) {
      if (Math.abs(f[a]) < 1e-9) { if (O[a] < 0 || O[a] > dims[a]) { miss = true; break; } continue; }
      let t0 = (0 - O[a]) / f[a], t1 = (dims[a] - O[a]) / f[a];
      if (t0 > t1) { const t = t0; t0 = t1; t1 = t; }
      if (t0 > tmin) { tmin = t0; axis = a; }
      tmax = Math.min(tmax, t1);
    }
    if (miss || tmin > tmax || tmax < 0) continue;
    const pos = [O[0] + f[0] * (tmin + 1e-4), O[1] + f[1] * (tmin + 1e-4), O[2] + f[2] * (tmin + 1e-4)];
    const v = [Math.min(w - 1, Math.max(0, Math.floor(pos[0]))), Math.min(d - 1, Math.max(0, Math.floor(pos[1]))), Math.min(h - 1, Math.max(0, Math.floor(pos[2])))];
    const tMax = [0, 1, 2].map((a) => (f[a] === 0 ? Infinity : ((v[a] + (step[a] > 0 ? 1 : 0)) - O[a]) / f[a]));
    let tEnter = tmin, sgn = -step[axis];
    let glass: [number, number, number] | null = null;
    let ghost: { t: number; edge: boolean } | null = null;
    let hitColor: [number, number, number] | null = null, hitT = 0;
    for (let guard = 0; guard < 400; guard++) {
      const vi = v[0] + v[1] * w + v[2] * w * d;
      const val = m.vox[vi];
      if (val) {
        const rk = m.rank[vi];
        const hit = [O[0] + f[0] * tEnter, O[1] + f[1] * tEnter, O[2] + f[2] * tEnter];
        if (rk < cut) {
          let mi = val - 1;
          if (rk >= cut - alive && cemIdx >= 0 && !mats[mi].glass) mi = cemIdx;
          const mat = mats[mi];
          if (mat.glass && !glass) {
            glass = shade(mi, axis, sgn, hit, vi);
            if (mat.emissive && axis !== 2 && (i * 7 + j * 13) % 12 === 0) lit.push({ x: i, y: j });
          } else if (!mat.glass) {
            hitColor = shade(mi, axis, sgn, hit, vi); hitT = tEnter;
            if (mat.emissive) lit.push({ x: i, y: j });
            break;
          }
        } else if (!ghost) {
          // the guide lattice: a line along every other voxel edge on the face it is seen by
          const a1 = (axis + 1) % 3, a2 = (axis + 2) % 3;
          const fa = hit[a1] - Math.floor(hit[a1]), fb = hit[a2] - Math.floor(hit[a2]);
          const e = 1.2 / o.ppv;
          ghost = { t: tEnter, edge: ((fa < e || fa > 1 - e) && Math.floor(hit[a1] + 0.5) % 2 === 0) || ((fb < e || fb > 1 - e) && Math.floor(hit[a2] + 0.5) % 2 === 0) };
        }
      }
      // the next voxel along the ray
      const a = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : (tMax[1] < tMax[2] ? 1 : 2);
      tEnter = tMax[a];
      if (tEnter > tmax) break;
      v[a] += step[a];
      if (v[a] < 0 || v[a] >= dims[a]) break;
      tMax[a] += tDelta[a];
      axis = a; sgn = -step[a];
    }
    const k = (j * W + i) * 4;
    let col: [number, number, number] | null = hitColor, alpha = hitColor ? 255 : 0;
    if (glass) {
      if (col) col = [col[0] * 0.45 + glass[0] * 0.55, col[1] * 0.45 + glass[1] * 0.55, col[2] * 0.45 + glass[2] * 0.55];
      else { col = glass; alpha = 210; }
    }
    if (ghost && (!hitColor || ghost.t < hitT)) {
      const g = ghost.edge ? 0.55 : 0.16;
      if (col) col = [col[0] * (1 - g) + GHOST[0] * g, col[1] * (1 - g) + GHOST[1] * g, col[2] * (1 - g) + GHOST[2] * g];
      else { col = GHOST; alpha = ghost.edge ? 120 : 34; }
    }
    if (!col) continue;
    data[k] = col[0]; data[k + 1] = col[1]; data[k + 2] = col[2]; data[k + 3] = alpha;
    if (hitColor) { solid[j * W + i] = 1; depth[j * W + i] = hitT; }
  }
  // contours where a nearer surface passes over a farther one, then the outline around the whole
  const ink = o.palette[25];
  const darken = (k: number, t: number) => { data[k] = data[k] * (1 - t) + ink[0] * t; data[k + 1] = data[k + 1] * (1 - t) + ink[1] * t; data[k + 2] = data[k + 2] * (1 - t) + ink[2] * t; };
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const q = j * W + i;
    if (!solid[q]) continue;
    for (const [di, dj] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      const n = nj * W + ni;
      if (solid[n] && depth[q] - depth[n] > 1.6) { darken(q * 4, 0.55); break; }
    }
  }
  const out = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const q = j * W + i;
    if (solid[q] || data[q * 4 + 3] > 150) continue;
    if ((i > 0 && solid[q - 1]) || (i < W - 1 && solid[q + 1]) || (j > 0 && solid[q - W]) || (j < H - 1 && solid[q + W])) out[q] = 1;
  }
  for (let q = 0; q < W * H; q++) if (out[q]) { const k = q * 4; data[k] = ink[0]; data[k + 1] = ink[1]; data[k + 2] = ink[2]; data[k + 3] = 255; }
  const toImage = (x: number, y: number, z: number) => {
    const q = [x - c[0], y - c[1], z - c[2]];
    return { x: (dot(q, r) - x0) * o.ppv + pad, y: (y1 - dot(q, u)) * o.ppv + pad };
  };
  return { width: W, height: H, data, lit, toImage };
}

/** A fixed canvas that holds the model at every turn of the turntable. */
export function turntableSize(m: Model, pitchDeg: number, ppv: number): [number, number] {
  const p = (pitchDeg * Math.PI) / 180, R = Math.hypot(m.w, m.d) / 2;
  return [Math.ceil(R * 2 * ppv) + 4, Math.ceil((R * 2 * Math.sin(p) + m.h * Math.cos(p)) * ppv) + 4];
}

/** How far the front of the footprint reaches back on screen (px) in the world view: the depth the building covers. */
export function footprintDepthPx(m: Model, pitchDeg: number, ppv: number) {
  return m.d * Math.sin((pitchDeg * Math.PI) / 180) * ppv;
}

/** The print time with this many Cem Nurseries standing (ms). */
export function printMs(m: Model, cat: Catalog, nurseries: number) {
  return Math.round(m.seconds * 1000 * Math.pow(1 - cat.costing.nurseryCut, Math.min(3, nurseries)));
}
