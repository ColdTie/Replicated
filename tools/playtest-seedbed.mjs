// Scripted headless playtest of the travelling Cem bed (src/entities/Bioworks.ts, src/scenes/planet/Trade.ts,
// bioworks.json seed): the homeworld's sleeping Cems give the ship nothing; once the Printworks stands and they wake,
// launching takes a culture of them aboard; landing on a world without a bed, a ghost of the flat waits by the square;
// standing on it without the salt does nothing, with it the culture breaks open and the bed wakes at once; its design
// stone opens the designs and a House is printed there; after a reload the bed, its stone and the print are still there.
// Usage: npm run build && node tools/playtest-seedbed.mjs   (saves screenshots/seedbed-*.png; fails loudly on page errors)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { chromium } from 'playwright';
const port = 4202;
const HW = JSON.parse(fs.readFileSync('src/data/homeworld.json', 'utf8'));
const BIO = JSON.parse(fs.readFileSync('src/data/bioworks.json', 'utf8'));
const TO = { star: 'trappist-1', planet: 5 };
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
  await page.goto(URL);
  await page.waitForFunction(() => !!window.__scene?.player, null, { timeout: 30000 });

  // the opening, quickly: Thales' word, the name
  await page.waitForFunction(() => !!window.__scene.talker.talk?.script, null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  if (await ev(() => !!window.__scene.talker.talk)) await page.keyboard.press('Enter');
  await page.waitForSelector('.ov input', { timeout: 8000 });
  await page.type('.ov input', 'Sower');
  await page.click('.ov button');
  await page.waitForFunction(() => !window.__scene.player.locked, null, { timeout: 10000 });

  // 1. the Cems asleep: nothing to take aboard
  const asleep = await ev(() => { const s = window.__scene; s.trade.loadCulture(); return { awake: s.bioworks.awake, culture: window.__session.replicant.traits.culture ?? null }; });
  log('asleep', JSON.stringify(asleep));
  if (asleep.awake || asleep.culture) fail('a culture went aboard while the Cems slept');

  // 2. finish the Printworks: the Cems wake
  await ev(async (goal) => {
    const s = window.__scene, bl = s.buildings.list.find((x) => x.id === goal);
    const aim = { x: 1, y: 0, lengthSq: () => 1 };
    s.player.setPosition(bl.x - bl.w * 8 - 6, bl.y);
    for (let i = 0; i < 80 && !bl.built; i++) { s.resolveAttack(bl.x - bl.w * 8 + 4, bl.y - 4, 14, aim); await new Promise((r) => setTimeout(r, 40)); }
  }, HW.goal);
  await page.waitForFunction(() => window.__scene.bioworks.awake, null, { timeout: 8000 }).catch(() => fail('the Cems did not wake when the Printworks was finished'));
  await page.waitForTimeout(1200);

  // 3. launch: the hold takes a culture of the awake Cems
  await ev((to) => { const s = window.__scene; s.embers = 300; s.player.setPosition(s.boardSpot.x, s.boardSpot.y); s.departure.launch(to.star, to.planet); }, TO);
  await page.waitForTimeout(400);
  const aboard = await ev(() => window.__session.replicant.traits.culture ?? null);
  log('aboard', JSON.stringify(aboard));
  if (aboard?.from !== 'lhs-1140:2') fail('launching from the awake bed did not take a culture aboard');
  await page.waitForFunction(() => window.__game.scene.isActive('travel'), null, { timeout: 30000 }).catch(() => fail('the ship did not leave'));
  await page.waitForTimeout(1500);
  await ev(() => { const t = window.__game.scene.getScene('travel'); t.j.arrives_at = new Date(Date.now() - 1000).toISOString(); });
  await page.waitForFunction((to) => window.__game.scene.isActive('planet') && window.__scene?.player && window.__scene.planet.star === to.star && !!window.__scene.bioworks, TO, { timeout: 60000 }).catch(() => fail('the ship did not land'));
  await page.waitForFunction(() => !window.__scene.player.locked, null, { timeout: 20000 }).catch(() => fail('the landing never gave the player back'));
  await page.waitForTimeout(800);

  // 4. a world without a bed: its ghost waits on a lot, the culture still aboard
  const ghost = await ev(() => { const s = window.__scene, bw = s.bioworks; return { active: bw.active, ghost: !!bw.ghost, center: bw.center, lot: bw.lot?.index, fromSquare: Math.round(Math.hypot(bw.center.x - s.baseCenter.x, bw.center.y - s.baseCenter.y)), culture: window.__session.replicant.traits.culture ?? null }; });
  log('ghost', JSON.stringify(ghost));
  if (ghost.active || !ghost.ghost) fail('no ghost of a bed on a world without one, with a culture aboard');
  if (ghost.lot === undefined || ghost.fromSquare > 320) fail(`the ghost is not on a lot near the square (${ghost.fromSquare} px)`);
  if (!ghost.culture) fail('the culture did not stay in the hold');

  // 5. standing on it without the salt: nothing; with the salt: the bed is seeded and wakes
  await ev(() => { const s = window.__scene, bw = s.bioworks; s.supplies.salt = 3; s.markSupplies(); s.player.setPosition(bw.center.x + 30, bw.center.y + 40); });
  await page.waitForTimeout(500);
  await shot('seedbed-ghost');
  await ev(() => { const s = window.__scene, bw = s.bioworks; s.player.setPosition(bw.center.x, bw.center.y); });
  await page.waitForTimeout(1200);
  const poor = await ev(() => ({ active: window.__scene.bioworks.active, salt: window.__scene.supplies.salt }));
  if (poor.active || poor.salt !== 3) fail('the bed was seeded without the salt');
  await ev(() => { const s = window.__scene; s.supplies.salt = 14; s.markSupplies(); });
  await page.waitForFunction(() => window.__scene.bioworks.active && window.__scene.bioworks.awake, null, { timeout: 8000 }).catch(() => fail('standing on the ghost with the salt did not seed the bed'));
  await page.waitForTimeout(1500);
  const seeded = await ev(() => {
    const s = window.__scene, bw = s.bioworks;
    return { salt: s.supplies.salt, lot: s.townState.civic.cembed, plinth: !!bw.plinth, ghost: !!bw.ghost, cems: bw.mats.length, blooms: s.nodes.filter((n) => n.key?.startsWith('bed')).length, forage: bw.trails.some((t) => t.id === 'forage'), surface: s.footSurface(bw.center.x, bw.center.y) };
  });
  log('seeded', JSON.stringify(seeded));
  if (seeded.salt !== 14 - BIO.seed.cost.salt) fail(`seeding did not take ${BIO.seed.cost.salt} salt (${seeded.salt} left)`);
  if (seeded.lot === undefined || !seeded.plinth || seeded.ghost) fail('the seeded bed has no lot or design stone, or its ghost stayed');
  if (seeded.cems < 8 || seeded.blooms < 3 || !seeded.forage) fail('the seeded bed lacks its Cems, blooms or ants');
  if (seeded.surface !== 'salt') fail(`footsteps on the seeded flat are not salt (${seeded.surface})`);
  await ev(() => { const s = window.__scene, bw = s.bioworks; s.player.setPosition(bw.center.x - 40, bw.center.y + 44); });
  await page.waitForTimeout(800);
  await shot('seedbed-awake');

  // 6. its design stone opens the designs; a House is printed on this world
  await ev(() => { const s = window.__scene; for (const k of ['salt', 'iron', 'quartz', 'copper', 'wood']) s.supplies[k] = 38; s.markSupplies(); s.addEmbers(40); });
  await ev(() => { const s = window.__scene, bw = s.bioworks, p = bw.plinth; bw.readyAt = 0; s.player.setPosition(p.x, p.dir > 0 ? p.y + 6 : p.y - 8); });
  await page.waitForFunction(() => window.__game.scene.isActive('designs') && window.__designs?.rows?.length, null, { timeout: 8000 }).catch(() => fail('standing at the design stone did not open the designs'));
  await page.waitForTimeout(500);
  const house = await ev(() => window.__designs.rows.find((r) => r.id === 'house')?.why ?? null);
  if (house) fail(`the House cannot be printed on the seeded world: ${house}`);
  for (let i = 0; i < 12 && (await ev(() => window.__designs.rows[window.__designs.index].id)) !== 'house'; i++) { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(80); }
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !window.__game.scene.isActive('designs') && window.__scene.buildings.printing.length === 1, null, { timeout: 8000 }).catch(() => fail('Enter at the design stone did not print the House'));
  await page.waitForTimeout(3400);
  const printing = await ev(() => { const s = window.__scene, b = s.buildings.printing[0]; return { design: b?.design, trails: s.bioworks.trails.filter((t) => t.id.startsWith(b?.id)).length }; });
  log('printing', JSON.stringify(printing));
  if (printing.design !== 'house' || printing.trails !== 2) fail('the House is not printed with the ants carrying for it');
  await ev(() => { const s = window.__scene, b = s.buildings.printing[0]; b.printStart = Date.now() - b.printMs * 0.6; s.player.setPosition(b.x - 50, b.y + 26); });
  await page.waitForTimeout(900);
  await shot('seedbed-printing');
  await ev(async () => { const s = window.__scene; s.buildings.save(); await s.saver.flushPlanet(); await s.saver.saveReplicant(); });
  await page.waitForTimeout(600);

  // 7. a reload: the bed is still here and awake, with its stone, and the House still rises
  await page.goto(URL);
  await page.waitForFunction(() => window.__game?.scene.isActive('home') || !!window.__scene?.player, null, { timeout: 30000 });
  if (await ev(() => window.__game.scene.isActive('home'))) { await page.waitForTimeout(1200); await page.mouse.click(480, 294); }
  await page.waitForFunction(() => !!window.__scene?.player && !!window.__scene.buildings, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const after = await ev(() => { const s = window.__scene, bw = s.bioworks; return { star: s.planet.star, active: bw.active, awake: bw.awake, plinth: !!bw.plinth, ghost: !!bw.ghost, designs: s.buildings.list.filter((b) => b.design).map((b) => b.design), saved: !!window.__session.planet?.data.cembed }; });
  log('after reload', JSON.stringify(after));
  if (after.star !== TO.star) fail('the reload did not come back to the seeded world');
  if (!after.active || !after.awake || !after.plinth || after.ghost || !after.saved) fail('the seeded bed did not survive a reload awake with its stone');
  if (!after.designs.includes('house')) fail('the House printed on the seeded world was lost');
  log('errors', JSON.stringify(errors));
} finally {
  await b.close();
  try { process.kill(-server.pid); } catch { /* the preview server already stopped */ }
}
process.exit(errors.length ? 1 : 0);
