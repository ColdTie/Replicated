// Scripted headless playtest (the maker, 2026-11-20 am): Sorrel's Mycelial Loom waits for the Nous Chip and the
// Biolab; the memories left in it (planet_states.data.loom, written by a day's leave_memory) show on the journal's
// HERE page as THE LOOM. Also lands on Sillbrook (PHI2 CETI) and Sporeveil (GLIESE 3039).
// Usage: npm run build && node tools/playtest-loom.mjs
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const port = 4239;
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
for (;;) { try { if ((await fetch(`http://localhost:${port}/Replicated/`)).ok) break; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 200)); }
const errors = [];
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const log = (...a) => console.log(...a);
const fail = (m) => { errors.push(m); log('FAIL', m); };
try {
  const page = await b.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const ev = (f, arg) => page.evaluate(f, arg);
  await page.goto(`http://localhost:${port}/Replicated/?local&hour=13&rain=0`);
  await page.waitForFunction(() => window.__game?.scene.isActive('home') || !!window.__scene?.player, null, { timeout: 30000 });
  if (await ev(() => window.__game.scene.isActive('home'))) { await page.waitForTimeout(1200); await page.mouse.click(480, 294); }
  await page.waitForFunction(() => !!window.__scene?.player && !!window.__scene.buildings, null, { timeout: 30000 });
  for (let i = 0; i < 6 && await ev(() => !!window.__scene.dialogue?.open); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }

  // 1. the Loom waits for the Nous Chip (and the Biolab)
  const why = await ev(() => window.__scene.buildings.whyNot('loom'));
  log('loom whyNot', why);
  if (!/NOUS|BIOLAB/.test(String(why))) fail(`the Loom does not wait for the Nous Chip or the Biolab (${why})`);

  // 2. its memories on the journal's HERE page
  await ev(() => { window.__scene.loom = [{ by: 's', name: 'Sorrel', text: 'The shadow of the lookout crossed the square while we talked.', at: Date.now() - 60000 }]; });
  await page.keyboard.press('Tab');
  await page.waitForTimeout(600);
  await ev(() => [...document.querySelectorAll('button, [data-tab]')].find((e) => /HERE/.test(e.textContent ?? ''))?.click());
  await page.waitForTimeout(300);
  const text = await ev(() => document.body.innerText);
  if (!/THE LOOM/.test(text) || !/shadow of the lookout/.test(text)) fail('the journal does not show the Loom and its memory');
  await page.keyboard.press('Escape');

  // 3. the two new worlds load and are landed on
  for (const [star, name] of [['phi2-ceti', 'SILLBROOK'], ['gliese-3039', 'SPOREVEIL']]) {
    const w = await b.newPage({ viewport: { width: 960, height: 540 } });
    w.on('pageerror', (e) => errors.push(`${name}: ${e}`));
    await w.goto(`http://localhost:${port}/Replicated/?local&shot=1&at=${star}&pi=1`);
    await w.waitForFunction(() => !!window.__scene?.player, null, { timeout: 30000 }).catch(() => fail(`${name} did not load`));
    const got = await w.evaluate(() => window.__scene?.planet?.name);
    log('landed', got);
    if (got !== name) fail(`landed on ${got}, not ${name}`);
    await w.close();
  }
} catch (e) {
  fail(String(e));
} finally {
  await b.close();
  try { process.kill(-server.pid); } catch { /* gone */ }
}
if (errors.length) { console.log('ERRORS', errors); process.exit(1); }
console.log('ok');
