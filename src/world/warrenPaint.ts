// The warren, painted: one full-color image of the underground. Rock is dark cave stone with faint strata and a
// few veins of the planet's crystal; dug floors are worn flagstones (rooms) and packed earth (corridors); a wall
// face is drawn where rock stands above floor, with a lit rim on every edge rock meets floor. Planned rooms show
// as chalk-dashed outlines so a visit shows what the copies are about to dig.
import { fbm, mulberry32 } from '../core/rng';
import { PALETTE } from '../core/data';
import type { WarrenData } from '../net/store';
import { CAVE, GRID_H, GRID_W, allRooms, buildCells } from './warren';

type RGB = [number, number, number];
const rgb = (c: number): RGB => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const P = (i: number) => rgb(PALETTE[i]);
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export interface Painted { width: number; height: number; data: Uint8ClampedArray<ArrayBuffer>; cells: Uint8Array }

/** The wall face of a rock cell above floor takes this many pixels at the bottom of the rock tile. */
export const FACE_PX = 10;

export function paintWarren(d: WarrenData, accent: [number, number, number], seed: number): Painted {
  const width = GRID_W * 16, height = GRID_H * 16;
  const data = new Uint8ClampedArray(width * height * 4);
  const cells = buildCells(d);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H ? CAVE.rock : cells[y * GRID_W + x]);
  const rng = mulberry32(seed ^ 0x5a77);
  const rock0 = P(25), rock1 = P(24), rock2 = P(23), rim = P(22), rimLit = P(21);
  const slab0 = P(24), slab1 = P(23), grout = P(25), earth0 = mix(P(24), P(5), 0.35), earth1 = mix(P(23), P(4), 0.25);
  const vein = P(accent[1]), veinLit = P(accent[2]);
  const put = (x: number, y: number, c: RGB, a = 1) => {
    const i = (y * width + x) * 4;
    if (a >= 1) { data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255; return; }
    data[i] = data[i] + (c[0] - data[i]) * a; data[i + 1] = data[i + 1] + (c[1] - data[i + 1]) * a; data[i + 2] = data[i + 2] + (c[2] - data[i + 2]) * a; data[i + 3] = 255;
  };
  const roomOf = new Int16Array(GRID_W * GRID_H).fill(-1);
  const rooms = allRooms(d);
  rooms.forEach((r, i) => { for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) roomOf[y * GRID_W + x] = i; });

  for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
    const tx = px >> 4, ty = py >> 4, c = at(tx, ty);
    if (c === CAVE.floor) {
      const inRoom = roomOf[ty * GRID_W + tx] >= 0;
      if (inRoom) {
        // flagstones: 8px slabs with grout, each slab its own shade
        // worn slabs of uneven size: the grout lines wander and break so no grid shows
        const wob = Math.floor(fbm(px * 0.05, py * 0.05, seed + 2) * 6 - 3);
        const sx = (px + wob) >> 4, sy = (py - wob) >> 3;
        const h = fbm(sx * 7.1, sy * 7.1, seed);
        let col = mix(slab0, slab1, 0.3 + h * 0.55);
        const n = fbm(px * 0.3, py * 0.3, seed + 3);
        col = mix(col, rock1, (n - 0.5) * 0.35);
        const onLine = ((px + wob) & 15) === 0 || ((py - wob) & 7) === 0;
        if (onLine && fbm(px * 0.6, py * 0.6, seed + 4) > 0.35) col = mix(col, grout, 0.35);
        if (rng() < 0.01) col = mix(col, rock2, 0.5);
        put(px, py, col);
      } else {
        const n = fbm(px * 0.18, py * 0.18, seed + 5);
        let col = mix(earth0, earth1, n);
        if (rng() < 0.03) col = mix(col, rock2, 0.5);
        put(px, py, col);
      }
    } else if (c === CAVE.planned) {
      // unlit rock with a chalk outline: what the copies mean to dig
      const n = fbm(px * 0.12, py * 0.12, seed + 1);
      put(px, py, mix(rock0, rock1, n * 0.5));
    } else {
      // rock: layered strata, speckles and the odd vein
      const n = fbm(px * 0.11, py * 0.07, seed + 1);
      const strata = 0.5 + 0.5 * Math.sin(py * 0.45 + fbm(px * 0.05, py * 0.05, seed + 9) * 6);
      let col = mix(rock0, rock1, n * 0.7 + strata * 0.15);
      // thin crystal veins: a ridge of the noise field, bright at its crest
      const v = Math.abs(fbm(px * 0.045, py * 0.045, seed + 21) - 0.56);
      if (v < 0.018) col = mix(col, v < 0.007 ? veinLit : vein, 0.55 - v * 18);
      if (rng() < 0.015) col = mix(col, rock2, 0.6);
      put(px, py, col);
    }
  }

  // wall faces and rims
  for (let ty = 0; ty < GRID_H; ty++) for (let tx = 0; tx < GRID_W; tx++) {
    if (at(tx, ty) !== CAVE.rock) continue;
    const x0 = tx * 16, y0 = ty * 16;
    if (at(tx, ty + 1) === CAVE.floor) {
      // a face: lit lip, stone courses darkening toward the floor
      for (let py = 16 - FACE_PX; py < 16; py++) for (let px = 0; px < 16; px++) {
        const t = (py - (16 - FACE_PX)) / FACE_PX;
        const n = fbm((x0 + px) * 0.3, (y0 + py) * 0.3, seed + 31);
        let col = mix(mix(rimLit, rock2, 0.3), rock0, t * 0.9);
        col = mix(col, rock2, (n - 0.5) * 0.4);
        if (((y0 + py) & 3) === 0 && ((x0 + px + ((py >> 2) & 1) * 4) & 7) === 0) col = mix(col, rock0, 0.5);
        if (py === 16 - FACE_PX) col = rimLit;
        put(x0 + px, y0 + py, col);
      }
    }
    if (at(tx, ty - 1) === CAVE.floor) for (let px = 0; px < 16; px++) put(x0 + px, y0, rim, 0.8);
    if (at(tx - 1, ty) === CAVE.floor) for (let py = 0; py < 16; py++) put(x0, y0 + py, rimLit, 0.7);
    if (at(tx + 1, ty) === CAVE.floor) for (let py = 0; py < 16; py++) put(x0 + 15, y0 + py, rim, 0.7);
  }
  // soft shadow on the floor under every wall face, so rooms read as sunk into the rock
  for (let ty = 0; ty < GRID_H; ty++) for (let tx = 0; tx < GRID_W; tx++) {
    if (at(tx, ty) !== CAVE.floor) continue;
    const x0 = tx * 16, y0 = ty * 16;
    if (at(tx, ty - 1) === CAVE.rock) for (let py = 0; py < 5; py++) for (let px = 0; px < 16; px++) put(x0 + px, y0 + py, rock0, 0.5 - py * 0.09);
    if (at(tx - 1, ty) === CAVE.rock) for (let py = 0; py < 16; py++) for (let px = 0; px < 3; px++) put(x0 + px, y0 + py, rock0, 0.3 - px * 0.09);
  }
  // chalk outlines around planned rooms (dashed, the color of pale bone)
  const chalk = P(2);
  for (const r of rooms) {
    if (r.dug) continue;
    const x0 = r.x * 16, y0 = r.y * 16, x1 = (r.x + r.w) * 16 - 1, y1 = (r.y + r.h) * 16 - 1;
    for (let px = x0; px <= x1; px++) if ((px >> 2) & 1) { put(px, y0, chalk, 0.5); put(px, y1, chalk, 0.5); }
    for (let py = y0; py <= y1; py++) if ((py >> 2) & 1) { put(x0, py, chalk, 0.5); put(x1, py, chalk, 0.5); }
  }
  return { width, height, data, cells };
}
