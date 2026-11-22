// Scripted headless playtest of the maker's 2026-11-21 pm run: Watcher's Flare Almanac and Tamsin's Tether Beacon
// wait for what they need; a star the almanac knows as restless costs a ship a cell more; a Tether Beacon at either
// end costs a third and fills a landed ship; the almanac comes through the Watchglass; the lens names the temper;
// Sorrel's Rootmere (GLIESE 1276) loads and makes soil. Usage: npm run build && node tools/playtest-almanac.mjs [--shots]
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const port = 4243;
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
  for (const id of ['almanac', 'tether']) {
    const why = await ev((d) => window.__scene.buildings.whyNot(d), id);
    log(id, 'whyNot', why);
    if (!why) fail(`${id} could be printed on a new world`);
  }

  // 2. the cost of a trip to Ross 154 (a late red dwarf: restless)
  const cost = await ev(() => {
    const s = window.__scene, d = s.departure, me = window.__session.replicant, to = 'ross-154';
    const stand = (id) => s.buildings.list.push({ id: `${id}-test`, design: id, name: id, built: true, printStart: Date.now() - 60000, printMs: 1000, by: 'player' });
    const base = d.costTo(to);
    s.archive = [...(s.archive ?? []), { by: 'w', name: 'Watcher', star: 'ROSS 154', ly: 9, text: 'it flares', at: Date.now() - 1000, starId: to, temper: 'restless' }];
    const restless = d.costTo(to);
    s.archive = [];
    s.network = [{ star: to, planet: 1, buildings: [{ design: 'tether', built: true }], archive: [] }];
    const tetherThere = d.costTo(to);
    s.network = [];
    stand('tether');
    const tetherHere = d.costTo(to);
    me.traits.cells = { charge: 10, at: Date.now(), star: s.planet.star };
    const filled = d.tether(), cells = d.charge();
    const again = d.tether();
    // the Watchglass brings another world's almanac
    s.buildings.list.push({ id: 'watchglass-test', design: 'watchglass', name: 'Watchglass', built: true, printStart: Date.now() - 86_400_000, printMs: 1000, by: 'player' });
    s.network = [{ star: 'gliese-12', planet: 1, buildings: [{ design: 'watchglass', built: true, printStart: 0, printMs: 0 }],
      archive: [{ by: 'w', name: 'Watcher', star: 'ROSS 154', ly: 9, text: 'it flares', at: Date.now() - 3_600_000, starId: to, temper: 'restless' }] }];
    const through = s.almanac()[to]?.temper ?? null;
    const lens = s.watch.lensText({ name: 'Watcher', star: 'Ross 154', temper: 'restless' });
    s.network = [];
    s.buildings.list = s.buildings.list.filter((b) => !b.id.endsWith('-test'));
    return { base, restless, tetherThere, tetherHere, filled, cells, again, through, lens };
  });
  log('cost', JSON.stringify(cost));
  if (!(cost.base > 3)) fail(`the trip to Ross 154 costs ${cost.base}`);
  if (cost.restless !== cost.base + 1) fail(`a restless star cost ${cost.restless}, not ${cost.base + 1}`);
  const third = Math.ceil(cost.base * 0.334);
  if (cost.tetherThere !== third) fail(`a tether at the far end cost ${cost.tetherThere}, not ${third}`);
  if (cost.tetherHere !== third) fail(`a tether here cost ${cost.tetherHere}, not ${third}`);
  if (!cost.filled || cost.cells < 99.5) fail(`a tether did not fill the cells (${cost.cells})`);
  if (cost.again) fail('a full ship was charged again');
  if (cost.through !== 'restless') fail('the almanac did not come through the Watchglass');
  if (!/RESTLESS/.test(cost.lens) || !/ROSS 154/.test(cost.lens)) fail(`the lens says ${cost.lens}`);

  await page.close();

  // 3. Rootmere loads, is landed on and makes soil
  const w = await b.newPage({ viewport: { width: 960, height: 540 } });
  w.on('pageerror', (e) => errors.push(`ROOTMERE: ${e}`));
  w.on('console', (m) => { if (m.type() === 'error') errors.push(`ROOTMERE: ${m.text()}`); });
  await w.goto(`http://localhost:${port}/Replicated/?local&shot=1&at=gliese-1276&pi=1&hour=16`);
  await w.waitForFunction(() => !!window.__scene?.player, null, { timeout: 30000 }).catch(() => fail('Rootmere did not load'));
  await w.waitForTimeout(1500);
  const got = await w.evaluate(() => ({ name: window.__scene?.planet?.name, id: window.__scene?.planet?.id }));
  log('landed', JSON.stringify(got));
  if (got.name !== 'ROOTMERE') fail(`landed on ${got.name}, not ROOTMERE`);
  if (shots) await w.screenshot({ path: 'screenshots/rootmere.png' });
  await w.close();
  const { default: supplies } = await import('../src/data/supplies.json', { with: { type: 'json' } });
  if (supplies.signature.byWorld.rootmere !== 'soil') fail('Rootmere does not make soil');

  // 4. the Observatory's lens names the star and its temper (a screenshot)
  if (shots) {
    const o = await b.newPage({ viewport: { width: 960, height: 540 } });
    await o.goto(`http://localhost:${port}/Replicated/?local&shot=1&view=almanac&hour=22`);
    await o.waitForFunction(() => !!window.__scene?.player, null, { timeout: 30000 });
    await o.waitForTimeout(2500);
    await o.screenshot({ path: 'screenshots/almanac-lens.png' });
    await o.close();
  }
} catch (e) {
  fail(String(e));
} finally {
  await b.close();
  try { process.kill(-server.pid); } catch { /* gone */ }
}
if (errors.length) { console.log('ERRORS', errors); process.exit(1); }
console.log('ok');
