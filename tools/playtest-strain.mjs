// Scripted headless playtest of the strain (bioworks.json strain; src/entities/WildCems.ts sample, src/entities/Bioworks.ts
// alter) and of skipping a trip (TravelScene SKIP): on the homeworld the Printworks stands and a Biolab with it; the ship
// flies to Gliese 12 b and SKIP lands it at once; walking among wild Cems puts a jar of them in the hold; Space skips the
// trip home; at the Biolab's door they are changed into the strain, the bed takes it up and prints faster, the hold's
// culture carries it; after a reload all of it is still there.
// Usage: npm run build && node tools/playtest-strain.mjs   (saves screenshots/strain-*.png; fails loudly on page errors)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { chromium } from 'playwright';
const port = 4204;
const HW = JSON.parse(fs.readFileSync('src/data/homeworld.json', 'utf8'));
const BIO = JSON.parse(fs.readFileSync('src/data/bioworks.json', 'utf8'));
const CEMS = { star: 'gliese-12', planet: 1 }, HOME = { star: 'lhs-1140', planet: 2 };
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
  const landedOn = (to, what) => page.waitForFunction((t) => window.__game.scene.isActive('planet') && window.__scene?.player && window.__scene.planet.star === t.star && !!window.__scene.bioworks, to, { timeout: 30000 })
    .then(() => page.waitForFunction(() => !window.__scene.player.locked, null, { timeout: 20000 }))
    .catch(() => fail(`${what} did not land`));
  await page.goto(URL);
  await page.waitForFunction(() => !!window.__scene?.player, null, { timeout: 30000 });

  // the opening, quickly: Thales' word, the name
  await page.waitForFunction(() => !!window.__scene.talker.talk?.script, null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  if (await ev(() => !!window.__scene.talker.talk)) await page.keyboard.press('Enter');
  await page.waitForSelector('.ov input', { timeout: 8000 });
  await page.type('.ov input', 'Grower');
  await page.click('.ov button');
  await page.waitForFunction(() => !window.__scene.player.locked, null, { timeout: 10000 });

  // 1. the Printworks stands, the Cems wake, a Biolab stands; how long a House takes with the ordinary Cems
  const before = await ev(async (goal) => {
    const s = window.__scene;
    s.buildings.finishNow(goal);
    s.bioworks.wake(false);
    const lab = s.buildings.standNow('biolab');
    s.buildings.save();
    await s.saver.flushPlanet();
    return { awake: s.bioworks.awake, lab: !!lab, ms: s.buildings.printMsFor('house'), strain: s.bioworks.strain ?? null };
  }, HW.goal);
  log('before', JSON.stringify(before));
  if (!before.awake || !before.lab || before.strain) fail('no awake bed and Biolab to start from');

  // 2. without wild Cems aboard the Biolab's door does nothing
  await ev(() => { const s = window.__scene, lab = s.buildings.list.find((x) => x.design === 'biolab'); s.player.setPosition(lab.x, lab.y + 6); });
  await page.waitForTimeout(1200);
  if (await ev(() => !!window.__scene.bioworks.strain)) fail('the Biolab made the strain without wild Cems');

  // 3. fly to Gliese 12 b; SKIP lands the ship at once
  await ev((to) => { const s = window.__scene; s.embers = 400; s.player.setPosition(s.boardSpot.x, s.boardSpot.y); s.departure.launch(to.star, to.planet); }, CEMS);
  await page.waitForFunction(() => window.__game.scene.isActive('travel'), null, { timeout: 30000 }).catch(() => fail('the ship did not leave'));
  await page.waitForTimeout(700);
  await shot('strain-travel-skip');
  const left = await ev(() => { const t = window.__game.scene.getScene('travel'); return Date.parse(t.j.arrives_at) - Date.now(); });
  const t0 = Date.now();
  await page.mouse.click(960 - 62 * 2, 18 * 2);
  await landedOn(CEMS, 'SKIP');
  log('skip', JSON.stringify({ tripLeftMs: left, tookMs: Date.now() - t0 }));
  await page.waitForTimeout(800);

  // 4. among wild Cems: a jar of them goes into the hold
  if (await ev(() => window.__session.replicant.traits.wild)) fail('wild Cems were aboard before the field');
  await ev(() => { const s = window.__scene, c = s.baseCenter, f = [...s.wild.fields].sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0]; s.player.setPosition(f.x, f.y); s.cameras.main.centerOn(f.x, f.y); });
  await page.waitForFunction(() => !!window.__session.replicant.traits.wild, null, { timeout: 5000 }).catch(() => fail('walking among wild Cems took none aboard'));
  await page.waitForTimeout(700);
  await shot('strain-sample');
  const wild = await ev(() => window.__session.replicant.traits.wild);
  log('wild', JSON.stringify(wild));
  if (wild?.from !== 'gliese-12:1') fail('the wild Cems aboard do not come from Gliese 12 b');
  await page.waitForTimeout(1500);

  // 5. home: Space skips the trip
  await ev((to) => { const s = window.__scene; s.embers = 400; s.player.setPosition(s.boardSpot.x, s.boardSpot.y); s.departure.launch(to.star, to.planet); }, HOME);
  await page.waitForFunction(() => window.__game.scene.isActive('travel'), null, { timeout: 30000 }).catch(() => fail('the ship did not leave the Cems\' world'));
  await page.waitForTimeout(500);
  await page.keyboard.press('Space');
  await landedOn(HOME, 'Space');
  await page.waitForTimeout(800);

  // 6. at the Biolab's door the wild Cems are changed: the bed takes up the strain and prints faster
  await ev(() => { const s = window.__scene, lab = s.buildings.list.find((x) => x.design === 'biolab' && x.built); s.player.setPosition(lab.x, lab.y + 6); s.cameras.main.centerOn(lab.x, lab.y - 10); });
  await page.waitForTimeout(1600);
  await shot('strain-altering');
  await page.waitForFunction(() => window.__scene.bioworks.strain === 'swift', null, { timeout: 10000 }).catch(() => fail('the Biolab did not change the wild Cems'));
  await page.waitForTimeout(800);
  const after = await ev(() => { const s = window.__scene, me = window.__session.replicant; return { wild: me.traits.wild ?? null, culture: me.traits.culture ?? null, ms: s.buildings.printMsFor('house'), saved: window.__session.planet?.data.cembed?.strain ?? null, breath: s.bioworks.mats[0]?.sprite.anims.timeScale }; });
  log('after', JSON.stringify(after));
  if (after.wild) fail('the wild Cems stayed in the hold');
  if (after.culture?.strain !== BIO.strain.id) fail('the hold\'s culture does not carry the strain');
  if (Math.abs(after.ms - before.ms * BIO.strain.printTimes) > 2) fail(`a House does not print faster with the strain (${before.ms} -> ${after.ms})`);
  if (after.saved !== BIO.strain.id) fail('the bed\'s strain was not saved');
  if (Math.abs(after.breath - BIO.strain.breath) > 0.01) fail('the strain\'s Cems do not breathe quicker');
  const bed = await ev(() => { const s = window.__scene, bw = s.bioworks; s.player.setPosition(bw.center.x - 30, bw.center.y + 36); s.cameras.main.centerOn(bw.center.x, bw.center.y); return bw.center; });
  await page.waitForTimeout(900);
  await shot('strain-bed');
  void bed;
  await ev(async () => { const s = window.__scene; await s.saver.flushPlanet(); await s.saver.saveReplicant(); });
  await page.waitForTimeout(600);

  // 7. a reload: the strain is still in the bed and the hold
  await page.goto(URL);
  await page.waitForFunction(() => window.__game?.scene.isActive('home') || !!window.__scene?.player, null, { timeout: 30000 });
  if (await ev(() => window.__game.scene.isActive('home'))) { await page.waitForTimeout(1200); await page.mouse.click(480, 294); }
  await page.waitForFunction(() => !!window.__scene?.player && !!window.__scene.buildings && !!window.__scene.bioworks, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const reload = await ev(() => { const s = window.__scene, me = window.__session.replicant; return { star: s.planet.star, strain: s.bioworks.strain ?? null, culture: me.traits.culture?.strain ?? null, wild: me.traits.wild ?? null, ms: s.buildings.printMsFor('house') }; });
  log('after reload', JSON.stringify(reload));
  if (reload.star !== HOME.star || reload.strain !== BIO.strain.id || reload.culture !== BIO.strain.id || reload.wild) fail('the strain did not survive a reload');
  log('errors', JSON.stringify(errors));
} finally {
  await b.close();
  try { process.kill(-server.pid); } catch { /* the preview server already stopped */ }
}
process.exit(errors.length ? 1 : 0);
