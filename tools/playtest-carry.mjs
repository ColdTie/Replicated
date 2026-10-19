// Scripted headless playtest of the original's hands (session 15, M1): fell a tree and carry the wood, a copy's
// building that waits for wood shows it over the copy's head, walking into the site hands the wood over and pays
// it, swings help raise it, a load handed to a copy cheers it, stone broken off rock, a load stowed when leaving.
// Usage: npm run build && node tools/playtest-carry.mjs
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const port = 4193;
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
  await page.goto(`http://localhost:${port}/Replicated/?shot=1&local&copies=3&view=base&hour=15&hear=1`);
  await page.waitForFunction(() => !!window.__scene?.player && window.__scene.npcs.length === 3, null, { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.mouse.click(480, 270);
  const ev = (f, arg) => page.evaluate(f, arg);
  const H = JSON.parse((await import('node:fs')).readFileSync('src/data/supplies.json', 'utf8')).hands;

  // the copies stand still at home, away from where the original works
  await ev(() => { const s = window.__scene; s.npcs.forEach((n) => { n.state = 'idle'; n.until = s.time.now + 600_000; n.nextBuild = s.time.now + 600_000; }); s.player.locked = false; });

  // 1. fell a tree: six swings, it comes down, its wood rides above the head
  const fell = async () => ev(async () => {
    const s = window.__scene, base = s.baseCenter;
    const t = s.trees.filter((x) => x.alive && Math.hypot(x.x - base.x, x.y - base.y) > 160 && s.npcs.every((n) => Math.hypot(n.x - x.x, n.y - x.y) > 80))
      .sort((a, c) => Math.hypot(a.x - base.x, a.y - base.y) - Math.hypot(c.x - base.x, c.y - base.y))[0];
    if (!t) return null;
    s.player.setPosition(t.x - 14, t.y + 2);
    const aim = { x: 1, y: 0, lengthSq: () => 1 };
    let swings = 0;
    const n0 = s.hands.load?.n ?? 0;
    while (t.alive && swings < 12) { s.resolveAttack(t.x - 4, t.y - 4, 14, aim); swings++; await new Promise((r) => setTimeout(r, 150)); }
    // the wood flies over once the tree is down (a scene timer: slow at headless frame rates)
    for (let i = 0; i < 150 && (s.hands.load?.n ?? 0) < n0 + 3; i++) await new Promise((r) => setTimeout(r, 100));
    return { swings, alive: t.alive, felled: (s.pending.felled ?? []).includes(t.index), load: s.hands.load && { ...s.hands.load } };
  });
  const one = await fell();
  log('tree', JSON.stringify(one));
  if (!one) fail('no tree to fell');
  else {
    if (one.alive || !one.felled) fail('the tree did not come down for good');
    if (one.swings !== 6) fail(`a tree took ${one.swings} swings, not 6`);
    if (one.load?.material !== 'wood' || one.load?.n !== 3) fail('the wood is not carried');
  }
  const two = await fell();
  log('second tree', JSON.stringify(two));
  if (two?.load?.n !== 6) fail('a second tree did not add to the load');
  await page.screenshot({ path: 'screenshots/hands-carry.png' });

  // 2. a copy's building waits for wood: the wood shows over its head when you come near
  const plan = await ev(() => {
    const s = window.__scene, n = s.npcs[0];
    s.supplies.wood = 0;
    const bl = s.buildings.propose(n, { type: 'building', name: 'Workroom', purpose: 'A roof to work under.', width: 3, height: 2, material: 'wood', roof: 'flat', door: 'south', primary: 'sand', secondary: 'slate' });
    bl.approved = true;
    // short of only what the original carries: the load pays it
    s.supplies.wood = Math.max(0, bl.cost.wood - 6);
    s.player.setPosition(n.x - 50, n.y + 10);
    return { id: bl.id, cost: bl.cost, need: s.buildings.needOf(n.data.id), at: [bl.x, bl.y], w: bl.w, h: bl.h };
  });
  await page.waitForTimeout(500);
  const needShown = await ev(() => [...window.__scene.hands.needIcons.values()].some((i) => i.visible && i.alpha > 0.5));
  log('plan', JSON.stringify({ ...plan, needShown }));
  if (plan.need !== 'wood' || !needShown) fail('the copy does not show what its building waits for');
  await page.screenshot({ path: 'screenshots/hands-need.png' });

  // 3. walk into the site: the wood goes in and the building is paid
  const delivered = await ev(async (p) => {
    const s = window.__scene, bl = s.buildings.list.find((x) => x.id === p.id);
    const wood0 = s.supplies.wood;
    s.player.setPosition(bl.x - bl.w * 8 - 6, bl.y + 2);
    await new Promise((r) => setTimeout(r, 400));
    return { load: s.hands.load, paid: bl.paid, wood0, wood: s.supplies.wood, log: s.mindLog.slice(-3).map((e) => e.text) };
  }, plan);
  log('delivered', JSON.stringify(delivered));
  if (delivered.load) fail('the load was not handed over at the site');
  if (!delivered.paid) fail('the building was not paid with the wood');

  // 4. swing at it: each blow counts, the original is among its builders
  const raised = await ev(async (p) => {
    const s = window.__scene, bl = s.buildings.list.find((x) => x.id === p.id);
    const before = bl.progress, aim = { x: 1, y: 0, lengthSq: () => 1 };
    for (let i = 0; i < 4; i++) { s.resolveAttack(bl.x - bl.w * 8 + 4, bl.y - 4, 14, aim); await new Promise((r) => setTimeout(r, 120)); }
    return { before, after: bl.progress, helpers: bl.helpers, me: window.__session.replicant?.id, words: s.buildings.describe((id) => (id === window.__session.replicant?.id ? window.__session.replicant.name : 'copy')) };
  }, plan);
  log('raised', JSON.stringify(raised));
  if (Math.abs(raised.after - raised.before - 4 * H.swingWorth) > 1e-6) fail('the original\'s swings did not count');
  if (!raised.helpers.includes(raised.me)) fail('the original is not among the builders');

  // 5. a load handed to a copy cheers it
  const gift = await ev(async () => {
    const s = window.__scene, n = s.npcs[1];
    n.needs.company = 0.1; n.needs.purpose = 0.1;
    const stone0 = s.supplies.stone ?? 0;
    s.player.setPosition(n.x - 60, n.y);
    s.hands.take('stone', 2, { x: s.player.x, y: s.player.y });
    await new Promise((r) => setTimeout(r, 500));
    const carrying = s.hands.load && { ...s.hands.load };
    s.player.setPosition(n.x - 6, n.y);
    await new Promise((r) => setTimeout(r, 300));
    await new Promise((r) => setTimeout(r, 1200));
    return { carrying, load: s.hands.load, company: n.needs.company, purpose: n.needs.purpose, stone: (s.supplies.stone ?? 0) - stone0 };
  });
  log('gift', JSON.stringify(gift));
  if (gift.carrying?.material !== 'stone' || gift.load) fail('the stone was not handed to the copy');
  if (!(gift.company > 0.25) || !(gift.purpose > 0.3)) fail('the copy was not cheered by the gift');
  if (gift.stone !== 2) fail('the stone did not reach the store');

  // 6. rock: four swings break off stone
  const rock = await ev(async () => {
    const s = window.__scene, m = s.map, T = 16, base = s.baseCenter;
    let best = null;
    for (let ty = 1; ty < m.h - 1; ty++) for (let tx = 1; tx < m.w - 1; tx++) {
      if (m.cells[ty * m.w + tx] !== 2 || m.cells[(ty + 1) * m.w + tx] !== 1) continue;
      const d = Math.hypot(tx * T - base.x, ty * T - base.y);
      if (!best || d < best.d) best = { tx, ty, d };
    }
    if (!best) return null;
    const x = best.tx * T + 8, y = (best.ty + 1) * T + 6;
    s.player.setPosition(x, y);
    const aim = { x: 0, y: -1, lengthSq: () => 1 };
    for (let i = 0; i < 4; i++) { s.resolveAttack(x, best.ty * T + 12, 12, aim); await new Promise((r) => setTimeout(r, 150)); }
    await new Promise((r) => setTimeout(r, 600));
    const load = s.hands.load && { ...s.hands.load };
    // a fifth swing on the same rock right away gives nothing more
    for (let i = 0; i < 4; i++) { s.resolveAttack(x, best.ty * T + 12, 12, aim); await new Promise((r) => setTimeout(r, 150)); }
    await new Promise((r) => setTimeout(r, 600));
    return { load, again: s.hands.load && { ...s.hands.load } };
  });
  log('rock', JSON.stringify(rock));
  if (rock && (rock.load?.material !== 'stone' || rock.load?.n !== H.rockYield)) fail('rock gave no stone');
  if (rock && rock.again?.n !== rock.load?.n) fail('the same rock gave stone twice in a row');
  if (!rock) log('note: no rock on this world');

  // 7. leaving with a load: it goes into the store
  const stowed = await ev(() => {
    const s = window.__scene;
    s.hands.load = null;
    s.hands.take('scrap', 2, { x: s.player.x, y: s.player.y });
    const scrap0 = s.supplies.scrap ?? 0;
    s.hands.stow();
    return { load: s.hands.load, scrap: (s.supplies.scrap ?? 0) - scrap0 };
  });
  log('stowed', JSON.stringify(stowed));
  if (stowed.load || stowed.scrap !== 2) fail('a carried load was lost when leaving');
} finally { await b.close(); try { process.kill(-server.pid); } catch {} }
console.log('errors', errors);
process.exit(errors.length ? 1 : 0);
