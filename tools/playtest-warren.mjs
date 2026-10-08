// Scripted headless playtest of the warren: a copy's mind marks out a room, a copy goes down the hatch and digs it,
// the copy with no bed makes itself a resting station, the player climbs down, walks the warren and climbs back up.
// Usage: npm run build && node tools/playtest-warren.mjs   (prints each step; fails loudly on page errors)
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const port = 4183;
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
for (;;) { try { if ((await fetch(`http://localhost:${port}/Replicated/`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }
const errors = [];
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const log = (...a) => console.log(...a);
const fail = (m) => { errors.push(m); log('FAIL', m); };
try {
  const page = await b.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://localhost:${port}/Replicated/?shot=1&local&copies=2&hour=21&view=base`);
  await page.waitForFunction(() => !!window.__scene?.player && window.__scene.npcs.length === 2, null, { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.mouse.click(480, 270);
  const ev = (f, arg) => page.evaluate(f, arg);

  // 1. the layout engine, as the mind would drive it
  const planned = await ev(() => {
    const s = window.__scene;
    const r = s.warren.dig(s.npcs[0], { type: 'dig', kind: 'hall', name: 'Hearth', size: 'small', beside: 'Entrance', direction: 'south', purpose: 'A place to meet.' });
    const r2 = s.warren.dig(s.npcs[1], { type: 'dig', kind: 'garden', name: 'Grove', size: 'medium', beside: 'Hearth', direction: 'east', purpose: 'Green.' });
    const none = s.warren.dig(s.npcs[1], { type: 'dig', kind: 'hall', name: 'Nowhere', size: 'large', beside: 'Mars', direction: 'north', purpose: '' });
    return { r: r && { name: r.name, x: r.x, y: r.y, w: r.w, h: r.h, dir: r.dir, link: r.link, dug: r.dug }, r2: r2 && { name: r2.name, dir: r2.dir, link: r2.link }, fallbackAnchor: none && none.link, rooms: s.warren.data.rooms.length, hatch: s.warren.hatch, opened: s.warren.opened };
  });
  log('planned', JSON.stringify(planned));
  if (!planned.r || !planned.r2 || planned.rooms !== 3) fail('rooms were not planned');
  if (planned.opened) fail('hatch open before anything is dug');

  // 2. a copy goes down and digs (work in the pool, copies idle)
  await ev(() => { const s = window.__scene; s.village.work = 30; s.npcs.forEach((n) => { n.state = 'idle'; n.until = 0; }); });
  await page.waitForFunction(() => window.__scene.warren.below.size > 0, null, { timeout: 25000 }).catch(() => fail('no copy went down the hatch'));
  log('below', await ev(() => JSON.stringify([...window.__scene.warren.below.values()].map((b) => ({ who: b.npc.data.name, task: b.task, room: b.room?.name, hidden: !b.npc.sprite.visible })))));
  await page.waitForFunction(() => window.__scene.warren.data.rooms.some((r) => r.dug), null, { timeout: 30000 }).catch(() => fail('room never got dug'));
  log('dug', await ev(() => JSON.stringify({ rooms: window.__scene.warren.data.rooms.map((r) => [r.name, r.dug]), work: Math.round(window.__scene.village.work * 10) / 10, opened: window.__scene.warren.opened, hatchFrame: window.__scene.warren.hatchSprite.frame.name })));

  // 3. the home drive: with a dug room and no bed, a copy makes itself a resting station
  await page.waitForFunction(() => window.__scene.warren.data.items.some((i) => i.kind === 'rest'), null, { timeout: 40000 }).catch(() => fail('nobody made a bed'));
  log('beds', await ev(() => JSON.stringify(window.__scene.warren.data.items.map((i) => [i.kind, i.room === 'entrance' ? 'entrance' : window.__scene.warren.nameOfRoom(i.room), i.for ? window.__scene.npcs.find((n) => n.data.id === i.for)?.data.name : '']))));

  // 4. the canned mind digs and furnishes on its own
  const mind = await ev(async () => {
    const s = window.__scene;
    const n = s.npcs[1];
    const acts = [];
    // the fake copies are not in the local store; the canned mind runs against the real replicant row instead
    for (let i = 0; i < 8; i++) { const r = await window.__session.store.mindTick(window.__session.replicant.id, s.mindContext(n)); acts.push(...(r?.actions ?? []).map((a) => a.type)); }
    const ctx = s.mindContext(n);
    return { acts, warren: ctx.warren, rooms: ctx.warrenRooms, hasRest: ctx.hasRest, around: ctx.around, weariness: ctx.weariness };
  });
  log('mind', JSON.stringify(mind));
  if (!mind.warren.length || !mind.rooms.includes('Entrance')) fail('mind context lacks the warren');
  if (!mind.acts.includes('dig') && !mind.acts.includes('furnish')) fail('the canned mind never dug or furnished');

  // 5. down the hatch
  await page.waitForFunction(() => window.__scene.warren.below.size === 0, null, { timeout: 30000 }).catch(() => log('note: a copy is still below'));
  await ev(() => { const s = window.__scene; s.player.locked = false; s.hatchReadyAt = 0; s.player.setPosition(s.warren.hatch.x, s.warren.hatch.y); });
  await page.waitForFunction(() => !!window.__warren && window.__warren.scene.isActive(), null, { timeout: 8000 }).catch(() => fail('warren scene did not open'));
  await page.waitForTimeout(600);
  const under = await ev(() => { const w = window.__warren; return { me: { x: Math.round(w.me.x), y: Math.round(w.me.y) }, copies: w.copies.size, items: w.items.size, planetPaused: window.__scene.scene.isPaused(), ladder: w.ladder }; });
  log('underground', JSON.stringify(under));
  if (!under.planetPaused) fail('planet kept running while below');
  // walk: hold S for a bit, must move down inside the Entrance, then stop at rock
  const y0 = under.me.y;
  await page.keyboard.down('KeyS'); await page.waitForTimeout(900); await page.keyboard.up('KeyS');
  const y1 = await ev(() => Math.round(window.__warren.me.y));
  log('walked down', y1 - y0);
  if (y1 - y0 < 10) fail('could not walk in the warren');
  await page.keyboard.down('KeyA'); await page.waitForTimeout(1500); await page.keyboard.up('KeyA');
  const x1 = await ev(() => Math.round(window.__warren.me.x));
  log('walked left to', x1, '(rock stops it inside the Entrance:', await ev(() => window.__warren.canStand(window.__warren.me.x - 12, window.__warren.me.y)), ')');

  // 6. back up the ladder
  await ev(() => { const w = window.__warren; w.me.x = w.ladder.x; w.me.y = w.ladder.y + 20; });
  await page.keyboard.down('KeyW'); await page.waitForTimeout(900); await page.keyboard.up('KeyW');
  await page.waitForFunction(() => window.__scene.scene.isActive() && !window.__scene.player.locked, null, { timeout: 8000 }).catch(() => fail('did not resurface'));
  log('resurfaced', await ev(() => { const s = window.__scene; return JSON.stringify({ at: [Math.round(s.player.x), Math.round(s.player.y)], hatch: s.warren.hatch, warrenActive: window.__warren.scene.isActive() }); }));

  // 7. save shape
  log('save', await ev(() => JSON.stringify({ rooms: window.__scene.warren.data.rooms.length, items: window.__scene.warren.data.items.length, hatch: !!window.__scene.warren.data.hatch })));
} finally { await b.close(); try { process.kill(-server.pid); } catch {} }
console.log('errors', errors);
process.exit(errors.length ? 1 : 0);
