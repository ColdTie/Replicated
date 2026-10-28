// Scripted headless playtest of the Cems (story/STORY.md; src/entities/Bioworks.ts, src/scenes/DesignScene.ts,
// src/data/designs.json): a new player on LHS 1140 b finds the Cem bed asleep beside the Printworks, gathers salt
// into the store (no quartz or copper at home), supplies and finishes the Printworks and the Cems wake; standing in its door opens the designs;
// a House is printed (paid at once, the ants carry its supplies, it rises with the clock, its lights come on), which
// opens the Cem Nursery and lifts every mood; a Storehouse raises the store; the prints survive a reload, and one whose
// time ran out while nobody played stands finished.
// Usage: npm run build && node tools/playtest-bioworks.mjs   (saves screenshots/bio-*.png; fails loudly on page errors)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { chromium } from 'playwright';
const port = 4188;
const HW = JSON.parse(fs.readFileSync('src/data/homeworld.json', 'utf8'));
const CAT = JSON.parse(fs.readFileSync('src/data/designs.json', 'utf8'));
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
  await page.goto(`http://localhost:${port}/Replicated/?local&hour=13&rain=0`);
  await page.waitForFunction(() => !!window.__scene?.player, null, { timeout: 30000 });

  // the opening, quickly: Thales' word, the name
  await page.waitForFunction(() => !!window.__scene.talker.talk?.script, null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  // (Thales' opening is two pages: Enter until the box closes)
  for (let i = 0; i < 10 && (await ev(() => !!window.__scene.talker.talk)); i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(350); }
  await page.waitForSelector('.ov input', { timeout: 8000 });
  await page.type('.ov input', 'Tenth');
  await page.click('.ov button');
  await page.waitForFunction(() => !window.__scene.player.locked, null, { timeout: 10000 });
  log('name', await ev(() => window.__session.replicant.name));

  // 1. the bed is there, asleep: a lot of its own near the Printworks, Cems on the salt, blooms on its rim; no door yet
  const bed = await ev((goal) => {
    const s = window.__scene, bw = s.bioworks, g = s.buildings.list.find((x) => x.id === goal);
    return { active: bw.active, awake: bw.awake, lot: s.townState.civic.cembed, center: bw.center, fromGoal: Math.round(Math.hypot(bw.center.x - g.x, bw.center.y - g.y)), blooms: s.nodes.filter((n) => n.key.startsWith('bed')).length, door: bw.playerAtDoor(), surface: s.footSurface(bw.center.x, bw.center.y) };
  }, HW.goal);
  log('bed', JSON.stringify(bed));
  if (!bed.active || bed.lot === undefined) fail('the homeworld has no Cem bed on a lot of its own');
  if (bed.awake) fail('the Cems were awake before the Printworks stands');
  if (bed.fromGoal > 260) fail(`the bed is far from the Printworks (${bed.fromGoal} px)`);
  if (bed.blooms < 3) fail('no salt blooms on the bed\'s rim');
  if (bed.surface !== 'salt') fail(`footsteps on the flat are not salt (${bed.surface})`);

  // 2. salt: break a bloom beside the player; the pickups fly in and fill the store. The homeworld has no quartz or
  // copper (planets.json lacks; they come from Gliese 12 b, tools/playtest-tutorial.mjs)
  if (await ev(() => window.__scene.nodes.some((n) => n.kind === 'quartz' || n.kind === 'copper'))) fail('the homeworld has quartz or copper');
  for (const kind of ['salt']) {
    const got = await ev(async (kind) => {
      const s = window.__scene, c = s.baseCenter;
      const n = s.nodes.filter((x) => x.kind === kind && x.alive).sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0];
      if (!n) return { none: true };
      const before = s.supplies[kind] ?? 0;
      s.player.setPosition(n.x + 16, n.y + 4);
      for (let i = 0; i < 6 && n.alive; i++) { n.hit({ x: -1, y: 0 }); await new Promise((r) => setTimeout(r, 150)); }
      await new Promise((r) => setTimeout(r, 2500));
      return { before, after: s.supplies[kind] ?? 0, broken: !n.alive, count: s.nodes.filter((x) => x.kind === kind).length };
    }, kind);
    log(kind, JSON.stringify(got));
    if (got.none) { fail(`no ${kind} on the homeworld`); continue; }
    if (!got.broken) fail(`the ${kind} node did not break`);
    if (got.after - got.before < 4) fail(`the ${kind} pickups did not reach the store`);
  }
  await shot('bio-minerals');

  // 3. finish the Printworks: the Cems wake, the ants come out, its door opens the designs
  await ev(async (goal) => {
    const s = window.__scene, bl = s.buildings.list.find((x) => x.id === goal);
    const aim = { x: 1, y: 0, lengthSq: () => 1 };
    s.player.setPosition(bl.x - bl.w * 8 - 6, bl.y);
    // Thales' printer waits for its supplies (homeworld.json founded cost): give them, wait until it takes them
    for (const [k, n] of Object.entries(bl.cost)) { if (k === 'ember') s.addEmbers(n); else s.supplies[k] = (s.supplies[k] ?? 0) + n; }
    s.markSupplies();
    for (let i = 0; i < 60 && !bl.paid; i++) await new Promise((r) => setTimeout(r, 100));
    for (let i = 0; i < 80 && !bl.built; i++) { s.resolveAttack(bl.x - bl.w * 8 + 4, bl.y - 4, 14, aim); await new Promise((r) => setTimeout(r, 40)); }
  }, HW.goal);
  await page.waitForFunction(() => window.__scene.bioworks.awake, null, { timeout: 8000 }).catch(() => fail('the Cems did not wake when the Printworks was finished'));
  // Thales speaks a few seconds after the Cems wake (the beginning, tutorial.json lines.awake): hear him out. He may say
  // his printer words first, if he stood at his post as the Printworks was finished: Enter through whatever he says
  // until the awake words have been said and the box is shut
  for (let i = 0; i < 60; i++) {
    const t = await ev(() => ({ talk: !!window.__scene.talker.talk, told: !!window.__session.replicant.traits.tutorial?.told.includes('awake') }));
    if (t.told && !t.talk) break;
    if (t.talk) await page.keyboard.press('Enter');
    await page.waitForTimeout(350);
  }
  if (!(await ev(() => window.__session.replicant.traits.tutorial?.told.includes('awake')))) fail('Thales did not speak when the Cems woke');
  await page.waitForTimeout(1500);
  const awake = await ev(() => { const bw = window.__scene.bioworks; return { trails: bw.trails.map((t) => t.id), ants: bw.trails.reduce((a, t) => a + t.ants.length, 0) + bw.loiter.length }; });
  log('awake', JSON.stringify(awake));
  if (!awake.trails.includes('forage') || awake.ants < 10) fail('no ants came out of the mound');
  await ev(() => { const s = window.__scene; const bw = s.bioworks; s.player.setPosition(bw.center.x - 30, bw.center.y + 30); });
  await page.waitForTimeout(600);
  await shot('bio-bed');

  // 4. the designs: stand in the Printworks' door. A House can be printed, the Nursery waits for one
  await ev(() => { const s = window.__scene; for (const k of ['salt', 'iron', 'quartz', 'copper', 'wood']) s.supplies[k] = 38; s.markSupplies(); s.addEmbers(40); });
  await ev((goal) => { const s = window.__scene, g = s.buildings.list.find((x) => x.id === goal); s.bioworks.readyAt = 0; s.player.setPosition(g.x, g.y + 6); }, HW.goal);
  await page.waitForFunction(() => window.__game.scene.isActive('designs') && window.__designs?.rows?.length, null, { timeout: 8000 }).catch(() => fail('standing in the Printworks\' door did not open the designs'));
  await page.waitForTimeout(700);
  const menu = await ev(() => window.__designs.rows.map((r) => ({ id: r.id, why: r.why, volume: r.m.volume, complexity: r.m.complexity, cost: r.m.cost })));
  log('menu', JSON.stringify(menu.map((r) => `${r.id}:${r.why ?? 'ready'}:${r.volume}/${r.complexity}`)));
  if (menu.length !== CAT.designs.length) fail(`the menu does not list every design (${menu.length})`);
  const row = (id) => menu.find((r) => r.id === id);
  if (row('house')?.why) fail(`the House cannot be printed with a full store: ${row('house')?.why}`);
  if (!row('nursery')?.why?.startsWith('NEEDS')) fail('the Cem Nursery is open before a House stands');
  if (!(row('supercomputer').complexity > row('house').complexity && row('supercomputer').volume > row('house').volume)) fail('a supercomputer is not more complex and larger than a house');
  await shot('bio-menu');
  // the X closes it (a phone has no Esc); a click on the model only turns it, it prints nothing
  const before0 = await ev(() => window.__scene.buildings.printing.length);
  await page.mouse.click(335 * 2, 60 * 2);
  await page.waitForTimeout(300);
  if (!(await ev(() => window.__game.scene.isActive('designs'))) || (await ev(() => window.__scene.buildings.printing.length)) !== before0) fail('a click on the model closed the menu or printed');
  await page.mouse.click(460 * 2, 20 * 2);
  await page.waitForFunction(() => !window.__game.scene.isActive('designs'), null, { timeout: 3000 }).catch(() => fail('the X did not close the designs'));
  await page.waitForTimeout(400);
  if ((await ev(() => window.__scene.buildings.printing.length)) !== before0) fail('closing the menu printed something');
  // and the door opens it again once you step back into it
  await ev((goal) => { const s = window.__scene, g = s.buildings.list.find((x) => x.id === goal); s.player.setPosition(g.x, g.y + 40); }, HW.goal);
  await page.waitForTimeout(300);
  await ev((goal) => { const s = window.__scene, g = s.buildings.list.find((x) => x.id === goal); s.bioworks.readyAt = 0; s.player.setPosition(g.x, g.y + 6); }, HW.goal);
  await page.waitForFunction(() => window.__game.scene.isActive('designs') && window.__designs?.rows?.length, null, { timeout: 8000 }).catch(() => fail('the door did not open the designs again'));
  await page.waitForTimeout(700);
  // a press with another key in the same frame (a slow frame, a quick hand) still moves one row: Phaser hands a
  // frame's earlier key events to the scene again whenever another one arrives
  for (const [code, keyCode, d] of [['ArrowDown', 40, 1], ['ArrowUp', 38, -1]]) {
    const same = await ev(([code, keyCode]) => {
      const was = window.__designs.index, key = (type, c, k) => window.dispatchEvent(new KeyboardEvent(type, { code: c, key: c, keyCode: k, bubbles: true }));
      key('keydown', code, keyCode); key('keyup', code, keyCode); key('keydown', 'KeyQ', 81); key('keyup', 'KeyQ', 81);
      return [was, window.__designs.index];
    }, [code, keyCode]);
    if (same[1] !== (same[0] + d + menu.length) % menu.length) fail(`${code} with another key in the same frame moved the designs from row ${same[0]} to ${same[1]}`);
    await page.waitForTimeout(150);
  }
  // walk the rows to the House and print it with Enter; a press held as a hand holds it moves one row, never two
  // (the menu takes a key on its next frame: wait for each step to land before looking again)
  for (let i = 0; i < 12 && (await ev(() => window.__designs.rows[window.__designs.index].id)) !== 'house'; i++) {
    const was = await ev(() => window.__designs.index);
    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(80);
    await page.keyboard.up('ArrowDown');
    await page.waitForFunction((was) => window.__designs.index !== was, was, { timeout: 3000 }).catch(() => undefined);
    await page.waitForTimeout(150);
    const now = await ev(() => window.__designs.index);
    if (now !== (was + 1) % menu.length) fail(`one Down press moved the designs from row ${was} to ${now}`);
  }
  const before = await ev(() => ({ ...window.__scene.supplies, ember: window.__scene.embers }));
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !window.__game.scene.isActive('designs') && window.__scene.buildings.printing.length === 1, null, { timeout: 8000 }).catch(() => fail('Enter did not print the House'));
  const started = await ev(() => {
    const s = window.__scene, b = s.buildings.printing[0];
    return { design: b?.design, lot: s.townState.civic[b?.id], trails: s.bioworks.trails.map((t) => t.id).filter((id) => id.startsWith(b?.id)), printer: s.buildings.printers.get(b?.id)?.bio, cost: b?.cost, supplies: { ...s.supplies, ember: s.embers }, ms: b?.printMs };
  });
  log('started', JSON.stringify(started));
  if (started.design !== 'house' || started.lot === undefined) fail('the House is not on a lot');
  if (started.trails.length !== 2) fail('the ants do not carry its supplies from the store and the Cems from the bed');
  if (!started.printer) fail('no printer guides the Cems');
  for (const [k, n] of Object.entries(started.cost ?? {})) if (Math.round((before[k] ?? 0) - (started.supplies[k] ?? 0)) !== n) fail(`the House did not take ${n} ${k} (${before[k]} -> ${started.supplies[k]})`);
  await page.waitForTimeout(3200); // the camera's look at it

  // 5. it rises with the clock, the top rows still living Cems; then it stands, lit, and the Nursery opens
  await ev(() => { const b = window.__scene.buildings.printing[0]; b.printStart = Date.now() - b.printMs * 0.5; });
  await page.waitForTimeout(800);
  const half = await ev(() => { const s = window.__scene, b = s.buildings.printing[0], p = s.buildings.placed.get(b.id); s.player.setPosition(b.x - 50, b.y + 26); return { cut: p.cem.cut, volume: p.cem.m.volume, fraction: s.buildings.fraction(b) }; });
  log('half', JSON.stringify(half));
  if (!(half.cut > 0 && half.cut < half.volume)) fail('the House did not rise part way');
  await page.waitForTimeout(500);
  await shot('bio-printing');
  const mood0 = await ev(() => window.__scene.buildings.homeMood);
  log('scenes', JSON.stringify(await ev(() => window.__game.scene.getScenes(true).map((x) => x.scene.key))));
  await ev(() => { const b = window.__scene.buildings.printing[0]; b.printStart = Date.now() - b.printMs - 50; });
  await page.waitForFunction(() => window.__scene.buildings.list.some((b) => b.design === 'house' && b.built), null, { timeout: 6000 }).catch(() => fail('the House never finished'));
  await page.waitForTimeout(1500);
  const done = await ev(() => {
    const s = window.__scene, b = s.buildings.list.find((x) => x.design === 'house'), p = s.buildings.placed.get(b.id);
    return { lights: p.cem.lights.length, solid: !!p.solid, mood: s.buildings.homeMood, nursery: s.buildings.whyNot('nursery'), ending: s.bioworks.trails.filter((t) => t.id.startsWith(b.id)).every((t) => t.ending), printer: s.buildings.printers.has(b.id) };
  });
  log('done', JSON.stringify(done));
  if (!done.solid) fail('the finished House is not solid');
  if (!done.lights) fail('the House\'s windows did not light');
  if (!(done.mood > mood0)) fail('the House did not lift the mood');
  if (done.nursery?.startsWith('NEEDS')) fail('the House did not open the Cem Nursery');
  if (!done.ending) fail('the ants did not go home');
  await shot('bio-house');

  // 6. a Storehouse raises the store; two prints at once and the bed is busy
  const cap = await ev(async () => {
    const s = window.__scene, c0 = s.warren.cap;
    for (const k of ['salt', 'iron', 'quartz', 'copper', 'wood']) s.supplies[k] = 38;
    const st = s.buildings.print('storehouse');
    st.printStart = Date.now() - st.printMs - 50;
    await new Promise((r) => setTimeout(r, 1200));
    for (const k of ['salt', 'iron', 'quartz', 'copper', 'wood']) s.supplies[k] = 38;
    s.addEmbers(40);
    const a = s.buildings.print('lantern'), b = s.buildings.print('lantern');
    return { before: c0, after: s.warren.cap, busy: s.buildings.whyNot('house'), two: !!a && !!b, locked: s.buildings.whyNot('supercomputer') };
  });
  log('cap', JSON.stringify(cap));
  if (cap.after - cap.before !== CAT.gives.storehouseCap) fail(`a Storehouse did not raise the store by ${CAT.gives.storehouseCap} (${cap.before} -> ${cap.after})`);
  if (!cap.two || cap.busy !== 'THE CEMS ARE BUSY') fail(`the Cems do not take two prints at once and then say they are busy (${cap.busy})`);
  if (!cap.locked?.startsWith('NEEDS')) fail('the Supercomputer is open from the start');

  // 7. saved: one lantern's time runs out while nobody plays; after a reload it stands, the other still rises
  await ev(async () => {
    const s = window.__scene, ls = s.buildings.printing;
    ls[0].printStart = Date.now() - ls[0].printMs * 3;
    ls[1].printStart = Date.now() - ls[1].printMs * 0.2;
    s.buildings.save();
    await s.saver.flushPlanet();
  });
  await page.waitForTimeout(600);
  await page.goto(`http://localhost:${port}/Replicated/?local&hour=13&rain=0`);
  await page.waitForFunction(() => window.__game?.scene.isActive('home') || !!window.__scene?.player, null, { timeout: 30000 });
  if (await ev(() => window.__game.scene.isActive('home'))) { await page.waitForTimeout(1200); await page.mouse.click(480, 294); }
  await page.waitForFunction(() => !!window.__scene?.player && !!window.__scene.buildings, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const after = await ev(() => {
    const s = window.__scene, d = s.buildings.list.filter((b) => b.design);
    return { designs: d.map((b) => `${b.design}:${b.built ? 'built' : Math.round(s.buildings.fraction(b) * 100) + '%'}`), awake: s.bioworks.awake, flows: s.bioworks.trails.filter((t) => t.id !== 'forage').length, cap: s.warren.cap };
  });
  log('after reload', JSON.stringify(after));
  if (!after.designs.includes('house:built') || !after.designs.includes('storehouse:built')) fail('the finished designs did not survive a reload');
  if (after.designs.filter((x) => x.startsWith('lantern:built')).length !== 1) fail('the print whose time ran out while away does not stand finished');
  if (!after.designs.some((x) => /^lantern:\d+%$/.test(x))) fail('the print still under way did not carry on after a reload');
  if (!after.awake || after.flows !== 2) fail('the Cems are asleep, or the ants are not carrying for the print still under way');
  log('errors', JSON.stringify(errors));
} finally {
  await b.close();
  try { process.kill(-server.pid); } catch { /* the preview server already stopped */ }
}
process.exit(errors.length ? 1 : 0);
