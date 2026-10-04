// Sprite pipeline: tools/sprites/*.json (palette-index grids) -> public/assets/gen/*.png + manifest.json
//
// Sprite JSON format:
//   { "size": [w, h], "tinted": bool,
//     "legend": { ".": null, "o": 25, "v": "f1", "m": "a1" },   // palette index, role name, or null
//     "animations": { "walk": { "fps": 10, "frames": [0,1,2] } },
//     "frames": [ ["row", "row", ...], ... ] }
// Roles: a0/a1/a2 = planet accent (dark/mid/light), g0/g1/g2 = planet ground (dark/base/speckle),
// f0/f1 = replicant feature color.
// Tinted sprites are rendered once per planet as <name>.<planetId>.png.
// Featured sprites ("featured": true) are rendered once per player.json featureColors pair as <name>.f<light>.png.
//
// Usage: node tools/gen-sprites.mjs [--preview]   (--preview writes screenshots/sprite-sheet.png)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const spriteDir = path.join(root, 'tools/sprites');
const outDir = path.join(root, 'public/assets/gen');
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

const palette = readJson('src/data/palette.json').colors.map((hex) => [
  parseInt(hex.slice(0, 2), 16),
  parseInt(hex.slice(2, 4), 16),
  parseInt(hex.slice(4, 6), 16),
]);
// Tinted sheets are made for every hand-made planet and every biome (worlds around other stars share a biome's sheet)
const planets = [...readJson('src/data/planets.json').planets, ...readJson('src/data/biomes.json').biomes];
const player = readJson('src/data/player.json');

function roleResolver(planet, feature = player.feature) {
  return {
    a0: planet?.accent[0] ?? 22,
    a1: planet?.accent[1] ?? 21,
    a2: planet?.accent[2] ?? 20,
    f0: feature[0],
    f1: feature[1],
    g0: planet?.ground?.[0] ?? 25,
    g1: planet?.ground?.[1] ?? 24,
    g2: planet?.ground?.[2] ?? 23,
  };
}

function render(sprite, roles, name) {
  const [w, h] = sprite.size;
  const frames = sprite.frames;
  const png = new PNG({ width: w * frames.length, height: h });
  frames.forEach((rows, fi) => {
    if (rows.length !== h) throw new Error(`${name} frame ${fi}: expected ${h} rows, got ${rows.length}`);
    rows.forEach((row, y) => {
      if (row.length !== w) throw new Error(`${name} frame ${fi} row ${y}: expected ${w} chars, got ${row.length}`);
      for (let x = 0; x < w; x++) {
        const ch = row[x];
        if (!(ch in sprite.legend)) throw new Error(`${name} frame ${fi}: unknown legend char '${ch}'`);
        let v = sprite.legend[ch];
        if (typeof v === 'string') v = roles[v];
        const i = ((y * png.width) + fi * w + x) * 4;
        if (v === null || v === undefined) {
          png.data[i + 3] = 0;
          continue;
        }
        const [r, g, b] = palette[v];
        png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = 255;
      }
    });
  });
  return png;
}

function renderFont(font) {
  const [cw, ch] = font.cell;
  const chars = Object.keys(font.glyphs);
  const png = new PNG({ width: cw * chars.length, height: ch });
  const [r, g, b] = palette[font.color ?? 19];
  chars.forEach((c, ci) => {
    const rows = font.glyphs[c];
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] === '.' || row[x] === ' ') continue;
        const i = ((y * png.width) + ci * cw + x) * 4;
        png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = 255;
      }
    });
  });
  return { png, chars: chars.join('') };
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const manifest = { sprites: {}, font: null };
const previews = [];

for (const file of fs.readdirSync(spriteDir).filter((f) => f.endsWith('.json')).sort()) {
  const name = path.basename(file, '.json');
  const sprite = JSON.parse(fs.readFileSync(path.join(spriteDir, file), 'utf8'));
  if (name === 'font') {
    const { png, chars } = renderFont(sprite);
    fs.writeFileSync(path.join(outDir, 'font.png'), PNG.sync.write(png));
    manifest.font = { file: 'font.png', width: sprite.cell[0], height: sprite.cell[1], chars };
    continue;
  }
  const entry = {
    frameWidth: sprite.size[0],
    frameHeight: sprite.size[1],
    frames: sprite.frames.length,
    animations: sprite.animations ?? {},
    tinted: !!sprite.tinted,
    files: {},
  };
  if (sprite.featured) {
    // One sheet per replicant feature color (visor / antenna tip): key <name>.f<lightIndex>
    entry.featured = true;
    // Per-frame anchor = first visor pixel (legend role f0), so headgear overlays can follow the head
    const visorChars = Object.entries(sprite.legend).filter(([, v]) => v === 'f0').map(([k]) => k);
    entry.anchors = sprite.frames.map((rows) => {
      for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) if (visorChars.includes(rows[y][x])) return [x, y];
      return [Math.floor(sprite.size[0] / 2), 0];
    });
    for (const feature of player.featureColors) {
      const png = render(sprite, roleResolver(planets[0], feature), name);
      const variant = `f${feature[1]}`;
      const fname = `${name}.${variant}.png`;
      fs.writeFileSync(path.join(outDir, fname), PNG.sync.write(png));
      entry.files[variant] = fname;
      if (feature[1] === player.feature[1]) previews.push({ name, png });
    }
    manifest.sprites[name] = entry;
    continue;
  }
  const variants = sprite.tinted ? planets : [null];
  for (const planet of variants) {
    const png = render(sprite, roleResolver(planet ?? planets[0]), name);
    const fname = planet ? `${name}.${planet.id}.png` : `${name}.png`;
    fs.writeFileSync(path.join(outDir, fname), PNG.sync.write(png));
    entry.files[planet ? planet.id : '*'] = fname;
    if (!planet || planet === planets[0]) previews.push({ name, png });
  }
  manifest.sprites[name] = entry;
}

fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`sprites: ${Object.keys(manifest.sprites).length} sheets${manifest.font ? ' + font' : ''} -> public/assets/gen`);

if (process.argv.includes('--preview')) {
  // Contact sheet at 4x on a dark background for review in chat.
  const scale = 4, pad = 8;
  const width = Math.max(...previews.map((p) => p.png.width)) * scale + pad * 2;
  const height = previews.reduce((s, p) => s + p.png.height * scale + pad, pad);
  const sheet = new PNG({ width, height });
  const bg = palette[24];
  for (let i = 0; i < sheet.data.length; i += 4) {
    sheet.data[i] = bg[0]; sheet.data[i + 1] = bg[1]; sheet.data[i + 2] = bg[2]; sheet.data[i + 3] = 255;
  }
  let oy = pad;
  for (const { png } of previews) {
    for (let y = 0; y < png.height * scale; y++) {
      for (let x = 0; x < png.width * scale; x++) {
        const si = ((Math.floor(y / scale) * png.width) + Math.floor(x / scale)) * 4;
        if (png.data[si + 3] === 0) continue;
        const di = (((oy + y) * width) + pad + x) * 4;
        sheet.data[di] = png.data[si]; sheet.data[di + 1] = png.data[si + 1];
        sheet.data[di + 2] = png.data[si + 2]; sheet.data[di + 3] = 255;
      }
    }
    oy += png.height * scale + pad;
  }
  fs.mkdirSync(path.join(root, 'screenshots'), { recursive: true });
  fs.writeFileSync(path.join(root, 'screenshots/sprite-sheet.png'), PNG.sync.write(sheet));
  console.log('preview: screenshots/sprite-sheet.png');
}
