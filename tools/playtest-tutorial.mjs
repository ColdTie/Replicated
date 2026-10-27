// Scripted headless playtest of the beginning (story/STORY.md The beginning; src/scenes/planet/Tutorial.ts,
// src/data/tutorial.json): a new player wakes to Thales' two lines, names itself and grows; the homeworld has no copper
// or quartz; the star map flies only to Gliese 12 b and home, free of fuel, ringing Gliese 12 b; by his printer Thales
// says what it waits for, and a mote of his light leads the way; the trip there grows the Vessel, copper and quartz go
// into the hold for home; the printer takes its supplies, grows the Vessel and lays the rest on its own; the Cems wake
// and come aboard, Thales speaks again; three designs open the stars; all of it after a reload.
// Usage: npm run build && node tools/playtest-tutorial.mjs   (saves screenshots/tutorial-*.png; fails loudly on page errors)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { chromium } from 'playwright';
const port = 4206;
const HW = JSON.parse(fs.readFileSync('src/data/homeworld.json', 'utf8'));
const TUT = JSON.parse(fs.readFileSync('src/data/tutorial.json', 'utf8'));
const HOME = { star: 'lhs-1140', planet: 2 };
const CEMS = TUT.target;
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
for (;;) { try { if ((await fetch(`http://localhost:${port}/Replicated/`)).ok) break; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 200)); }
const errors = [];
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const log = (...a) => console.log(...a);
const fail = (m) => { errors.push(m); log('FAIL', m); };
const URL = `http://localhost:${port}/Replicated/?local&hour=13&rain=0`;
try {
  const page = await b.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = (name) => page.screenshot({ path: `screenshots/${name}.png` });
  const ev = (f, arg) => page.evaluate(f, arg);
  const tut = () => ev(() => structuredClone(window.__session.replicant.traits.tutorial ?? null));
  const pages = async (n, name) => {
    // a scripted word of Thales': n pages, Enter through them
    await page.waitForFunction(() => !!window.__scene.talker.talk?.script, null, { timeout: 15000 }).catch(() => fail(`Thales did not speak (${name})`));
    await page.waitForTimeout(1200);
    const said = await ev(() => { const t = window.__scene.talker.talk; return { who: t?.npc.data.name, text: t?.script?.text }; });
    for (let i = 0; i < n * 4 && (await ev(() => !!window.__scene.talker.talk)); i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(450); }
    if (await ev(() => !!window.__scene.talker.talk)) fail(`Thales' ${name} words did not close`);
    return said;
  };
  const landedOn = (to, what) => page.waitForFunction((t) => window.__game.scene.isActive('planet') && window.__scene?.player && window.__scene.planet.star === t.star && !!window.__scene.bioworks, to, { timeout: 30000 })
    .then(() => page.waitForFunction(() => !window.__scene.player.locked, null, { timeout: 20000 }))
    .catch(() => fail(`${what} did not land`));
  const fly = async (to, what) => {
    const before = await ev((to) => { const s = window.__scene; const e = s.embers; s.player.setPosition(s.boardSpot.x, s.boardSpot.y); s.departure.launch(to.star, to.planet); return e; }, to);
    const after = await ev(() => window.__scene.embers);
    if (after !== before) fail(`the trip ${what} cost fuel (${before} -> ${after})`);
    await page.waitForFunction(() => window.__game.scene.isActive('travel'), null, { timeout: 30000 }).catch(() => fail(`the ship did not leave ${what}`));
    await page.waitForTimeout(500);
    await page.keyboard.press('Space');
    await landedOn(to, what);
    await page.waitForTimeout(600);
  };
  await page.goto(URL);
  await page.waitForFunction(() => !!window.__scene?.player, null, { timeout: 30000 });

  // 1. the opening: Thales' two lines, the name, the first growing
  const opening = await pages(2, 'opening');
  log('opening', JSON.stringify(opening));
  if (JSON.stringify(opening.text) !== JSON.stringify(TUT.lines.opening)) fail('Thales did not say the opening\'s two lines');
  await page.waitForSelector('.ov input', { timeout: 8000 });
  await page.type('.ov input', 'Tenth');
  await page.click('.ov button');
  await page.waitForFunction(() => !window.__scene.player.locked, null, { timeout: 10000 });
  await page.waitForFunction(() => window.__session.replicant.traits.tutorial?.grown === 1, null, { timeout: 8000 }).catch(() => fail('naming did not grow the Vessel'));
  await page.waitForTimeout(450);
  await shot('tutorial-grow');
  let t = await tut();
  log('named', JSON.stringify(t));
  if (t?.step !== 'printer') fail(`the beginning is not at the printer (${t?.step})`);

  // 2. the homeworld has no copper or quartz; the Printworks waits for its supplies
  const world = await ev((goal) => {
    const s = window.__scene, g = s.buildings.list.find((x) => x.id === goal);
    const kinds = {}; for (const n of s.nodes) kinds[n.kind] = (kinds[n.kind] ?? 0) + 1;
    return { kinds, paid: g.paid, cost: g.cost };
  }, HW.goal);
  log('world', JSON.stringify(world));
  if (world.kinds.copper || world.kinds.quartz) fail('the homeworld has copper or quartz');
  if (!world.kinds.salt || !world.kinds.iron || !world.kinds.ember) fail('the homeworld lacks salt, iron or Ember');
  if (world.paid || !world.cost.copper || !world.cost.quartz) fail('the Printworks does not wait for copper and quartz');

  // 3. the star map: only Gliese 12 b and home, free; the others wait
  await ev(() => { const s = window.__scene; s.player.setPosition(s.boardSpot.x, s.boardSpot.y); s.departure.tryBoard(); });
  await page.waitForFunction(() => window.__game.scene.isActive('starmap'), null, { timeout: 5000 }).catch(() => fail('the star map did not open'));
  await page.waitForTimeout(900);
  const gate = await ev(() => {
    const m = window.__game.scene.getScene('starmap');
    const sel = (id) => { m.selected = window.__galaxy?.starById?.(id) ?? m.projected.find((p) => p.star.id === id)?.star; m.updateInfo(); return m.infoText.text; };
    const sol = sel('sol');
    m.launch();
    const stillOpen = window.__game.scene.isActive('starmap');
    const cems = sel('gliese-12');
    return { only: m.d.only, free: m.d.free, guide: m.d.guide, sol, stillOpen, cems };
  });
  log('gate', JSON.stringify(gate));
  await page.waitForTimeout(500);
  await shot('tutorial-map');
  if (!gate.only || gate.only.length !== 2 || !gate.free) fail('the map is not gated to two free trips');
  if (!gate.stillOpen) fail('the map launched to Sol during the beginning');
  if (!gate.sol.includes(TUT.gateWhy.printer)) fail('Sol does not say why it waits');
  if (!gate.cems.includes('THALES FILLED THE TANKS')) fail('Gliese 12 b does not say its trip is free');
  await ev(() => window.__game.scene.getScene('starmap').close());
  await page.waitForFunction(() => !window.__game.scene.isActive('starmap') && !window.__scene.player.locked, null, { timeout: 5000 }).catch(() => fail('the star map did not close'));

  // 4. by his printer Thales says what it waits for
  await page.waitForFunction(() => { const s = window.__scene, th = s.homeworld.thales; return th && th.home && !th.hold && Math.hypot(th.x - th.home.x, th.y - th.home.y) < 46; }, null, { timeout: 20000 }).catch(() => fail('Thales did not walk to his printer'));
  const far = await ev(() => { const s = window.__scene; s.player.setPosition(s.boardSpot.x, s.boardSpot.y + 6); return true; });
  void far;
  await page.waitForTimeout(1200);
  const wisp = await ev(() => { const w = window.__scene.tutorial.wisp; return w ? { alpha: w.img.alpha, x: Math.round(w.x), y: Math.round(w.y) } : null; });
  log('wisp to Thales', JSON.stringify(wisp));
  if (!wisp || wisp.alpha < 0.3) fail('no mote of light leads to Thales');
  await ev(() => { const s = window.__scene, th = s.homeworld.thales; s.player.setPosition(th.x + 20, th.y + 4); });
  const printer = await pages(3, 'printer');
  if (JSON.stringify(printer.text) !== JSON.stringify(TUT.lines.printer)) fail('Thales did not say the printer\'s words');
  await ev((goal) => { const s = window.__scene, g = s.buildings.list.find((x) => x.id === goal), pr = s.buildings.printers.get(goal); s.player.setPosition((pr?.x ?? g.x) + 16, g.y + 18); s.cameras.main.centerOn(g.x, g.y - 10); }, HW.goal);
  await page.waitForTimeout(1500);
  const readout = await ev(() => { const r = window.__scene.tutorial.readout; return r ? { alpha: r.box.alpha, n: r.box.list.length } : null; });
  log('readout', JSON.stringify(readout));
  if (!readout || readout.n < 12) fail('the printer does not show what it waits for');
  await shot('tutorial-printer');

  // 5. the home supplies: a salt bloom broken by hand, the rest given; the wisp now leads to the ship
  const salt = await ev(async () => {
    const s = window.__scene, c = s.baseCenter;
    const n = s.nodes.filter((x) => x.kind === 'salt' && x.alive).sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0];
    const before = s.supplies.salt ?? 0;
    s.player.setPosition(n.x + 16, n.y + 4);
    for (let i = 0; i < 6 && n.alive; i++) { n.hit({ x: -1, y: 0 }); await new Promise((r) => setTimeout(r, 150)); }
    await new Promise((r) => setTimeout(r, 2500));
    return { before, after: s.supplies.salt ?? 0 };
  });
  if (salt.after - salt.before < 3) fail('salt did not reach the store');
  await ev(() => { const s = window.__scene; s.supplies.salt = Math.max(12, s.supplies.salt ?? 0); s.supplies.iron = 8; s.supplies.wood = 6; s.markSupplies(); s.addEmbers(20); });
  await page.waitForTimeout(1400);
  const toShip = await ev(() => { const s = window.__scene, w = s.tutorial.wisp, g = s.tutorial.guide; return { guide: g, paid: s.buildings.list.find((x) => x.id === 'metanoia-printworks').paid, toward: w ? Math.round(Math.hypot(w.x - s.boardSpot.x, w.y - s.boardSpot.y) - Math.hypot(s.player.x - s.boardSpot.x, s.player.y - s.boardSpot.y)) : null }; });
  log('home supplies', JSON.stringify(toShip));
  if (toShip.paid) fail('the printer took its supplies without copper and quartz');
  if (toShip.guide?.star !== CEMS.star) fail('the map does not point to Gliese 12 b once only copper and quartz are missing');
  if (toShip.toward === null || toShip.toward > 0) fail('the mote of light does not lead to the ship');

  // 6. to Gliese 12 b (free, SKIP): the Vessel grows; copper and quartz there; the readout over the ship
  await fly(CEMS, 'to Gliese 12 b');
  await page.waitForFunction(() => window.__session.replicant.traits.tutorial?.grown === 2, null, { timeout: 8000 }).catch(() => fail('landing on Gliese 12 b did not grow the Vessel'));
  const there = await ev(async () => {
    const s = window.__scene, c = s.baseCenter, out = {};
    for (const kind of ['copper', 'quartz']) {
      const n = s.nodes.filter((x) => x.kind === kind && x.alive).sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0];
      if (!n) { out[kind] = 'none'; continue; }
      s.player.setPosition(n.x + 16, n.y + 4);
      for (let i = 0; i < 8 && n.alive; i++) { n.hit({ x: -1, y: 0 }); await new Promise((r) => setTimeout(r, 150)); }
      await new Promise((r) => setTimeout(r, 2500));
      out[kind] = s.supplies[kind] ?? 0;
    }
    return out;
  });
  log('gliese 12 b', JSON.stringify(there));
  if (there.copper === 'none' || there.quartz === 'none' || there.copper < 3 || there.quartz < 3) fail('no copper or quartz gathered on Gliese 12 b');
  await ev((need) => { const s = window.__scene; s.supplies.copper = need.copper; s.supplies.quartz = need.quartz; s.markSupplies(); s.player.setPosition(s.vesselPos.x + 30, s.vesselPos.y + 20); s.cameras.main.centerOn(s.vesselPos.x, s.vesselPos.y); }, TUT.tripNeed);
  await page.waitForTimeout(1500);
  await shot('tutorial-cemworld');
  if (!(await ev(() => !!window.__scene.tutorial.readout))) fail('the ship does not show what the trip still wants');
  if ((await ev(() => window.__scene.tutorial.guide?.star)) !== HOME.star) fail('the map does not point home once the trip has what it wants');

  // 7. home: the hold brings them; the printer takes its supplies, the Vessel grows, the rest is laid on its own
  await fly(HOME, 'home');
  await page.waitForFunction(() => window.__session.replicant.traits.tutorial?.grown >= 3, null, { timeout: 12000 }).catch(() => fail('the printer did not take its supplies'));
  await ev((goal) => { const s = window.__scene, g = s.buildings.list.find((x) => x.id === goal); s.player.setPosition(g.x - 40, g.y + 26); s.cameras.main.centerOn(g.x, g.y - 10); }, HW.goal);
  await page.waitForTimeout(2500);
  await shot('tutorial-printing');
  const fed = await ev((goal) => { const s = window.__scene, g = s.buildings.list.find((x) => x.id === goal); return { paid: g.paid, progress: g.progress, copper: s.supplies.copper ?? 0, quartz: s.supplies.quartz ?? 0, goods: window.__session.replicant.traits.goods ?? null }; }, HW.goal);
  log('fed', JSON.stringify(fed));
  if (!fed.paid) fail('the Printworks was not paid');
  if (fed.goods) fail('the hold was not emptied');
  if (fed.copper !== TUT.tripNeed.copper - HW.founded[1].cost.copper) fail(`the copper left over is wrong (${fed.copper})`);
  await page.waitForFunction((goal) => window.__scene.buildings.list.find((x) => x.id === goal).built, HW.goal, { timeout: 30000 }).catch(() => fail('the printer did not finish the Printworks on its own'));

  // 8. the Cems wake and come aboard; the Vessel grows; Thales says what they can do
  await page.waitForFunction(() => window.__scene.bioworks.awake, null, { timeout: 8000 }).catch(() => fail('the Cems did not wake'));
  const awake = await pages(3, 'awake');
  if (JSON.stringify(awake.text) !== JSON.stringify(TUT.lines.awake)) fail('Thales did not say the Cems\' words');
  t = await tut();
  log('awake', JSON.stringify({ t, culture: await ev(() => window.__session.replicant.traits.culture ?? null) }));
  if (t?.step !== 'designs' || t.grown < 4) fail('the Cems waking did not move the beginning on');
  if (!(await ev(() => window.__session.replicant.traits.culture))) fail('the Cems did not come aboard the ship');
  await shot('tutorial-awake');

  // 9. three designs of yours open the stars
  await ev(() => { const s = window.__scene; for (const k of ['salt', 'iron', 'wood']) s.supplies[k] = 38; s.supplies.quartz = 4; s.supplies.copper = 4; s.markSupplies(); s.addEmbers(20); });
  for (const id of ['lantern', 'house', 'storehouse']) {
    const why = await ev((id) => window.__scene.buildings.whyNot(id), id);
    if (why === 'THE CEMS ARE BUSY') { await ev(() => { for (const p of window.__scene.buildings.printing) p.printStart = Date.now() - p.printMs - 10; }); await page.waitForTimeout(1500); }
    const b2 = await ev((id) => !!window.__scene.buildings.print(id), id);
    if (!b2) fail(`could not print a ${id}: ${await ev((id) => window.__scene.buildings.whyNot(id), id)}`);
  }
  await ev(() => { for (const p of window.__scene.buildings.printing) p.printStart = Date.now() - p.printMs - 10; });
  await page.waitForFunction(() => window.__session.replicant.traits.tutorial?.printed.length >= 3, null, { timeout: 15000 }).catch(() => fail('three designs were not counted'));
  const open = await pages(1, 'open');
  if (JSON.stringify(open.text) !== JSON.stringify(TUT.lines.open)) fail('Thales did not open the stars');
  await page.waitForTimeout(600);
  await shot('tutorial-open');
  t = await tut();
  log('open', JSON.stringify(t));
  if (t?.step !== 'open' || t.grown !== 5) fail('the stars did not open, or the Vessel is not fully grown');
  if (!(await ev(() => window.__scene.tutorial.allows('sol', 3)))) fail('the map still holds Sol back');

  // 10. a reload: still open, still grown (the lights circling its head)
  await ev(async () => { const s = window.__scene; await s.saver.flushPlanet(); await s.saver.saveReplicant(); });
  await page.waitForTimeout(600);
  await page.goto(URL);
  await page.waitForFunction(() => window.__game?.scene.isActive('home') || !!window.__scene?.player, null, { timeout: 30000 });
  if (await ev(() => window.__game.scene.isActive('home'))) { await page.waitForTimeout(1200); await page.mouse.click(480, 294); }
  await page.waitForFunction(() => !!window.__scene?.player && !!window.__scene.buildings, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const reload = await ev(() => ({ t: window.__session.replicant.traits.tutorial, orbit: window.__scene.player.orbit.length, culture: !!window.__session.replicant.traits.culture }));
  log('reload', JSON.stringify(reload));
  if (reload.t?.step !== 'open' || reload.t.grown !== 5 || reload.orbit !== 2 || !reload.culture) fail('the beginning did not survive a reload');
  log('errors', JSON.stringify(errors));
} finally {
  await b.close();
  try { process.kill(-server.pid); } catch { /* the preview server already stopped */ }
}
process.exit(errors.length ? 1 : 0);
