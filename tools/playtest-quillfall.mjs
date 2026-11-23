// Scripted headless playtest of the wishes built at Steve's word on 2026-11-23: three hand-made worlds load and are
// landed on (Thales' Quillfall on PHI2 CETI c, Vigil's Murrowfell on GJ 1061 c with its night aurora, Ember Gold's
// Glimmerfield on GLIESE 3039 c, an orbit added past the generated planet), each with its ground and signature material;
// and Tamsin's Cemwright stands in the Cems' tree after the Cem Mind and the Biolab.
// Usage: npm run build && node tools/playtest-quillfall.mjs [--shots]
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const port = 4264;
const shots = process.argv.includes('--shots');
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
for (;;) { try { if ((await fetch(`http://localhost:${port}/Replicated/`)).ok) break; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 200)); }
const errors = [];
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const log = (...a) => console.log(...a);
const fail = (m) => { errors.push(m); log('FAIL', m); };
const worlds = [
  { star: 'phi2-ceti', pi: 2, name: 'QUILLFALL', id: 'quillfall', material: 'quillglass', hour: 17 },
  { star: 'gj-1061', pi: 2, name: 'MURROWFELL', id: 'murrowfell', material: 'bellstone', hour: 23, aurora: true },
  { star: 'gliese-3039', pi: 2, name: 'GLIMMERFIELD', id: 'glimmerfield', material: 'shellgrit', hour: 16, wild: true },
];
try {
  for (const w of worlds) {
    const page = await b.newPage({ viewport: { width: 960, height: 540 } });
    page.on('pageerror', (e) => errors.push(`${w.name}: ${e}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${w.name}: ${m.text()}`); });
    await page.goto(`http://localhost:${port}/Replicated/?local&shot=1&at=${w.star}&pi=${w.pi}&hour=${w.hour}&rain=0`);
    const up = await page.waitForFunction(() => !!window.__scene?.player, null, { timeout: 30000 }).then(() => true, () => false);
    if (!up) { fail(`${w.name} did not load`); await page.close(); continue; }
    await page.waitForTimeout(1500);
    const got = await page.evaluate(() => {
      const s = window.__scene;
      const aurora = s.env?.aurora;
      return { name: s.planet?.name, aurora: aurora ? aurora.alpha : null, wild: s.children.list.length };
    });
    log(w.name, JSON.stringify(got));
    if (got.name !== w.name) fail(`landed on ${got.name}, not ${w.name}`);
    if (w.aurora && !(got.aurora > 0.2)) fail(`${w.name}: no aurora at night (${got.aurora})`);
    if (!w.aurora && got.aurora !== null) fail(`${w.name} has an aurora`);
    if (shots) await page.screenshot({ path: `screenshots/${w.id}.png` });
    await page.close();
  }
  const { default: supplies } = await import('../src/data/supplies.json', { with: { type: 'json' } });
  for (const w of worlds) {
    const m = supplies.signature.byWorld[w.id];
    if (m !== w.material) fail(`${w.id} makes ${m}, not ${w.material}`);
    if (!supplies.materials[w.material]) fail(`${w.material} is not a material`);
  }
  const { default: designs } = await import('../src/data/designs.json', { with: { type: 'json' } });
  const cw = designs.designs.find((d) => d.id === 'cemwright');
  if (!cw) fail('no Cemwright design');
  else if (!['cemmind', 'biolab'].every((n) => cw.needs.includes(n))) fail(`Cemwright needs ${cw.needs}`);
  const { default: mind } = await import('../src/data/mind.json', { with: { type: 'json' } });
  if (!mind.day.cemwright?.kinds?.includes('plan')) fail('mind.json day.cemwright missing');
} catch (e) {
  fail(String(e));
} finally {
  await b.close();
  try { process.kill(-server.pid); } catch { /* gone */ }
}
if (errors.length) { console.log('ERRORS', errors); process.exit(1); }
console.log('ok');
