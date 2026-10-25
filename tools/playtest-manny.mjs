// Headless playtest of iron, hydrogen and mannies (manny.json): break an iron ore and a hydrogen vent and the pickups
// fill the store; build a manny at the dock; link into a manny on another world from a ship in flight (the berth there
// stands empty), from that manny into the Earth one, back to the ship once it has landed without you, and from your
// own body into a manny (the body waits aboard the vessel). Usage: npm run build && node tools/playtest-manny.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { chromium } from 'playwright';
const port = 4196;
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
for (;;) { try { if ((await fetch(`http://localhost:${port}/Replicated/`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }
const errors = [];
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const fail = (m) => { errors.push(m); console.log('FAIL', m); };
const log = (...a) => console.log(...a);
try {
  const page = await b.newPage({ viewport: { width: 1440, height: 810 } });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://localhost:${port}/Replicated/?shot=1&view=base&hour=21&copies=1&fast`);
  await page.waitForFunction(() => !!window.__scene?.player, null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  const ev = (f, a) => page.evaluate(f, a);
  const shot = async (name) => {
    const url = await ev(() => new Promise((res, rej) => { setTimeout(() => rej(new Error('snapshot timed out: game loop stalled')), 15000); window.__game.renderer.snapshot((img) => {
      const c = document.createElement('canvas'); c.width = 1440; c.height = 810;
      const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.drawImage(img, 0, 0, 1440, 810); res(c.toDataURL('image/png'));
    }); }));
    fs.writeFileSync(`screenshots/${name}.png`, Buffer.from(url.split(',')[1], 'base64'));
    log('saved', name);
  };
  // the star of the world you stand on, once its intro is over and you can move
  const scenePlanet = () => ev(() => window.__game.scene.isActive('planet') && window.__scene?.player && !window.__scene.player.locked ? window.__scene.planet.star : '');
  const waitOn = async (star, ms = 40000) => {
    const t = Date.now();
    while (Date.now() - t < ms) { if ((await scenePlanet()) === star) return true; await page.waitForTimeout(300); }
    return false;
  };

  // 1. iron ore and a hydrogen vent: break them beside the player, the pickups fly in and fill the store
  const nodes = await ev(() => { const s = window.__scene; return { iron: s.nodes.filter((n) => n.kind === 'iron').length, hydrogen: s.nodes.filter((n) => n.kind === 'hydrogen').length }; });
  log('nodes', JSON.stringify(nodes));
  if (nodes.iron < 8 || nodes.hydrogen < 8) fail('too few iron ores or hydrogen vents on Earth');
  for (const kind of ['iron', 'hydrogen']) {
    const got = await ev(async (kind) => {
      const s = window.__scene, c = s.baseCenter;
      s.frozen = true;
      const n = s.nodes.filter((x) => x.kind === kind && x.alive).sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0];
      const before = s.supplies[kind] ?? 0;
      s.player.setPosition(n.x + 16, n.y + 4);
      for (let i = 0; i < 6 && n.alive; i++) { n.hit({ x: -1, y: 0 }); await new Promise((r) => setTimeout(r, 150)); }
      await new Promise((r) => setTimeout(r, 2500));
      return { before, after: s.supplies[kind] ?? 0, broken: !n.alive };
    }, kind);
    log(kind, JSON.stringify(got));
    if (!got.broken) fail(`the ${kind} node did not break`);
    if (got.after - got.before < 5) fail(`the ${kind} pickups did not reach the store`);
  }
  await shot('manny-ores');

  // 2. the dock: not enough yet refuses, then with enough a manny is built in the player's likeness
  const dock = await ev(() => { const s = window.__scene; s.supplies.iron = 3; s.supplies.hydrogen = 1; s.markSupplies(); s.player.setPosition(s.dock.x, s.dock.y); s.player.locked = false; return { x: s.dock.x, y: s.dock.y }; });
  await page.keyboard.press('Space');
  await page.waitForTimeout(600);
  if (await ev(() => !!window.__session.replicant.traits.mannies)) fail('a manny was built without enough iron and hydrogen');
  await ev(() => { const s = window.__scene; s.supplies.iron = 20; s.supplies.hydrogen = 12; s.markSupplies(); });
  await page.waitForTimeout(400);
  await shot('manny-dock-ready');
  await page.keyboard.press('Space');
  await page.waitForTimeout(1800);
  await shot('manny-building');
  await page.waitForTimeout(2200);
  const built = await ev(() => ({ mannies: window.__session.replicant.traits.mannies, iron: window.__scene.supplies.iron, hydrogen: window.__scene.supplies.hydrogen, idle: !!window.__scene.dock.idle }));
  log('built', JSON.stringify(built), 'dock at', JSON.stringify(dock));
  if (!built.mannies?.['sol:3']) fail('no manny was recorded for Earth');
  if (built.iron !== 5 || built.hydrogen !== 2) fail('the manny did not cost 15 iron and 10 hydrogen');
  if (!built.idle) fail('the new manny is not standing in its dock');
  await ev(() => { const s = window.__scene; s.player.setPosition(s.dock.x + 30, s.dock.y + 14); });
  await page.waitForTimeout(500);
  await shot('manny-built');

  // 3. a manny on another world (as if built there); launch from Earth to Keid (16 ly) and, in flight, link into it:
  // the ship flies on without you
  await ev(() => { const r = window.__session.replicant; r.traits.mannies = { ...r.traits.mannies, 'alpha-cen:1': { at: Date.now() } }; const s = window.__scene; s.embers = 200; s.player.setPosition(s.boardSpot.x, s.boardSpot.y); s.player.locked = false; });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__game.scene.isActive('starmap'), null, { timeout: 10000 });
  await ev(() => { const m = window.__game.scene.getScene('starmap'); m.selected = m.projected.find((p) => p.star.id === 'alpha-cen').star; m.updateInfo(); });
  await page.waitForTimeout(600);
  await shot('manny-map-link');
  const linkShown = await ev(() => window.__game.scene.getScene('starmap').linkBtn.visible);
  if (!linkShown) fail('the LINK button did not show for a world with a manny');
  await ev(() => { const m = window.__game.scene.getScene('starmap'); m.selected = m.projected.find((p) => p.star.id === 'keid').star; m.updateInfo(); m.launch(); });
  await page.waitForFunction(() => window.__game.scene.isActive('travel'), null, { timeout: 30000 });
  // trips are a fraction of a second now (travel.json): hold this one in the air while the test acts in flight
  await ev(() => { window.__game.scene.getScene('travel').j.arrives_at = new Date(Date.now() + 600_000).toISOString(); });
  await page.waitForTimeout(6000);
  await shot('manny-flight-icons');
  await ev(() => window.__game.scene.getScene('travel').linkTo('alpha-cen', 1));
  if (!(await waitOn('alpha-cen'))) fail('linking from the ship did not wake you on Alpha Centauri');
  const flying = await ev(() => { const s = window.__scene, r = window.__session.replicant; return { ship: r.traits.ship, status: r.status, away: s.vesselAway, vessel: s.vessel.visible }; });
  log('from flight', JSON.stringify({ to: flying.ship?.star, journey: !!flying.ship?.journey, status: flying.status, away: flying.away, vessel: flying.vessel }));
  if (flying.ship?.star !== 'keid' || !flying.ship?.journey) fail('the ship in flight was not remembered');
  if (!flying.away || flying.vessel) fail('the vessel shows on a world it is not on');
  await page.waitForTimeout(1200);
  await shot('manny-linked');

  // 4. the empty berth opens the map to link or go back to the ship; link from this manny into the Earth manny
  await ev(() => { const s = window.__scene; s.player.setPosition(s.boardSpot.x, s.boardSpot.y); s.player.locked = false; });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__game.scene.isActive('starmap'), null, { timeout: 10000 });
  const mode = await ev(() => { const m = window.__game.scene.getScene('starmap'); return { mode: m.d.mode, vessel: m.vesselBtn.visible, launch: m.launchBtn.visible }; });
  log('berth map', JSON.stringify(mode));
  if (mode.mode !== 'link' || !mode.vessel || mode.launch) fail('the empty berth did not open the map to link or go back');
  await shot('manny-berth-map');
  const leftAt = await ev(() => ({ x: Math.round(window.__scene.player.x), y: Math.round(window.__scene.player.y) }));
  await ev(() => { const m = window.__game.scene.getScene('starmap'); m.selected = m.projected.find((p) => p.star.id === 'sol').star; m.updateInfo(); m.link(); });
  if (!(await waitOn('sol'))) fail('linking from Alpha Centauri did not wake you in the Earth manny');
  const earth = await ev(() => { const s = window.__scene, r = window.__session.replicant; return { ship: r.traits.ship?.star, alpha: r.traits.mannies['alpha-cen:1'], away: s.vesselAway, idle: !!s.dock.idle, onPad: Math.hypot(s.player.x - s.dock.x, s.player.y - s.dock.y) < 12 }; });
  log('earth manny', JSON.stringify(earth), 'left at', JSON.stringify(leftAt));
  if (earth.ship !== 'keid') fail('the ship was forgotten on the way');
  if (earth.alpha?.x !== leftAt.x) fail('the Alpha Centauri manny does not remember where it was left');
  if (!earth.away || earth.idle || !earth.onPad) fail('you did not wake in the Earth manny on its dock');

  // 5. the ship lands at Keid while you are away; TO VESSEL finds it there and the star counts as reached
  await ev(() => { const j = window.__session.replicant.traits.ship.journey; j.arrives_at = new Date(Date.now() - 1000).toISOString(); });
  await ev(() => { const s = window.__scene; s.player.setPosition(s.boardSpot.x, s.boardSpot.y); s.player.locked = false; });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__game.scene.isActive('starmap'), null, { timeout: 10000 });
  await ev(() => window.__game.scene.getScene('starmap').vesselBtn.emit('pointerdown'));
  const landed = await waitOn('keid');
  const fin = await ev(async () => ({ star: window.__session.replicant.star_id, ship: window.__session.replicant.traits.ship ?? null, earth: window.__session.replicant.traits.mannies['sol:3'], found: await window.__session.store.discoveredStars(), vessel: window.__scene.vessel.visible }));
  log('ship landed', JSON.stringify({ star: fin.star, ship: fin.ship, found: fin.found.includes('keid'), vessel: fin.vessel, earth: fin.earth }));
  if (!landed || fin.star !== 'keid' || fin.ship) fail('TO VESSEL did not find the ship where it landed');
  if (!fin.found.includes('keid')) fail('the star the ship reached without you was not discovered');
  if (!fin.vessel) fail('the vessel is missing where it waits');
  if (fin.earth?.x == null) fail('the Earth manny does not remember where it was left');
  await page.waitForTimeout(1500);
  await shot('manny-vessel-landed');

  // 6. in your own body at Keid, link into the Earth manny: your body boards the vessel here and waits
  await ev(() => { const s = window.__scene; s.player.setPosition(s.boardSpot.x, s.boardSpot.y); s.player.locked = false; });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__game.scene.isActive('starmap'), null, { timeout: 10000 });
  await ev(() => { const m = window.__game.scene.getScene('starmap'); m.selected = m.projected.find((p) => p.star.id === 'sol').star; m.updateInfo(); m.link(); });
  if (!(await waitOn('sol'))) fail('linking from your own body did not wake you on Earth');
  const last = await ev(() => window.__session.replicant.traits.ship);
  log('own body waits', JSON.stringify(last));
  if (last?.star !== 'keid' || last.journey) fail('your own body is not waiting aboard the vessel at Keid');
} finally { await b.close(); try { process.kill(-server.pid); } catch {} }
console.log('errors', errors);
process.exit(errors.length ? 1 : 0);
