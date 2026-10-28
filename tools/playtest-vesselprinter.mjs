// Scripted headless playtest of the Vessel Printer (story/STORY.md Copying, Steve 2026-10-28; src/entities/VesselPrinter.ts,
// src/data/vesselprinter.json): the Replicator makes no copies any more; the Vessel Printer waits for the
// Supercomputer, is printed once on the homeworld (a second is refused); its door opens WAKE or HOLD (Esc closes it
// with nothing spent); WAKE spends the Ember of a copy (no more), the maker is free while the pod prints the body by the
// clock, nothing more can be begun meanwhile, and the Vessel steps out once (its row made once, the pod empty in the
// save); a HOLD begun before a reload steps out after it; on Earth the printer cannot be printed and no Replicator pad
// waits. Usage: npm run build && node tools/playtest-vesselprinter.mjs   (saves screenshots/vesselprinter-*.png)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { chromium } from 'playwright';
const port = 4207;
const HW = JSON.parse(fs.readFileSync('src/data/homeworld.json', 'utf8'));
const DRIFT = JSON.parse(fs.readFileSync('src/data/drift.json', 'utf8'));
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
  const shot = (name) => page.screenshot({ path: `screenshots/${name}.png` });
  const ev = (f, arg) => page.evaluate(f, arg);
  /** what the save holds: the pod's state and how many rows carry this id */
  const saved = (id) => ev(async (id) => {
    const s = window.__scene, st = window.__session.store;
    const p = await st.loadPlanet(s.planet.star, s.planet.planetIndex, 0);
    return { print: p?.data.vesselPrint ?? null, rows: id ? st.db.replicants.filter((r) => r.id === id).length : 0 };
  }, id);
  const url = `http://localhost:${port}/Replicated/?local&hour=13&rain=0`;
  await page.goto(url);
  await page.waitForFunction(() => !!window.__scene?.player, null, { timeout: 30000 });

  // the opening, quickly: Thales' word (two pages), the name
  await page.waitForFunction(() => !!window.__scene.talker.talk?.script, null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  for (let i = 0; i < 10 && (await ev(() => !!window.__scene.talker.talk)); i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(350); }
  await page.waitForSelector('.ov input', { timeout: 8000 });
  await page.type('.ov input', 'Tenth');
  await page.click('.ov button');
  await page.waitForFunction(() => !window.__scene.player.locked, null, { timeout: 10000 });

  // 1. the Replicator Thales used still stands, but its ring makes no copy
  await ev(() => { const s = window.__scene; s.addEmbers(40 - s.embers); s.player.setPosition(s.base.spotX, s.base.spotY); });
  await page.waitForTimeout(300);
  await page.keyboard.press('Space');
  await page.waitForTimeout(900);
  const ring = await ev(() => ({ built: window.__scene.base.built, choice: !!window.__scene.choice, npcs: window.__scene.npcs.filter((n) => !n.data.traits.thales).length, embers: window.__scene.embers }));
  log('replicator', JSON.stringify(ring));
  if (!ring.built) fail('the Replicator Thales used is gone from the homeworld');
  if (ring.choice || ring.npcs || ring.embers !== 40) fail('the Replicator still makes copies');

  // 2. past the beginning (tools/playtest-tutorial.mjs plays it): the Printworks stands, the Cems are awake
  await ev(async (goal) => {
    const s = window.__scene, me = window.__session.replicant;
    me.traits.tutorial = { ...me.traits.tutorial, step: 'open', grown: 5, told: ['opening', 'printer', 'awake', 'open'] };
    await window.__session.store.patchTraits(me.id, { tutorial: me.traits.tutorial });
    s.buildings.finishNow(goal);
    s.bioworks.wake(false);
  }, HW.goal);
  if (!(await ev(() => window.__scene.bioworks.awake))) fail('the Cems did not wake');

  // 3. the Vessel Printer: it waits for the Supercomputer; printed once; a second is refused
  const rules = await ev(() => {
    const s = window.__scene, bl = s.buildings;
    for (const k of ['salt', 'iron', 'quartz', 'copper', 'wood']) s.supplies[k] = 60;
    s.markSupplies();
    s.addEmbers(60 - s.embers);
    const before = bl.whyNot('vesselprinter');
    bl.standNow('supercomputer');
    const after = bl.whyNot('vesselprinter');
    const p = bl.print('vesselprinter');
    const again = bl.whyNot('vesselprinter');
    if (p) { bl.finishNow(p.id); bl.save(); }
    return { before, after, printed: !!p, again, built: !!s.vesselPrinter.building, door: s.vesselPrinter.door };
  });
  log('rules', JSON.stringify(rules));
  if (rules.before !== 'NEEDS SUPERCOMPUTER') fail(`before the Supercomputer the printer says "${rules.before}"`);
  if (rules.after !== null || !rules.printed) fail(`with the Supercomputer standing the printer could not be printed ("${rules.after}")`);
  if (rules.again !== 'ONE STANDS HERE') fail(`a second Vessel Printer was not refused ("${rules.again}")`);
  if (!rules.built || !rules.door) fail('the Vessel Printer does not stand finished');
  await page.waitForTimeout(800);

  // 4. its door: standing in it opens WAKE or HOLD; Esc closes it with nothing spent
  const cost = DRIFT.cost;
  await ev(() => { const s = window.__scene; s.addEmbers(40 - s.embers); s.vesselPrinter.printMs = 3500; s.player.setPosition(s.vesselPrinter.door.x, s.vesselPrinter.door.y); });
  await page.waitForFunction(() => !!window.__scene.choice, null, { timeout: 5000 }).catch(() => fail('standing at the printer\'s door did not open WAKE or HOLD'));
  await page.waitForTimeout(400);
  await shot('vesselprinter-choice');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__scene.choice && !window.__scene.player.locked, null, { timeout: 3000 }).catch(() => fail('Esc did not close the choice'));
  if ((await ev(() => window.__scene.embers)) !== 40) fail('closing the choice spent Ember');
  // it waits for you to step out of the doorway before it opens again
  await page.waitForTimeout(1200);
  if (await ev(() => !!window.__scene.choice)) fail('the choice opened again without leaving the doorway');
  await ev(() => { const s = window.__scene; s.player.setPosition(s.vesselPrinter.door.x + 40, s.vesselPrinter.door.y + 30); });
  await page.waitForTimeout(300);
  await ev(() => { const s = window.__scene; s.player.setPosition(s.vesselPrinter.door.x, s.vesselPrinter.door.y); });
  await page.waitForFunction(() => !!window.__scene.choice, null, { timeout: 5000 }).catch(() => fail('the choice did not open again'));
  await page.waitForTimeout(300);

  // 5. WAKE: the Ember of one copy, the maker free, the pod printing by the clock and saved with the planet
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__scene.vesselPrinter.busy && !window.__scene.replicating && !window.__scene.player.locked, null, { timeout: 6000 }).catch(() => fail('the pod did not take the Vessel, or the maker stayed held'));
  const begun = await ev(() => { const s = window.__scene, st = s.vesselPrinter.state; return { embers: s.embers, kind: st?.kind, id: st?.row.id, blank: st?.row.traits.blank, can: s.canReplicate() }; });
  log('begun', JSON.stringify(begun));
  if (begun.embers !== 40 - cost) fail(`a Vessel did not cost ${cost} Ember (${40 - begun.embers})`);
  if (begun.kind !== 'wake' || !begun.blank) fail('the pod does not print a woken (blank) Vessel');
  if (begun.can) fail('another Vessel could be begun while the pod is full');
  await ev(() => window.__scene.flushPlanet());
  const mid = await saved(begun.id);
  if (mid.print?.row?.id !== begun.id) fail('the Vessel in the pod is not in the planet\'s save');
  // nothing more is begun meanwhile: the door only buzzes
  await ev(() => { const s = window.__scene; s.addEmbers(40 - s.embers); s.player.setPosition(s.vesselPrinter.door.x, s.vesselPrinter.door.y); s.tryReplicate(); });
  if (await ev(() => !!window.__scene.choice)) fail('a second Vessel could be begun while one prints');
  await ev(() => { const s = window.__scene; s.player.setPosition(s.vesselPrinter.door.x + 30, s.vesselPrinter.door.y + 24); });
  await page.waitForTimeout(1200);
  await shot('vesselprinter-forming');
  // whole: it steps out of the door, once
  await page.waitForFunction((id) => window.__scene.npcs.some((n) => n.data.id === id) && !window.__scene.vesselPrinter.busy, begun.id, { timeout: 15000 }).catch(() => fail('the woken Vessel never stepped out'));
  await page.waitForTimeout(1600);
  await shot('vesselprinter-born');
  await ev(() => window.__scene.flushPlanet());
  const out = await saved(begun.id);
  const born = await ev((id) => { const s = window.__scene, n = s.npcs.find((x) => x.data.id === id), d = s.vesselPrinter.door; return { near: n ? Math.round(Math.hypot(n.x - d.x, n.y - d.y)) : -1 }; }, begun.id);
  log('born', JSON.stringify({ ...born, ...out }));
  if (out.rows !== 1) fail(`the woken Vessel's row was made ${out.rows} times`);
  if (out.print) fail('the pod is still full in the save');
  if (born.near < 0 || born.near > 30) fail('the woken Vessel did not step out of the door');

  // 6. HOLD, then a reload while it prints: it steps out after the reload, asleep in your likeness, once
  await ev(() => { const s = window.__scene; s.addEmbers(40 - s.embers); s.vesselPrinter.printMs = 6000; s.player.setPosition(s.vesselPrinter.door.x + 40, s.vesselPrinter.door.y + 30); });
  await page.waitForTimeout(300);
  await ev(() => { const s = window.__scene; s.player.setPosition(s.vesselPrinter.door.x, s.vesselPrinter.door.y); });
  await page.waitForFunction(() => !!window.__scene.choice, null, { timeout: 5000 }).catch(() => fail('no choice for the held Vessel'));
  await page.waitForTimeout(300);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__scene.vesselPrinter.busy, null, { timeout: 6000 }).catch(() => fail('the pod did not take the held Vessel'));
  const heldId = await ev(() => window.__scene.vesselPrinter.state.row.id);
  await ev(() => window.__scene.flushPlanet());
  await page.goto(url);
  await page.waitForFunction(() => window.__game?.scene.isActive('home') || !!window.__scene?.player, null, { timeout: 30000 });
  if (await ev(() => window.__game.scene.isActive('home'))) { await page.waitForTimeout(1200); await page.mouse.click(480, 294); }
  await page.waitForFunction(() => !!window.__scene?.player && !!window.__scene.vesselPrinter, null, { timeout: 30000 });
  await page.waitForFunction((id) => window.__scene.npcs.some((n) => n.data.id === id && n.held), heldId, { timeout: 20000 }).catch(() => fail('the held Vessel never stepped out after the reload'));
  await page.waitForTimeout(800);
  await ev(() => window.__scene.flushPlanet());
  const after = await saved(heldId);
  const held = await ev((id) => { const n = window.__scene.npcs.find((x) => x.data.id === id), me = window.__session.replicant; return { held: n?.data.traits.held, same: JSON.stringify(n?.data.traits.body) === JSON.stringify(me.traits.body) }; }, heldId);
  log('held', JSON.stringify({ ...held, ...after }));
  if (after.rows !== 1) fail(`the held Vessel's row was made ${after.rows} times`);
  if (after.print) fail('the pod is still full in the save after the held Vessel stepped out');
  if (!held.held || !held.same) fail('the held Vessel is not asleep in its maker\'s likeness');

  // 7. Earth: the Vessel Printer is the homeworld's alone, and no Replicator pad waits to be built
  await page.goto(`http://localhost:${port}/Replicated/?shot=1&at=sol&pi=3&local&view=base&hour=13&rain=0`);
  await page.waitForFunction(() => !!window.__scene?.player && window.__scene.planet.star === 'sol', null, { timeout: 30000 });
  await page.waitForTimeout(800);
  const earth = await ev(() => { const s = window.__scene; return { why: s.buildings.whyNot('vesselprinter'), replicator: s.base.built, pad: s.children.list.some((o) => o.texture?.key === 'pad') }; });
  log('earth', JSON.stringify(earth));
  if (earth.why !== 'ONLY ON THE HOMEWORLD') fail(`on Earth the printer says "${earth.why}"`);
  if (earth.replicator || earth.pad) fail('a Replicator pad still waits on Earth');
  log('errors', JSON.stringify(errors));
} finally {
  await b.close();
  try { process.kill(-server.pid); } catch { /* gone */ }
}
process.exit(errors.length ? 1 : 0);
