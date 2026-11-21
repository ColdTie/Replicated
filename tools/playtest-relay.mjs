// Scripted headless playtest of the maker's 2026-11-20 pm run: Tamsin's Relay Cairn and Watcher's Seedarc wait for
// what they need; a letter from LHS 1140 to Gliese 12 takes the light's time until a chain of lit cairns (each hop at
// most mind.json relay.hopLy) joins them, then it hops along it, and a broken chain gives the light's time back; a
// ship leaving a world where a Seedarc stands carries seed for the next world's store, and none without one. Also lands
// on Hushfen. Usage: npm run build && node tools/playtest-relay.mjs
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const port = 4241;
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
  for (const id of ['cairn', 'seedarc']) {
    const why = await ev((d) => window.__scene.buildings.whyNot(d), id);
    log(id, 'whyNot', why);
    if (!why) fail(`${id} could be printed on a new world`);
  }

  // 2. letters hop along a chain of cairns: LHS 1140 -> Gliese 1012 -> Gliese 3079 -> Gliese 12 (each under 15 ly)
  const letters = await ev(() => {
    const s = window.__scene, star = s.planet.star, far = 'gliese-12';
    const cairn = (st) => ({ star: st, planet: 1, buildings: [{ design: 'cairn', built: true }], archive: [] });
    const light = s.mailTo(far);
    s.network = [cairn('gliese-1012'), cairn('gliese-3079'), cairn(far)];
    const noneHere = s.mailTo(far);
    s.buildings.list.push({ id: 'cairn-test', design: 'cairn', name: 'Relay Cairn', built: true, printStart: Date.now() - 60000, printMs: 1000, by: 'player' });
    const chain = s.mailTo(far);
    s.network = [cairn('gliese-1012'), cairn(far)];
    const broken = s.mailTo(far);
    return { star, light, noneHere, chain, broken };
  });
  log('letters', JSON.stringify(letters));
  if (letters.star !== 'lhs-1140') fail(`the test expects to start on LHS 1140, not ${letters.star}`);
  if (!(letters.light > 60)) fail('a letter to Gliese 12 took no time before any cairn');
  if (letters.noneHere !== letters.light) fail('cairns elsewhere changed a letter from a world without one');
  if (letters.chain !== 15) fail(`a letter along three hops took ${letters.chain} s, not 15`);
  if (letters.broken !== letters.light) fail('a broken chain still carried the letter');

  // 3. the Seedarc: seed goes aboard only where one stands
  const seed = await ev(() => {
    const s = window.__scene, me = window.__session.replicant;
    s.buildings.list = s.buildings.list.filter((b) => b.id !== 'cairn-test');
    s.supplies.seed = 5; me.traits.goods = null;
    s.trade.loadGoods('gliese-12', 1);
    const without = { goods: me.traits.goods?.items?.seed ?? 0, store: s.supplies.seed };
    me.traits.goods = null;
    s.buildings.list.push({ id: 'seedarc-test', design: 'seedarc', name: 'Seedarc', built: true, printStart: Date.now() - 60000, printMs: 1000, by: 'player' });
    s.trade.loadGoods('gliese-12', 1);
    const withArc = { goods: me.traits.goods?.items?.seed ?? 0, store: s.supplies.seed, to: me.traits.goods?.to };
    return { without, withArc };
  });
  log('seed', JSON.stringify(seed));
  if (seed.without.goods !== 0 || seed.without.store !== 5) fail('seed went aboard without a Seedarc');
  if (seed.withArc.goods !== 2 || seed.withArc.store !== 3) fail('a Seedarc did not put 2 seed aboard from the store');

  // 4. Hushfen loads and is landed on
  const w = await b.newPage({ viewport: { width: 960, height: 540 } });
  w.on('pageerror', (e) => errors.push(`HUSHFEN: ${e}`));
  await w.goto(`http://localhost:${port}/Replicated/?local&shot=1&at=gliese-915&pi=1`);
  await w.waitForFunction(() => !!window.__scene?.player, null, { timeout: 30000 }).catch(() => fail('Hushfen did not load'));
  const got = await w.evaluate(() => window.__scene?.planet?.name);
  log('landed', got);
  if (got !== 'HUSHFEN') fail(`landed on ${got}, not HUSHFEN`);
  await w.close();
} catch (e) {
  fail(String(e));
} finally {
  await b.close();
  try { process.kill(-server.pid); } catch { /* gone */ }
}
if (errors.length) { console.log('ERRORS', errors); process.exit(1); }
console.log('ok');
