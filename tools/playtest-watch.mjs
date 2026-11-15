// Scripted headless playtest of the Observatory's watch (Watcher's wish, the maker 2026-11-15 am; src/entities/Watch.ts,
// src/data/watch.json): no lens without a watch; a copy's traits.watch lights the lens under a finished Observatory's
// dome with its name over it; it goes out when the watch is over; the journal's HERE page shows the archive.
// Usage: npm run build && node tools/playtest-watch.mjs (saves screenshots/watch-*.png)
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const port = 4231;
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
  await page.goto(`http://localhost:${port}/Replicated/?local&hour=22&rain=0`);
  await page.waitForFunction(() => window.__game?.scene.isActive('home') || !!window.__scene?.player, null, { timeout: 30000 });
  if (await ev(() => window.__game.scene.isActive('home'))) { await page.waitForTimeout(1200); await page.mouse.click(480, 294); }
  await page.waitForFunction(() => !!window.__scene?.player && !!window.__scene.watch && window.__scene.npcs.length > 0, null, { timeout: 30000 });
  // close whatever the opening says
  for (let i = 0; i < 6 && await ev(() => !!window.__scene.dialogue?.open); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }

  // 1. a finished Observatory, nobody watching: the lens is dark
  const obs = await ev(() => { const s = window.__scene, o = s.buildings.standNow('observatory'); if (o) { s.player.setPosition(o.x + 24, o.y + 18); s.cameras.main.centerOn(o.x, o.y - 20); } return o ? { x: o.x, y: o.y } : null; });
  if (!obs) fail('no Observatory could be stood');
  await page.waitForTimeout(1500);
  if (await ev(() => window.__scene.watch.active)) fail('the lens is lit with nobody keeping a watch');

  // 2. a copy keeps a watch (what keep_watch writes on its row): the lens is lit, its name over the dome
  const name = await ev(() => {
    const n = window.__scene.npcs[0], now = Date.now();
    n.data.traits.watch = { star: 'GLIESE 12', ly: 40.1, at: now, until: now + 3 * 3_600_000 };
    return n.data.name;
  });
  await page.waitForFunction(() => window.__scene.watch.active, null, { timeout: 10000 }).catch(() => fail('a copy\'s watch does not light the lens'));
  await page.waitForTimeout(1500);
  const lit = await ev(() => { const w = window.__scene.watch; return { who: w.watcher()?.name, label: w.shown?.label.text, alpha: w.shown?.label.alpha ?? 0, glow: w.shown?.glow.alpha ?? 0 }; });
  log('lit', JSON.stringify(lit));
  if (lit.who !== name || lit.label !== name.toUpperCase()) fail('the lens does not name its watcher');
  if (lit.alpha < 0.3) fail('the watcher\'s name does not show when you stand near');
  if (lit.glow <= 0) fail('the quartz does not glow at night');
  await page.screenshot({ path: 'screenshots/watch-lit.png' });

  // 3. the watch is over: the lens goes dark
  await ev(() => { window.__scene.npcs[0].data.traits.watch.until = Date.now() - 1; });
  await page.waitForFunction(() => !window.__scene.watch.active, null, { timeout: 10000 }).catch(() => fail('the lens stays lit after the watch'));

  // 4. the archive on the journal's HERE page
  await ev(async () => {
    const s = window.__scene;
    s.archive = [{ by: s.npcs[0].data.id, name: s.npcs[0].data.name, star: 'GLIESE 12', ly: 40.1, text: 'A red point, steady; the salt world turns under it.', at: Date.now() - 600_000 }];
    await s.toggleJournal();
  });
  await page.waitForTimeout(400);
  await page.click('[data-tab="here"]');
  const here = await ev(() => document.querySelector('.jn [data-page="here"]')?.textContent ?? '');
  if (!here.includes('THE ARCHIVE') || !here.includes('watched GLIESE 12, 40 ly') || !here.includes('A red point')) fail('the journal does not show the archive');
  await page.screenshot({ path: 'screenshots/watch-archive.png' });
} catch (e) {
  fail(String(e));
} finally {
  await b.close();
  try { process.kill(-server.pid); } catch { /* gone */ }
}
const real = errors.filter((e) => !/favicon|AudioContext/.test(e));
if (real.length) { console.log('errors:', real); process.exit(1); }
console.log('ok');
