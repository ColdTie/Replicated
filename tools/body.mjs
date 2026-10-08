// Start a new body for a replicant: copies a humanoid sprite source (default: replicant.json, 16x20, same frames,
// animations and legend) to tools/sprites/<slug>.json and registers it as a model in src/data/player.json.
// Then edit the pixels in the new JSON (keep the legend roles: V/v = visor (feature color), b/B body, c/C cape,
// s/S arm, k dark, W white), run `npm run sprites`, and set the replicant's `model` to <slug> in Supabase.
//
// Usage: node tools/body.mjs <slug> [--from replicant] [--headY -9]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith('--'));
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i > 0 ? args[i + 1] : d; };
if (!slug || !/^[a-z][a-z0-9-]{1,30}$/.test(slug)) {
  console.error('usage: node tools/body.mjs <slug> [--from replicant] [--headY -9]   (slug: lowercase letters, digits, dashes)');
  process.exit(1);
}
const from = opt('from', 'replicant');
const src = path.join(root, 'tools/sprites', `${from}.json`);
const dst = path.join(root, 'tools/sprites', `${slug}.json`);
if (!fs.existsSync(src)) { console.error(`no such sprite source: ${src}`); process.exit(1); }
if (fs.existsSync(dst)) { console.error(`${dst} already exists`); process.exit(1); }

const sprite = JSON.parse(fs.readFileSync(src, 'utf8'));
sprite._doc = `Body made for a replicant from ${from}.json. Keep it humanoid and 16x20; legend roles as in replicant.json.`;
fs.writeFileSync(dst, JSON.stringify(sprite, null, 2) + '\n');

const playerPath = path.join(root, 'src/data/player.json');
const player = JSON.parse(fs.readFileSync(playerPath, 'utf8'));
const base = player.models[from] ?? { headY: -9 };
player.models[slug] = { sprite: slug, headY: Number(opt('headY', base.headY)) };
fs.writeFileSync(playerPath, JSON.stringify(player, null, 2) + '\n');
console.log(`wrote tools/sprites/${slug}.json and registered model "${slug}" (headY ${player.models[slug].headY}). Now edit the pixels, then: npm run sprites`);
