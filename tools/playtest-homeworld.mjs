// Scripted headless playtest of the start (story/STORY.md): the first player is made by itself and wakes on LHS 1140 b. The scan finishes,
// Thales says "Wake up. It's time." in the talk box, the visor comes on and you can move; Thales lives there (no lot,
// never handed over), the Metanoia structures stand on the civic lots, the half printed Printworks has its printer,
// and your blows print it to the end. A copy is made held asleep, given to a new player, and the new player wakes in
// it from the home screen and names itself.
// Usage: npm run build && node tools/playtest-homeworld.mjs   (saves screenshots/opening-*.png; fails loudly on page errors)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { chromium } from 'playwright';
const port = 4197;
const HW = JSON.parse(fs.readFileSync('src/data/homeworld.json', 'utf8'));
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
for (;;) { try { if ((await fetch(`http://localhost:${port}/Replicated/`)).ok) break; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 200)); }
const errors = [];
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const log = (...a) => console.log(...a);
const fail = (m) => { errors.push(m); log('FAIL', m); };
const shot = (page, name) => page.screenshot({ path: `screenshots/${name}.png` });
try {
  const page = await b.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  // a first visit on this device: nobody yet, and no card to add one; the game makes Thales' first copy by itself
  await page.goto(`http://localhost:${port}/Replicated/?local&hour=13&rain=0`);
  await page.waitForFunction(() => !!window.__scene?.player, null, { timeout: 30000 });
  const ev = (f, arg) => page.evaluate(f, arg);

  // 1. the opening: you stand on the Replicator's ring, dark, locked, with Thales beside you
  await page.waitForTimeout(800);
  const start = await ev(() => {
    const s = window.__scene;
    return { planet: s.planet.id, star: s.planet.star, locked: s.player.locked, onRing: Math.hypot(s.player.x - s.base.spotX, s.player.y - s.base.spotY) < 4, thales: s.npcs.filter((n) => n.data.traits.thales).map((n) => n.data.name), lit: s.player.light.active };
  });
  log('start', JSON.stringify(start));
  if (start.planet !== 'homeworld' || start.star !== 'lhs-1140') fail(`the game did not start on LHS 1140 b (${start.planet})`);
  if (!start.locked || !start.onRing) fail('the new Vessel is not held on the Replicator\'s ring');
  if (start.lit) fail('the visor was on before Thales spoke');
  if (start.thales.length !== 1 || start.thales[0] !== HW.thales.name) fail(`Thales is not there exactly once: ${start.thales}`);
  await shot(page, 'opening-scan');

  // 2. Thales speaks his word in the talk box, in his own voice
  await page.waitForFunction(() => !!window.__scene.talker.talk?.script, null, { timeout: 15000 });
  await page.waitForTimeout(2500);
  const box = await ev(() => { const s = window.__scene, ui = s.scene.get('ui'); return { name: s.talker.talk.npc.data.name, text: ui.talkBox.page?.lines.map((l) => l.map((x) => x.text).join('')).join(' '), open: ui.talkBox.isOpen, reply: ui.talkBox.canReply }; });
  log('box', JSON.stringify(box));
  if (box.name !== 'Thales' || box.text !== HW.thales.line || !box.open) fail(`Thales did not say "${HW.thales.line}" (${box.name}: ${box.text})`);
  if (box.reply) fail('the opening line offered a reply');
  await shot(page, 'opening-thales');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  if (await ev(() => !!window.__scene.talker.talk)) await page.keyboard.press('Enter');

  // 3. the visor flickers on, the new Vessel names itself (a space in the name types), and the game begins
  await page.waitForSelector('.ov input', { timeout: 5000 }).catch(() => fail('the new Vessel was not asked its name'));
  await shot(page, 'opening-name');
  await page.type('.ov input', 'Io Prime');
  await page.click('.ov button');
  await page.waitForTimeout(1200);
  const woke = await ev(async () => { const s = window.__scene, me = window.__session.replicant; return { locked: s.player.locked, lit: s.player.light.active, awake: !!me.traits.awake, name: me.name, unnamed: me.traits.unnamed, profiles: (await window.__session.store.listProfiles()).map((p) => p.name) }; });
  log('woke', JSON.stringify(woke));
  if (woke.locked || !woke.lit || !woke.awake) fail('the visor did not come on, or you cannot move');
  if (woke.name !== 'Io Prime' || woke.unnamed || woke.profiles.join() !== 'Io Prime') fail('the new Vessel did not take its name');

  // 4. the homeworld as Thales left it: his structures on the civic lots, the goal half printed with its printer
  const world = await ev(async (goal) => {
    const s = window.__scene, th = s.npcs.find((n) => n.data.traits.thales);
    return {
      buildings: s.buildings.list.map((x) => ({ id: x.id, built: x.built, civic: s.townState.civic[x.id] !== undefined })),
      goal: s.buildings.list.find((x) => x.id === goal), printers: [...s.buildings.printers.keys()],
      replicator: s.base.built, founded: s.pending.founded || (await window.__session.store.loadPlanet(s.planet.star, s.planet.planetIndex, 0)).data.founded, thalesLot: s.townState.lots[th.data.id],
    };
  }, HW.goal);
  log('world', JSON.stringify({ ...world, goal: world.goal && { progress: world.goal.progress, built: world.goal.built } }));
  if (world.buildings.length !== HW.founded.length || world.buildings.some((x) => !x.civic)) fail('the Metanoia structures are not all on civic lots');
  if (!world.goal || world.goal.built || !world.goal.progress) fail('the Printworks is not half printed');
  if (!world.printers.includes(HW.goal)) fail('no printer stands by the Printworks');
  if (!world.replicator) fail('the Replicator Thales used is not on its pad');
  if (!world.founded) fail('the founding is not saved');
  if (world.thalesLot !== undefined) fail('Thales was given a home lot');

  // 5. Thales walks to his unfinished work; the printer calls for hands
  await page.waitForFunction((goal) => { const s = window.__scene, th = s.npcs.find((n) => n.data.traits.thales), b = s.buildings.list.find((x) => x.id === goal); return Math.hypot(th.x - b.x, th.y - b.y) < 140; }, HW.goal, { timeout: 20000 }).catch(() => undefined);
  const near = await ev((goal) => { const s = window.__scene, th = s.npcs.find((n) => n.data.traits.thales), b = s.buildings.list.find((x) => x.id === goal); return Math.hypot(th.x - b.x, th.y - b.y); }, HW.goal);
  log('thales from the goal', Math.round(near));
  if (near > 140) fail('Thales did not go to his unfinished work');

  // 6. your blows print it: the head moves with every one, and the last one finishes it
  const printed = await ev(async (goal) => {
    const s = window.__scene, bl = s.buildings.list.find((x) => x.id === goal), p = s.buildings.printers.get(goal);
    const aim = { x: 1, y: 0, lengthSq: () => 1 };
    s.player.setPosition(bl.x - bl.w * 8 - 6, bl.y);
    let pulses = 0; const pulse = p.pulse.bind(p); p.pulse = () => { pulses++; pulse(); };
    for (let i = 0; i < 80 && !bl.built; i++) { s.resolveAttack(bl.x - bl.w * 8 + 4, bl.y - 4, 14, aim); await new Promise((r) => setTimeout(r, 40)); }
    return { built: bl.built, pulses, done: p.done };
  }, HW.goal);
  log('printed', JSON.stringify(printed));
  if (!printed.built) fail('the Printworks could not be finished');
  if (!printed.pulses) fail('the printer did not move with the blows');
  if (!printed.done) fail('the printer did not power down once the work was done');
  await page.waitForTimeout(1200);
  await shot(page, 'opening-printed');

  // 7. Thales is nobody's to hand over
  const rest = await ev(async () => {
    const s = window.__scene, th = s.npcs.find((n) => n.data.traits.thales);
    window.__session.replicant.traits.sparks = 1;
    await s.minds.awakenCopy(th.data.id);
    return { stillNpc: (await window.__session.store.listNpcs(s.planet.star, s.planet.planetIndex)).some((r) => r.traits.thales && r.status === 'npc'), sparks: window.__session.replicant.traits.sparks };
  });
  log('rest', JSON.stringify(rest));
  if (!rest.stillNpc || rest.sparks !== 1) fail('Thales could be handed over');

  // 8. a copy made at the Replicator: the choice opens; HOLD keeps it asleep in your likeness, with no mind
  await ev(() => { const s = window.__scene; s.embers = 45; s.player.setPosition(s.base.spotX, s.base.spotY); s.player.locked = false; s.tryReplicate(); });
  await page.waitForFunction(() => !!window.__scene.choice, null, { timeout: 5000 }).catch(() => fail('no wake or hold choice'));
  await page.waitForTimeout(400);
  await shot(page, 'choice-wake-hold');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  if ((await ev(() => window.__scene.choice?.kind)) !== 'hold') fail('Right did not move to HOLD');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !window.__scene.replicating && window.__scene.npcs.some((n) => n.held && n.data.id !== 'pending'), null, { timeout: 30000 }).catch(() => fail('no held Vessel'));
  const held = await ev(() => { const s = window.__scene, n = s.npcs.find((x) => x.held), me = window.__session.replicant; return { id: n.data.id, name: n.data.name, traits: n.data.traits, sameBody: JSON.stringify(n.data.traits.body) === JSON.stringify(me.traits.body), state: n.state }; });
  log('held', JSON.stringify({ ...held, traits: { held: held.traits.held, blank: held.traits.blank } }));
  if (!held.traits.held || held.traits.blank || !held.sameBody) fail('the held Vessel is not asleep in its maker\'s likeness');
  await page.waitForTimeout(800);
  await shot(page, 'held-vessel');

  // 9. given to a new player: a new profile in its name; on the home screen its card wakes it, and it names itself
  await ev((id) => window.__scene.awakenCopy(id), held.id);
  const given = await ev(async (id) => ({ profiles: (await window.__session.store.listProfiles()).map((p) => p.name), npc: window.__scene.npcs.some((n) => n.data.id === id) }), held.id);
  log('given', JSON.stringify(given));
  if (given.npc || !given.profiles.includes(held.name)) fail('the held Vessel was not handed over');
  await ev(() => window.__scene.saver.flushPlanet());
  await page.goto(`http://localhost:${port}/Replicated/?local&hour=13&rain=0`);
  await page.waitForFunction(() => window.__game?.scene.isActive('home'), null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  await shot(page, 'home-profiles');
  const cards = await ev(() => window.__game.scene.getScene('home').cards.length);
  if (cards !== 2) fail(`the home screen does not show exactly the two Vessels (${cards} cards)`);
  // the second card (the new player's)
  await page.mouse.click(566, 294);
  await page.waitForFunction(() => !!window.__scene?.player, null, { timeout: 30000 });
  await page.waitForSelector('.ov input', { timeout: 15000 }).catch(() => fail('the new player was not asked its name'));
  const first = await ev(() => ({ who: window.__session.replicant.id, locked: window.__scene.player.locked }));
  if (first.who !== held.id) fail('the new player did not wake in the held Vessel');
  await page.type('.ov input', 'Wren');
  await page.click('.ov button');
  await page.waitForTimeout(1200);
  const second = await ev(async () => ({ name: window.__session.replicant.name, locked: window.__scene.player.locked, lit: window.__scene.player.light.active, profiles: (await window.__session.store.listProfiles()).map((p) => p.name) }));
  log('new player', JSON.stringify(second));
  if (second.name !== 'Wren' || second.locked || !second.lit || !second.profiles.includes('Wren')) fail('the new player did not wake and name itself');
  log('errors', JSON.stringify(errors));
} finally {
  await b.close();
  try { process.kill(-server.pid); } catch { /* the preview server already stopped */ }
}
process.exit(errors.length ? 1 : 0);
