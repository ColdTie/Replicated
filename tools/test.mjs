// The game's tests: the mind tool check, then every scripted headless playtest, one after another (each starts its
// own `vite preview` on its own port). Needs a build first: `npm run build && npm test`. CI runs it on every PR
// (.github/workflows/test.yml). `node tools/test.mjs talk town` runs only the playtests whose names contain those words.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const only = process.argv.slice(2);
const steps = [['mind tools', 'tools/check-mind-tools.mjs']];
for (const f of fs.readdirSync('tools').filter((f) => /^playtest(-[a-z]+)?\.mjs$/.test(f)).sort())
  steps.push([f.replace(/\.mjs$/, ''), `tools/${f}`]);
if (!fs.existsSync('dist/index.html')) { console.error('no build: run `npm run build` first'); process.exit(1); }

const results = [];
for (const [name, file] of steps) {
  if (only.length && name !== 'mind tools' && !only.some((w) => name.includes(w))) continue;
  const t = Date.now();
  const r = spawnSync('node', [file], { encoding: 'utf8', maxBuffer: 64 << 20, timeout: 5 * 60_000 });
  const ok = r.status === 0;
  results.push({ name, ok, s: Math.round((Date.now() - t) / 1000) });
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name}  ${results.at(-1).s}s`);
  if (!ok) console.log(((r.stdout ?? '') + (r.stderr ?? '')).split('\n').slice(-40).join('\n'));
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} passed${failed.length ? `; failed: ${failed.map((r) => r.name).join(', ')}` : ''}`);
process.exit(failed.length ? 1 : 0);
