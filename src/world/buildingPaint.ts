// Draws a surface building from its blueprint: walls in the material's pattern (planks, stone blocks, riveted
// scrap plates) in the copy's primary color, a roof (flat, peaked, dome) in its secondary, a door on the side it
// asked for, a window with warm light, a 1px outline. Pure pixels, so one texture per building.
import { PALETTE } from '../core/data';
import { kitColor } from '../core/body';
import type { Building } from '../net/store';

type RGB = [number, number, number];
const rgb = (c: number): RGB => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const P = (i: number) => rgb(PALETTE[i]);
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const dark = (c: RGB, t: number) => mix(c, P(25), t);
const light = (c: RGB, t: number) => mix(c, P(19), t);

export interface PaintedBuilding { width: number; height: number; data: Uint8ClampedArray<ArrayBuffer>; roofH: number }

export function roofHeight(b: Building) {
  const w = b.w * 16;
  return b.roof === 'peaked' ? Math.round(w * 0.3) + 4 : b.roof === 'dome' ? Math.round(w * 0.35) : 5;
}

export function paintBuilding(b: Building): PaintedBuilding {
  const W = b.w * 16, wallH = b.h * 12, roofH = roofHeight(b);
  const H = wallH + roofH + 2;
  const width = W + 2, height = H;
  const data = new Uint8ClampedArray(width * height * 4);
  const solid = new Uint8Array(width * height);
  const put = (x: number, y: number, c: RGB) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 4;
    data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255; solid[y * width + x] = 1;
  };
  const primary = P(kitColor(b.primary, 20)), secondary = P(kitColor(b.secondary, 22));
  const x0 = 1, wallTop = roofH + 1, wallBottom = wallTop + wallH;

  // walls
  for (let y = wallTop; y < wallBottom; y++) for (let x = x0; x < x0 + W; x++) {
    let c = primary;
    const lx = x - x0, ly = y - wallTop;
    if (b.material === 'wood') {
      if (ly % 4 === 3) c = dark(c, 0.35);                      // plank seams
      else if ((lx + ly * 7) % 23 === 0) c = dark(c, 0.15);     // grain
    } else if (b.material === 'stone') {
      const row = Math.floor(ly / 5), off = (row % 2) * 4;
      if (ly % 5 === 4 || (lx + off) % 8 === 7) c = dark(c, 0.4); // mortar
      else if ((lx * 3 + row * 5) % 11 === 0) c = light(c, 0.08);
    } else {
      const px = Math.floor(lx / 10), py = Math.floor(ly / 8);
      if (lx % 10 === 0 || ly % 8 === 0) c = dark(c, 0.45);      // plate edges
      else if ((lx % 10 === 2 || lx % 10 === 8) && (ly % 8 === 2 || ly % 8 === 6)) c = light(c, 0.3); // rivets
      else if ((px + py) % 2) c = dark(c, 0.08);
    }
    if (lx < 2) c = light(c, 0.2);
    if (lx >= W - 2) c = dark(c, 0.3);
    if (ly >= wallH - 2) c = dark(c, 0.25);
    put(x, y, c);
  }
  // roof
  const cx = x0 + W / 2;
  for (let y = 1; y < wallTop; y++) for (let x = x0 - 1; x <= x0 + W; x++) {
    const t = (wallTop - y) / roofH; // 0 at the eaves, 1 at the top
    let inside = false;
    if (b.roof === 'flat') inside = y >= wallTop - 5 && x >= x0 - 1 && x <= x0 + W;
    else if (b.roof === 'peaked') inside = Math.abs(x - cx) <= (W / 2 + 1) * (1 - t);
    else inside = ((x - cx) / (W / 2 + 1)) ** 2 + (t) ** 2 <= 1;
    if (!inside) continue;
    let c = secondary;
    if (b.roof === 'peaked') c = x < cx ? light(c, 0.15) : dark(c, 0.2);
    else if (b.roof === 'dome') c = light(c, Math.max(0, 0.3 - Math.hypot((x - cx) / (W / 2), 1 - t) * 0.3));
    else c = y === wallTop - 5 ? light(c, 0.2) : dark(c, 0.1);
    if (b.roof !== 'dome' && (y + x) % 5 === 0) c = dark(c, 0.12);
    put(x, y, c);
  }
  // door
  const doorW = 6, doorH = Math.min(10, wallH - 2);
  const warm = P(10), glow = P(9);
  if (b.door === 'south') {
    const dx = Math.round(cx - doorW / 2);
    for (let y = wallBottom - doorH; y < wallBottom; y++) for (let x = dx; x < dx + doorW; x++) put(x, y, y === wallBottom - doorH ? warm : dark(primary, 0.75));
  } else {
    const dx = b.door === 'west' ? x0 : x0 + W - doorW;
    for (let y = wallBottom - doorH; y < wallBottom; y++) for (let x = dx; x < dx + doorW; x++) put(x, y, y === wallBottom - doorH ? warm : dark(primary, 0.75));
  }
  // window (warm), away from the door
  const wx = b.door === 'west' ? x0 + W - 9 : x0 + 3, wy = wallTop + 3;
  if (wallH >= 10 && W >= 24) for (let y = wy; y < wy + 4; y++) for (let x = wx; x < wx + 5; x++) put(x, y, (x - wx) % 3 === 2 ? dark(primary, 0.5) : (y - wy) % 3 === 2 ? dark(primary, 0.5) : (x + y) % 2 ? warm : glow);
  // outline
  const [or, og, ob] = P(25);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (solid[y * width + x]) continue;
    const near = (x > 0 && solid[y * width + x - 1]) || (x < width - 1 && solid[y * width + x + 1]) || (y > 0 && solid[(y - 1) * width + x]) || (y < height - 1 && solid[(y + 1) * width + x]);
    if (!near) continue;
    const i = (y * width + x) * 4;
    data[i] = or; data[i + 1] = og; data[i + 2] = ob; data[i + 3] = 255;
  }
  return { width, height, data, roofH };
}
