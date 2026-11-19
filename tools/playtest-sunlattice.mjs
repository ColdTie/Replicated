// Scripted headless playtest of Ember Gold's Sunlattice (the maker, 2026-11-19 am): the design waits for the Nous Chip;
// without a Sunlattice standing a warren panel cannot be furnished; once one stands a copy furnishes a panel for salt and
// quartz, no Ember, and it counts as a lamp. Also lands on the two new worlds, Brightwater and Lanternfen.
// Usage: npm run build && node tools/playtest-sunlattice.mjs
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const port = 4236;
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
  await page.waitForFunction(() => !!window.__scene?.player && !!window.__scene.warren && window.__scene.npcs.length > 0, null, { timeout: 30000 });
  for (let i = 0; i < 6 && await ev(() => !!window.__scene.dialogue?.open); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }

  // 1. the design waits for the Nous Chip
  const why = await ev(() => window.__scene.buildings.whyNot('sunlattice'));
  log('whyNot', why);
  if (!String(why).includes('NOUS')) fail(`the Sunlattice does not wait for the Nous Chip (${why})`);

  // 2. no Sunlattice: no panel
  const before = await ev(() => {
    const s = window.__scene;
    s.supplies.salt = 6; s.supplies.quartz = 4; s.markSupplies();
    const npc = s.npcs[0];
    const short = s.warren.shortage({ salt: 2, quartz: 1, sunlattice: true });
    const item = s.warren.furnish(npc, { type: 'furnish', item: 'panel', room: 'Entrance' });
    return { short, item: !!item, embers: s.embers, lamps: s.warren.lampCount };
  });
  log('before', JSON.stringify(before));
  if (!String(before.short).includes('Sunlattice') || before.item) fail('a panel was furnished without a Sunlattice standing');

  // 3. a Sunlattice stands: a panel for salt 2 and quartz 1, no Ember, counted as a lamp
  const after = await ev(() => {
    const s = window.__scene;
    s.buildings.list.push({ id: 'sl-test', design: 'sunlattice', name: 'Sunlattice', built: true, by: 'player' });
    const npc = s.npcs[0];
    const salt = s.supplies.salt, quartz = s.supplies.quartz, embers = s.embers;
    const item = s.warren.furnish(npc, { type: 'furnish', item: 'panel', room: 'Entrance' });
    return { item: item?.kind, salt: salt - s.supplies.salt, quartz: quartz - s.supplies.quartz, embers: embers - s.embers, lamps: s.warren.lampCount, stands: s.warren.hasSunlattice };
  });
  log('after', JSON.stringify(after));
  if (!after.stands) fail('the warren does not see the Sunlattice');
  if (after.item !== 'panel') fail('no panel was furnished with a Sunlattice standing');
  if (after.salt !== 2 || after.quartz !== 1 || after.embers !== 0) fail('the panel did not cost salt 2 and quartz 1 and no Ember');
  if (after.lamps !== before.lamps + 1) fail('the panel does not count as a lamp');

  // 4. the two new worlds load and are landed on
  for (const [star, name] of [['gliese-832', 'BRIGHTWATER'], ['gliese-867', 'LANTERNFEN']]) {
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
