// Scripted headless playtest of the maker's 2026-11-24 pm run: Vigil's Wayhollow, Watcher's Orrery and Ember Gold's
// Lightkeep wait for what they need; a Wayhollow here and at another star charts the road between them once (and a
// world without one charts nothing); the Orrery keeps each found world's year and next crossing, on the journal's HERE
// page with ON TIME marks; the Lightkeep presses lignin into kept light up to its hold, and a ship short of full spends
// it, a block for 5 cells. Usage: npm run build && node tools/playtest-wayhollow.mjs [--shots]
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const port = 4278;
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

  // 1. all three wait for what they need
  for (const id of ['wayhollow', 'orrery', 'lightkeep']) {
    const why = await ev((d) => window.__scene.buildings.whyNot(d), id);
    log(id, 'whyNot', why);
    if (!why) fail(`${id} could be printed on a new world`);
  }

  // 2. the Wayhollow: no road without one here; then a road to the other Wayhollow star, once
  const roads = await ev(async () => {
    const s = window.__scene, far = 'tau-ceti';
    s.network = [{ star: far, planet: 3, buildings: [{ design: 'wayhollow', built: true }], archive: [] }];
    const none = await s.chartWayhollows();
    s.buildings.list.push({ id: 'wayhollow-test', design: 'wayhollow', name: 'Wayhollow', built: true, printStart: Date.now() - 60000, printMs: 1000, by: 'player' });
    const before = s.departure.costTo(far);
    const first = await s.chartWayhollows();
    const again = await s.chartWayhollows();
    const after = s.departure.costTo(far);
    s.network = [];
    return { none, first, again, before, after };
  });
  log('roads', JSON.stringify(roads));
  if (roads.none.length) fail('a world without a Wayhollow charted a road');
  if (roads.first.join() !== 'tau-ceti') fail(`the Wayhollow charted ${roads.first.join()}, not tau-ceti`);
  if (roads.again.length) fail('the road was charted twice');
  if (!(roads.after < roads.before)) fail(`the charted road costs ${roads.after}, as much as ${roads.before}`);

  // 3. the Lightkeep: lignin pressed into kept light up to its hold; a ship spends it
  const keep = await ev(() => {
    const s = window.__scene, d = s.departure, me = window.__session.replicant;
    s.supplies.lignin = 20; s.supplies.lightlignin = 0;
    const without = s.trade.keep(5);
    s.buildings.list.push({ id: 'lightkeep-test', design: 'lightkeep', name: 'Lightkeep', built: true, printStart: Date.now() - 60000, printMs: 1000, by: 'player' });
    const pressed = s.trade.keep(5), afterLignin = s.supplies.lignin;
    s.supplies.lignin = 40;
    const capped = s.trade.keep(40), held = s.supplies.lightlignin;
    s.trade.accrueAway(100);
    const stillHeld = s.supplies.lightlignin;
    me.traits.cells = { charge: 80, at: Date.now(), star: s.planet.star };
    const spent = d.keptLight(), cells = d.charge(), left = s.supplies.lightlignin;
    const full = d.keptLight();
    return { without, pressed, afterLignin, capped, held, stillHeld, spent, cells, left, full };
  });
  log('keep', JSON.stringify(keep));
  if (keep.without) fail('lignin was pressed without a Lightkeep');
  if (keep.pressed !== 5 || keep.afterLignin !== 15) fail(`pressed ${keep.pressed}, lignin left ${keep.afterLignin}`);
  if (keep.held !== 12) fail(`a Lightkeep holds ${keep.held}, not 12`);
  if (keep.stillHeld !== 12) fail(`the away hours pressed past the hold (${keep.stillHeld})`);
  if (keep.spent !== 4 || keep.cells < 99.5 || keep.left !== 8) fail(`the ship spent ${keep.spent} for ${keep.cells} cells, ${keep.left} left`);
  if (keep.full) fail('a full ship spent kept light');

  // 4. the Orrery: each found world once, with its year and next crossing, and ON TIME in the archive
  const orr = await ev(() => {
    const s = window.__scene, t = Date.now();
    s.archive = [
      { by: 'w', name: 'Watcher', star: 'ROSS 154', ly: 9.7, text: 'A long steady watch.', at: t - 7_200_000, starId: 'ross-154', transit: { size: 'middling', days: 6 } },
      { by: 's', name: 'Sorrel', star: 'ROSS 154', ly: 9.7, text: 'The same dimming again.', at: t - 3_600_000, starId: 'ross-154', transit: { size: 'middling', days: 6 }, orbit: true },
      { by: 'v', name: 'Vigil', star: 'WOLF 359', ly: 7.9, text: 'A slow world.', at: t - 60_000, starId: 'wolf-359', transit: { size: 'small', days: 210 } },
    ];
    const none = s.orrery().length;
    s.buildings.list.push({ id: 'orrery-test', design: 'orrery', name: 'Orrery', built: true, printStart: Date.now() - 60000, printMs: 1000, by: 'player' });
    return { none, kept: s.orrery() };
  });
  log('orrery', JSON.stringify(orr.kept.map((w) => [w.star, w.days, w.pace, w.seen, w.confirmed, Math.round((w.next - Date.now()) / 3_600_000)])));
  if (orr.none) fail('the Orrery kept worlds without standing');
  const ross = orr.kept.find((w) => w.starId === 'ross-154'), wolf = orr.kept.find((w) => w.starId === 'wolf-359');
  if (orr.kept.length !== 2 || !ross || !wolf) fail('the Orrery does not keep each found world once');
  else {
    if (ross.seen !== 2 || ross.confirmed !== 1 || ross.by !== 'Watcher' || ross.pace !== 'quick') fail(`Ross 154 kept as ${JSON.stringify(ross)}`);
    if (wolf.pace !== 'long') fail('a year of 210 days is not long');
    const now = Date.now();
    for (const w of [ross, wolf]) if (!(w.next > now && w.next <= now + w.days * 86_400_000)) fail(`${w.star}'s next crossing is not within its year`);
  }
  await page.keyboard.press('Tab');
  await page.waitForTimeout(600);
  await ev(() => [...document.querySelectorAll('button, [data-tab]')].find((e) => /HERE/.test(e.textContent ?? ''))?.click());
  await page.waitForTimeout(300);
  const text = await ev(() => document.body.innerText);
  const orrery = text.split('THE ORRERY')[1] ?? '';
  log('journal', orrery.slice(0, 260).replace(/\n/g, ' | '));
  if (!orrery) fail('no THE ORRERY on the HERE page');
  if (!/ROSS 154: a middling world, a year of 6 days \(quick\)\. Next crossing/.test(orrery)) fail('Ross 154 is not in the Orrery');
  if (!/Seen 2 times, 1 on time; found by Watcher/.test(orrery)) fail('the Orrery does not count the watches');
  if (!/ON TIME/.test(text)) fail('the archive does not mark the crossing on time');
  if (shots) await page.screenshot({ path: 'screenshots/orrery-journal.png' });
  await page.keyboard.press('Escape');
  await page.close();
} catch (e) {
  fail(String(e));
} finally {
  await b.close();
  try { process.kill(-server.pid); } catch { /* gone */ }
}
if (errors.length) { console.log('ERRORS', errors); process.exit(1); }
console.log('ok');
