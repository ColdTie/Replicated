// Draws every Cem design (src/data/designs.json) as the world shows it and from four sides of the menu's turntable,
// with its volume, complexity, tier, price and print time, into screenshots/designs.png, so the designs can be judged
// in chat without starting the game. Usage: node --experimental-strip-types tools/design-preview.mjs [--cut 0.6]
// [--only nouschip] (one design, into screenshots/design-<id>.png)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { buildModel, renderModel, turntableSize } from '../src/world/voxel.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cat = JSON.parse(fs.readFileSync(path.join(root, 'src/data/designs.json'), 'utf8'));
const palette = JSON.parse(fs.readFileSync(path.join(root, 'src/data/palette.json'), 'utf8')).colors
  .map((h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]);
const ci = process.argv.indexOf('--cut');
const cutShare = ci > 0 ? Number(process.argv[ci + 1]) : null;
const oi = process.argv.indexOf('--only');
const only = oi > 0 ? process.argv[oi + 1] : null;

const scale = 3, gap = 8;
const rows = [];
for (const def of cat.designs.filter((d) => !only || d.id === only)) {
  const m = buildModel(def, cat);
  const cut = cutShare == null ? undefined : Math.round(m.volume * cutShare);
  const world = renderModel(m, cat, { yaw: cat.view.yaw ?? 0, pitch: cat.view.pitch, ppv: cat.view.ppv, cut, alive: cut ? Math.max(4, m.w * 2) : 0, palette, light: cat.view.light });
  const size = turntableSize(m, cat.view.turntablePitch, 3);
  const turns = [0.6, 2.2, 3.8, 5.4].map((yaw) => renderModel(m, cat, { yaw, pitch: cat.view.turntablePitch, ppv: 3, size, palette, light: cat.view.light }));
  rows.push({ m, imgs: [world, ...turns] });
  const cost = Object.entries(m.cost).map(([k, n]) => `${k} ${n}`).join(', ');
  console.log(`${def.name.padEnd(14)} ${String(m.w + 'x' + m.d + 'x' + m.h).padEnd(9)} volume ${String(m.volume).padStart(4)}  complexity ${String(m.complexity).padStart(2)} ${m.tier.padEnd(10)} ${String(m.seconds).padStart(4)}s  ${cost}`);
}
const width = Math.max(...rows.map((r) => r.imgs.reduce((a, im, k) => a + im.width * (k ? 1 : scale) + gap, gap)));
const height = rows.reduce((a, r) => a + Math.max(...r.imgs.map((im, k) => im.height * (k ? 1 : scale))) + gap, gap);
const png = new PNG({ width, height });
const bg = palette[24];
for (let i = 0; i < width * height; i++) { png.data[i * 4] = bg[0]; png.data[i * 4 + 1] = bg[1]; png.data[i * 4 + 2] = bg[2]; png.data[i * 4 + 3] = 255; }
let y = gap;
for (const r of rows) {
  let x = gap, rowH = 0;
  r.imgs.forEach((im, k) => {
    const s = k ? 1 : scale;
    for (let j = 0; j < im.height * s; j++) for (let i = 0; i < im.width * s; i++) {
      const sk = (Math.floor(j / s) * im.width + Math.floor(i / s)) * 4, a = im.data[sk + 3] / 255;
      if (!a) continue;
      const dk = ((y + j) * width + x + i) * 4;
      for (let c = 0; c < 3; c++) png.data[dk + c] = png.data[dk + c] * (1 - a) + im.data[sk + c] * a;
    }
    x += im.width * s + gap; rowH = Math.max(rowH, im.height * s);
  });
  y += rowH + gap;
}
fs.mkdirSync(path.join(root, 'screenshots'), { recursive: true });
fs.writeFileSync(path.join(root, 'screenshots', only ? `design-${only}.png` : cutShare == null ? 'designs.png' : 'designs-printing.png'), PNG.sync.write(png));
