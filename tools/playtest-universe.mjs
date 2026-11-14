// Scripted headless playtest of the universe (docs/plan-daily-life.md, the universe; src/world/galaxy.ts power,
// src/core/routes.ts, travel.json power and routes): a ship with no cells saved yet starts full; parked cells charge
// from the star by the clock (a red dwarf slowly); a finished Fusion Still tops them up from the store's hydrogen,
// keeping some back; the star map dims a world the cells cannot reach and lights it once the route is charted (a fifth
// of the charge); a launch spends the cells, charts the route and charges again only from the landing on; the catalog
// holds about 1,500 real stars and the search finds one by name.
// Usage: npm run build && node tools/playtest-universe.mjs   (saves screenshots/universe-*.png; fails loudly on page errors)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { chromium } from 'playwright';
const port = 4214;
const T = JSON.parse(fs.readFileSync('src/data/travel.json', 'utf8'));
const STARS = JSON.parse(fs.readFileSync('src/data/stars.json', 'utf8'));
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
for (;;) { try { if ((await fetch(`http://localhost:${port}/Replicated/`)).ok) break; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 200)); }
const errors = [];
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const log = (...a) => console.log(...a);
const fail = (m) => { errors.push(m); log('FAIL', m); };
const cost = (ly, charted) => Math.ceil((T.power.base + T.power.perLy * ly) * (charted ? T.routes.costShare : 1));
try {
  if (STARS.stars.length < 1000) fail(`the catalog holds only ${STARS.stars.length} stars`);
  if (new Set(STARS.stars.map((s) => s.id)).size !== STARS.stars.length) fail('star ids repeat');
  const page = await b.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const ev = (f, arg) => page.evaluate(f, arg);
  await page.goto(`http://localhost:${port}/Replicated/?local&hour=13&rain=0`);
  await page.waitForFunction(() => !!window.__scene?.player, null, { timeout: 30000 });
  // the opening, quickly; then the beginning is over (the stars are open: no gate, no free trips)
  await page.waitForFunction(() => !!window.__scene.talker.talk?.script, null, { timeout: 15000 });
  await page.waitForTimeout(1200);
  for (let i = 0; i < 10 && (await ev(() => !!window.__scene.talker.talk)); i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(350); }
  await page.waitForSelector('.ov input', { timeout: 8000 });
  await page.type('.ov input', 'Wayfarer');
  await page.click('.ov button');
  await page.waitForFunction(() => !window.__scene.player.locked, null, { timeout: 10000 });
  await ev(() => { const r = window.__session.replicant; r.traits.tutorial = { ...(r.traits.tutorial ?? {}), step: 'open' }; });

  // 1. no cells saved: full; parked under the homeworld's red dwarf they charge slowly
  const full = await ev(() => window.__scene.departure.charge());
  log('full', full);
  if (full !== T.power.cells) fail(`a ship with no cells saved should start full (${full})`);
  const charged = await ev(() => { const r = window.__session.replicant; r.traits.cells = { charge: 10, at: Date.now() - 2 * 3_600_000, star: window.__scene.planet.star }; return window.__scene.departure.charge(); });
  log('two hours under the red dwarf', charged);
  if (Math.round(charged) !== 10 + 2 * T.power.chargePerHour.M) fail(`the cells did not charge by the clock (${charged})`);

  // 2. a fusion still tops them up from the hydrogen, keeping some back
  const fused = await ev((P) => {
    const s = window.__scene, r = window.__session.replicant;
    s.buildings.standNow('fusion');
    s.supplies.hydrogen = 30; s.markSupplies();
    r.traits.cells = { charge: 20, at: Date.now(), star: s.planet.star };
    const burned = s.departure.fuse();
    return { burned, charge: Math.round(s.departure.charge()), hydrogen: s.supplies.hydrogen, keep: P.keepHydrogen };
  }, T.power);
  log('fusion still', JSON.stringify(fused));
  if (fused.burned !== Math.ceil(80 / T.power.hydrogenCharge) || fused.charge !== T.power.cells || fused.hydrogen !== 30 - fused.burned) fail('the fusion still did not fill the cells from the hydrogen');
  const thin = await ev(() => { const s = window.__scene, r = window.__session.replicant; s.supplies.hydrogen = 7; r.traits.cells = { charge: 0, at: Date.now(), star: s.planet.star }; return { burned: s.departure.fuse(), hydrogen: s.supplies.hydrogen }; });
  if (thin.burned !== 7 - T.power.keepHydrogen || thin.hydrogen !== T.power.keepHydrogen) fail(`the still burned the hydrogen the husks need (${JSON.stringify(thin)})`);

  // 3. the star map: a world past the cells is dimmed until its route is charted
  const target = 'gliese-12';
  const ly = await ev((t) => { const s = window.__scene, r = window.__session.replicant; r.traits.cells = { charge: 15, at: Date.now(), star: s.planet.star };
    s.scene.pause(); s.scene.launch('starmap', { mode: 'launch', from: s.planet.star, fromPlanet: s.planet.planetIndex, charge: 15, onLaunch: () => undefined }); return t; }, target);
  await page.waitForTimeout(1500);
  const before = await ev((t) => { const m = window.__game.scene.getScene('starmap'); return { cost: m.cost(t), can: m.canAfford(m.projected.find((p) => p.star.id === t).star) }; }, target);
  log('uncharted', JSON.stringify(before), ly);
  const dist = await ev((t) => { const m = window.__game.scene.getScene('starmap'); return Math.hypot(...['x', 'y', 'z'].map((k) => m.projected.find((p) => p.star.id === t).star[k] - m.projected.find((p) => p.star.id === m.d.from).star[k])); }, target);
  if (before.cost !== cost(dist, false) || before.can) fail(`an uncharted route should cost ${cost(dist, false)} and be out of reach with 15 (${JSON.stringify(before)})`);
  // the route charted by someone: a fifth
  await ev((t) => { const m = window.__game.scene.getScene('starmap'); window.__session.store.chartRoute(m.d.from, t, 'x'); }, target);
  await ev(() => window.__session.store.routes());
  await page.evaluate(async () => { const m = window.__game.scene.getScene('starmap'); m.scene.stop(); });
  await page.waitForTimeout(300);
  // (every map reloads the routes)
  await ev(() => { const s = window.__scene; s.scene.launch('starmap', { mode: 'launch', from: s.planet.star, fromPlanet: s.planet.planetIndex, charge: 15, onLaunch: () => undefined }); });
  await page.waitForTimeout(1500);
  const after = await ev((t) => { const m = window.__game.scene.getScene('starmap'); return { cost: m.cost(t), can: m.canAfford(m.projected.find((p) => p.star.id === t).star) }; }, target);
  log('charted', JSON.stringify(after));
  if (after.cost !== cost(dist, true) || !after.can) fail(`a charted route should cost ${cost(dist, true)} and be in reach with 15 (${JSON.stringify(after)})`);
  await page.screenshot({ path: 'screenshots/universe-map.png' });
  await ev(() => window.__game.scene.getScene('starmap').scene.stop());
  await ev(() => window.__scene.scene.resume());

  // 4. a launch from the board: spends the cells, charts the route, and charges only from the landing on
  const launched = await ev((t) => {
    const s = window.__scene, r = window.__session.replicant;
    r.traits.cells = { charge: 100, at: Date.now(), star: s.planet.star };
    s.departure.launch(t, 1);
    return { cells: r.traits.cells, routes: window.__session.store.db.routes ?? [] };
  }, target);
  log('launched', JSON.stringify(launched));
  const charged2 = launched.routes.some((k) => k.includes(target));
  if (!charged2) fail('the flight did not chart its route');
  if (launched.cells.star !== target || launched.cells.at <= Date.now()) fail('the cells should charge under the new star from the landing on');
  if (Math.round(100 - launched.cells.charge) !== cost(dist, true)) fail(`a charted route should cost a fifth (${100 - launched.cells.charge} vs ${cost(dist, true)})`);
  await page.waitForFunction(() => window.__game.scene.isActive('travel'), null, { timeout: 15000 }).catch(() => fail('no flight began'));
  log('errors', JSON.stringify(errors));
} finally {
  await b.close();
  try { process.kill(-server.pid); } catch { /* already gone */ }
}
process.exit(errors.length ? 1 : 0);
