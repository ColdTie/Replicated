// Scripted headless playtest of the maker's 2026-11-22 pm run: two hand-made worlds load and are landed on
// (Watcher's Dimfall on WOLF 359, Sorrel's Thawmere on GLIESE 884 d), each with its own ground and its
// signature material (aurite, vantaglass); Dimfall keeps one fixed dusk light, Thawmere follows the clock.
// Usage: npm run build && node tools/playtest-dimfall.mjs [--shots]
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const port = 4263;
const shots = process.argv.includes('--shots');
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
for (;;) { try { if ((await fetch(`http://localhost:${port}/Replicated/`)).ok) break; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 200)); }
const errors = [];
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const log = (...a) => console.log(...a);
const fail = (m) => { errors.push(m); log('FAIL', m); };
const worlds = [
  { star: 'wolf-359', pi: 1, name: 'DIMFALL', id: 'dimfall', material: 'aurite', shot: 'dimfall', fixed: true },
  { star: 'gliese-884', pi: 3, name: 'THAWMERE', id: 'thawmere', material: 'vantaglass', shot: 'thawmere' },
];
try {
  for (const w of worlds) {
    const page = await b.newPage({ viewport: { width: 960, height: 540 } });
    page.on('pageerror', (e) => errors.push(`${w.name}: ${e}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${w.name}: ${m.text()}`); });
    await page.goto(`http://localhost:${port}/Replicated/?local&shot=1&at=${w.star}&pi=${w.pi}&hour=20`);
    const up = await page.waitForFunction(() => !!window.__scene?.player, null, { timeout: 30000 }).then(() => true, () => false);
    if (!up) { fail(`${w.name} did not load`); await page.close(); continue; }
    await page.waitForTimeout(1500);
    const got = await page.evaluate(() => ({ name: window.__scene?.planet?.name, id: window.__scene?.planet?.id, dayCycle: window.__scene?.planet?.dayCycle }));
    log(w.name, JSON.stringify(got));
    if (got.name !== w.name) fail(`landed on ${got.name}, not ${w.name}`);
    if (w.fixed && got.dayCycle) fail(`${w.name} follows the clock`);
    if (!w.fixed && !got.dayCycle) fail(`${w.name} keeps a fixed light`);
    if (shots) await page.screenshot({ path: `screenshots/${w.shot}.png` });
    await page.close();
  }
  const { default: supplies } = await import('../src/data/supplies.json', { with: { type: 'json' } });
  for (const w of worlds) {
    const m = supplies.signature.byWorld[w.id];
    if (m !== w.material) fail(`${w.id} makes ${m}, not ${w.material}`);
    if (!supplies.materials[w.material]) fail(`${w.material} is not a material`);
  }
} catch (e) {
  fail(String(e));
} finally {
  await b.close();
  try { process.kill(-server.pid); } catch { /* gone */ }
}
if (errors.length) { console.log('ERRORS', errors); process.exit(1); }
console.log('ok');
