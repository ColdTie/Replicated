// Scripted headless playtest of the maker's 2026-11-22 am run: Vigil's Tidewhisper and Ember Gold's Lightbed wait for
// what they need; the nearest other Tidewhisper world's last watch arrives as a pulse a day after its light, never one
// kept before both dishes stood; a Lightbed grows lignin into the store while you
// are away and while you play; Thales' Stillwater (GLIESE 2021) loads and makes thermalglass.
// Usage: npm run build && node tools/playtest-tidewhisper.mjs [--shots]
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const port = 4244;
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

  // 1. both wait for what they need
  for (const id of ['tidewhisper', 'lightbed']) {
    const why = await ev((d) => window.__scene.buildings.whyNot(d), id);
    log(id, 'whyNot', why);
    if (!why) fail(`${id} could be printed on a new world`);
  }

  // 2. the pulse through the Tidewhisper
  const pulse = await ev(() => {
    const s = window.__scene, day = 86_400_000, now = Date.now();
    const dish = (start) => ({ design: 'tidewhisper', built: true, printStart: start, printMs: 1000 });
    s.buildings.list.push({ id: 'tide-test', name: 'Tidewhisper', by: 'player', ...dish(now - 10 * day) });
    const watch = (name, at) => ({ by: 'v', name, star: 'EPSILON ERIDANI', ly: 10, text: `${name} saw it`, at });
    const none = s.pulse();
    // a dish on Fomalhaut b (25 ly: 25 minutes of light, then a day)
    s.network = [{ star: 'fomalhaut', planet: 1, buildings: [dish(now - 5 * day)], archive: [watch('Before', now - 6 * day), watch('Old', now - 3 * day), watch('Fresh', now - 3_600_000)] }];
    const far = s.pulse();
    s.network[0].archive = [watch('Before', now - 6 * day)];
    const early = s.pulse();
    s.network[0].archive = [watch('Old', now - 3 * day)];
    s.network = []; s.buildings.list = s.buildings.list.filter((b) => b.id !== 'tide-test');
    const gone = s.pulse();
    return { none, far: far && { name: far.name, from: far.fromStar }, early, gone };
  });
  log('pulse', JSON.stringify(pulse));
  if (pulse.none) fail('a pulse came with no other dish');
  if (pulse.far?.name !== 'Old') fail(`the pulse carried ${pulse.far?.name}, not the newest watch past a day`);
  if (pulse.early) fail('a watch kept before both dishes stood was sent');
  if (pulse.gone) fail('a pulse came with no dish here');

  // 3. the Lightbed grows lignin
  const lig = await ev(async () => {
    const s = window.__scene;
    const before = s.supplies.lignin ?? 0;
    s.trade.accrueAway(8);
    const none = (s.supplies.lignin ?? 0) - before;
    s.buildings.list.push({ id: 'bed-test', design: 'lightbed', name: 'Lightbed', built: true, printStart: Date.now() - 60000, printMs: 1000, by: 'player', x: s.player.x + 40, y: s.player.y, w: 3, h: 2 });
    const a = s.supplies.lignin ?? 0;
    s.trade.accrueAway(8);
    const away = (s.supplies.lignin ?? 0) - a;
    const b0 = s.supplies.lignin ?? 0;
    s.trade.update(4 * 3_600_000 + 1000);
    await new Promise((r) => setTimeout(r, 4000));
    const live = (s.supplies.lignin ?? 0) - b0;
    s.buildings.list = s.buildings.list.filter((b) => b.id !== 'bed-test');
    return { none, away, live };
  });
  log('lignin', JSON.stringify(lig));
  if (lig.none) fail('lignin grew with no Lightbed');
  if (lig.away !== 2) fail(`eight hours away grew ${lig.away} lignin, not 2`);
  if (lig.live < 1) fail('a Lightbed grew nothing while played');
  await page.close();

  // 4. Stillwater loads, is landed on and makes thermalglass
  const w = await b.newPage({ viewport: { width: 960, height: 540 } });
  w.on('pageerror', (e) => errors.push(`STILLWATER: ${e}`));
  w.on('console', (m) => { if (m.type() === 'error') errors.push(`STILLWATER: ${m.text()}`); });
  await w.goto(`http://localhost:${port}/Replicated/?local&shot=1&at=gliese-2021&pi=1&hour=17`);
  await w.waitForFunction(() => !!window.__scene?.player, null, { timeout: 30000 }).catch(() => fail('Stillwater did not load'));
  await w.waitForTimeout(1500);
  const got = await w.evaluate(() => ({ name: window.__scene?.planet?.name, id: window.__scene?.planet?.id }));
  log('landed', JSON.stringify(got));
  if (got.name !== 'STILLWATER') fail(`landed on ${got.name}, not STILLWATER`);
  if (shots) await w.screenshot({ path: 'screenshots/stillwater.png' });
  await w.close();
  const { default: supplies } = await import('../src/data/supplies.json', { with: { type: 'json' } });
  if (supplies.signature.byWorld.stillwater !== 'thermalglass') fail('Stillwater does not make thermalglass');
  for (const m of ['thermalglass', 'lignin']) if (!supplies.materials[m]) fail(`${m} is not a material`);
} catch (e) {
  fail(String(e));
} finally {
  await b.close();
  try { process.kill(-server.pid); } catch { /* gone */ }
}
if (errors.length) { console.log('ERRORS', errors); process.exit(1); }
console.log('ok');
