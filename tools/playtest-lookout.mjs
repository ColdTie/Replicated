// Scripted headless playtest of the ridge lookout (Vigil's wish, the maker 2026-11-16 am; mind.json day.lookout,
// src/entities/Watch.ts, src/data/watch.json ridge): a lookout a day of life began while nobody played (no lot yet)
// takes a lot of the town on the next load, keeps it across another load, carries a sign with the world's star until
// a watch is kept there, then the star watched and the watcher's name; a watch from the lookout never lights the
// Observatory's lens.
// Usage: npm run build && node tools/playtest-lookout.mjs (saves screenshots/lookout-sign.png)
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const port = 4233;
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
  const start = async () => {
    await page.waitForFunction(() => window.__game?.scene.isActive('home') || !!window.__scene?.player, null, { timeout: 30000 });
    if (await ev(() => window.__game.scene.isActive('home'))) { await page.waitForTimeout(1200); await page.mouse.click(480, 294); }
    await page.waitForFunction(() => !!window.__scene?.player && !!window.__scene.watch && window.__scene.npcs.length > 0, null, { timeout: 30000 });
    for (let i = 0; i < 6 && await ev(() => !!window.__scene.dialogue?.open); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
  };
  await page.goto(`http://localhost:${port}/Replicated/?local&hour=22&rain=0`);
  await start();

  // 1. what the day run writes: a built ridge lookout with no lot yet (x, y 0, unplaced)
  const by = await ev(async () => {
    const s = window.__scene, n = s.npcs[0];
    const r = { id: 'rtest', name: 'Ridge Lookout', purpose: 'An open lookout.', w: 2, h: 2, x: 0, y: 0, by: n.data.id, material: 'stone', roof: 'flat', door: 'south',
      primary: 'sand', secondary: 'slate', approved: true, progress: 12, built: true, helpers: [n.data.id], cost: { stone: 4 }, paid: true, at: Date.now(), kind: 'ridge', unplaced: true };
    s.pending.buildings = [...s.buildings.list, r];
    await s.flushPlanet();
    return n.data.name;
  });
  await page.reload();
  await start();
  await page.waitForTimeout(1500);
  const placed = await ev(() => { const s = window.__scene, r = s.buildings.list.find((x) => x.id === 'rtest'); return r ? { x: r.x, y: r.y, unplaced: !!r.unplaced, lot: s.townState.civic.rtest } : null; });
  log('placed', JSON.stringify(placed));
  if (!placed) fail('the lookout is gone after the load');
  else if (placed.unplaced || placed.lot === undefined || !placed.x || !placed.y) fail('the lookout did not take a lot of the town');

  // 2. a second load keeps it where it stands
  await page.waitForTimeout(4500);
  await page.reload();
  await start();
  await page.waitForTimeout(1200);
  const again = await ev(() => { const r = window.__scene.buildings.list.filter((x) => x.kind === 'ridge'); return r.map((x) => ({ x: x.x, y: x.y, lot: window.__scene.townState.civic[x.id] })); });
  if (again.length !== 1 || again[0].x !== placed?.x || again[0].lot !== placed?.lot) fail(`the lookout moved or doubled on the next load: ${JSON.stringify(again)}`);

  // 3. the sign: the world's own star until a watch is kept there
  const star = await ev(() => { const s = window.__scene, r = s.buildings.list.find((x) => x.kind === 'ridge'); s.player.setPosition(r.x + 20, r.y + 14); s.cameras.main.centerOn(r.x, r.y - 16); return s.watch.signText(); });
  log('sign', JSON.stringify(star));
  if (!star) fail('the lookout has no sign');
  await page.waitForTimeout(1600);
  if ((await ev(() => window.__scene.watch.sign?.label.alpha ?? 0)) < 0.3) fail('the sign does not show when you stand near');

  // 4. a watch from the lookout (what keep_watch writes): the star watched and the watcher's name; no Observatory lens
  await ev((who) => {
    const s = window.__scene, r = s.buildings.list.find((x) => x.kind === 'ridge'), n = s.npcs[0], now = Date.now();
    r.watching = 'FOMALHAUT'; r.watchedBy = who;
    n.data.traits.watch = { star: 'FOMALHAUT', ly: 0, at: now, until: now + 3 * 3_600_000, from: 'lookout' };
  }, by);
  await page.waitForTimeout(1600);
  const signed = await ev(() => window.__scene.watch.sign?.label.text ?? '');
  log('signed', JSON.stringify(signed));
  if (!signed.startsWith('FOMALHAUT') || !signed.includes(`${by.toUpperCase()} WATCHES`)) fail('the sign does not name the star and its watcher');
  if (await ev(() => window.__scene.watch.watcher() !== null)) fail('a watch from the lookout counts as the Observatory\'s');
  await page.screenshot({ path: 'screenshots/lookout-sign.png' });
} catch (e) {
  fail(String(e));
} finally {
  await b.close();
  try { process.kill(-server.pid); } catch { /* gone */ }
}
const real = errors.filter((e) => !/favicon|AudioContext/.test(e));
if (real.length) { console.log('errors:', real); process.exit(1); }
console.log('ok');
