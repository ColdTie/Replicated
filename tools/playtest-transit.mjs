// Scripted headless playtest of the maker's 2026-11-23 pm run: Watcher's Transit Lens waits for the Observatory and
// the Nous Chip; a watch with a transit in the archive shows it on the journal's HERE page, with WORLDS WAITING (the
// first find at each star, never a star that already holds a hand-made world); Ember Gold's Lanternmere (TAU CETI e)
// and Vigil's Saltglint (GLIESE 867 c) load and make lanternglass and saltglass.
// Usage: npm run build && node tools/playtest-transit.mjs [--shots]
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const port = 4271;
const shots = process.argv.includes('--shots');
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

  // 1. the Transit Lens waits for the Observatory and the Nous Chip
  const why = await ev(() => window.__scene.buildings.whyNot('transitlens'));
  log('transitlens whyNot', why);
  if (!why) fail('the Transit Lens could be printed on a new world');

  // 2. transits in the archive: the journal's HERE page, and WORLDS WAITING (first find only; Tau Ceti holds a made world)
  await ev(() => {
    const t = Date.now();
    window.__scene.archive = [
      { by: 'w', name: 'Watcher', star: 'ROSS 154', ly: 9.7, text: 'A long steady watch.', at: t - 7_200_000, starId: 'ross-154', transit: { size: 'middling', days: 41 } },
      { by: 's', name: 'Sorrel', star: 'ROSS 154', ly: 9.7, text: 'The same dimming again.', at: t - 3_600_000, starId: 'ross-154', transit: { size: 'middling', days: 41 } },
      { by: 'v', name: 'Vigil', star: 'TAU CETI', ly: 11.9, text: 'A world crossing.', at: t - 60_000, starId: 'tau-ceti', transit: { size: 'middling', days: 20 } },
    ];
  });
  await page.keyboard.press('Tab');
  await page.waitForTimeout(600);
  await ev(() => [...document.querySelectorAll('button, [data-tab]')].find((e) => /HERE/.test(e.textContent ?? ''))?.click());
  await page.waitForTimeout(300);
  const text = await ev(() => document.body.innerText);
  if (!/TRANSIT: a middling world, a year of 41 days/.test(text)) fail('the archive does not show the transit');
  const waits = text.split('WORLDS WAITING')[1] ?? '';
  log('waiting', waits.slice(0, 200).replace(/\n/g, ' | '));
  if (!waits) fail('no WORLDS WAITING on the HERE page');
  if (!/ROSS 154: TRANSIT: a middling world, a year of 41 days, found by Watcher/.test(waits)) fail('Ross 154 is not waiting, found by Watcher');
  if (/found by Sorrel/.test(waits)) fail('a second find was listed');
  if (/TAU CETI:/.test(waits)) fail('Tau Ceti waits though Lanternmere is made there');
  if (shots) await page.screenshot({ path: 'screenshots/transit-journal.png' });
  await page.keyboard.press('Escape');
  await page.close();

  // 3. the two new worlds load and are landed on
  const worlds = [
    { star: 'tau-ceti', pi: 3, name: 'LANTERNMERE', id: 'lanternmere', material: 'lanternglass', hour: 19 },
    { star: 'gliese-867', pi: 2, name: 'SALTGLINT', id: 'saltglint', material: 'saltglass', hour: 13 },
  ];
  for (const w of worlds) {
    const p = await b.newPage({ viewport: { width: 960, height: 540 } });
    p.on('pageerror', (e) => errors.push(`${w.name}: ${e}`));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(`${w.name}: ${m.text()}`); });
    await p.goto(`http://localhost:${port}/Replicated/?local&shot=1&at=${w.star}&pi=${w.pi}&hour=${w.hour}`);
    const up = await p.waitForFunction(() => !!window.__scene?.player, null, { timeout: 30000 }).then(() => true, () => false);
    if (!up) { fail(`${w.name} did not load`); await p.close(); continue; }
    await p.waitForTimeout(1500);
    const got = await p.evaluate(() => ({ name: window.__scene?.planet?.name, id: window.__scene?.planet?.id, dayCycle: window.__scene?.planet?.dayCycle }));
    log(w.name, JSON.stringify(got));
    if (got.name !== w.name) fail(`landed on ${got.name}, not ${w.name}`);
    if (!got.dayCycle) fail(`${w.name} keeps a fixed light`);
    if (shots) await p.screenshot({ path: `screenshots/${w.id}.png` });
    await p.close();
  }
  const { default: supplies } = await import('../src/data/supplies.json', { with: { type: 'json' } });
  for (const w of worlds) {
    if (supplies.signature.byWorld[w.id] !== w.material) fail(`${w.id} makes ${supplies.signature.byWorld[w.id]}, not ${w.material}`);
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
