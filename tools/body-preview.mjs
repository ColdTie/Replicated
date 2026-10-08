// Renders a few composed bodies from the parts kit side by side (4x) into screenshots/bodies.png so the kit can
// be judged in chat without starting the game. Usage: node tools/body-preview.mjs [--random 6]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { renderBody, normalizeSpec } from '../src/core/bodyRender.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const kit = JSON.parse(fs.readFileSync(path.join(root, 'src/data/parts.json'), 'utf8'));
const palette = JSON.parse(fs.readFileSync(path.join(root, 'src/data/palette.json'), 'utf8')).colors
  .map((h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]);
const player = JSON.parse(fs.readFileSync(path.join(root, 'src/data/player.json'), 'utf8'));

const i = process.argv.indexOf('--random');
const random = i > 0 ? Number(process.argv[i + 1]) : 6;
let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
const pick = (o) => { const k = Object.keys(o).filter((x) => !x.startsWith('_')); return k[Math.floor(rnd() * k.length)]; };

const specs = [
  { name: 'default', spec: normalizeSpec(kit, kit.defaults), feature: player.feature },
  { name: 'blank', spec: normalizeSpec(kit, kit.blank), feature: [23, 22] },
];
for (let k = 0; k < random; k++) {
  const spec = normalizeSpec(kit, {
    head: pick(kit.head.variants), visor: pick(kit.visor.variants), torso: pick(kit.torso.variants), arms: pick(kit.arms.variants),
    legs: pick(kit.legs.variants), back: pick(kit.back.variants), headgear: Math.floor(rnd() * 7),
    primary: pick(kit.colors), secondary: pick(kit.colors), accent: pick(kit.colors),
  });
  specs.push({ name: `random ${k + 1}`, spec, feature: player.featureColors[Math.floor(rnd() * player.featureColors.length)] });
}

const scale = 4, pad = 6;
const rendered = specs.map((s) => renderBody(kit, s.spec, s.feature, palette));
const width = rendered[0].width * scale + pad * 2;
const height = rendered.reduce((a, r) => a + r.height * scale + pad, pad);
const sheet = new PNG({ width, height });
const bg = palette[24];
for (let p = 0; p < sheet.data.length; p += 4) { sheet.data[p] = bg[0]; sheet.data[p + 1] = bg[1]; sheet.data[p + 2] = bg[2]; sheet.data[p + 3] = 255; }
let oy = pad;
for (const r of rendered) {
  for (let y = 0; y < r.height * scale; y++) for (let x = 0; x < r.width * scale; x++) {
    const si = ((Math.floor(y / scale) * r.width) + Math.floor(x / scale)) * 4;
    if (r.data[si + 3] === 0) continue;
    const di = (((oy + y) * width) + pad + x) * 4;
    sheet.data[di] = r.data[si]; sheet.data[di + 1] = r.data[si + 1]; sheet.data[di + 2] = r.data[si + 2]; sheet.data[di + 3] = 255;
  }
  oy += r.height * scale + pad;
}
fs.mkdirSync(path.join(root, 'screenshots'), { recursive: true });
fs.writeFileSync(path.join(root, 'screenshots/bodies.png'), PNG.sync.write(sheet));
console.log(`bodies: ${specs.map((s) => `${s.name} = ${Object.values(s.spec).join('/')}`).join('\n')}\n-> screenshots/bodies.png`);
