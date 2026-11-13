// Scripted headless playtest of the original's hands (session 15, M1): a swing at a tree leaves it standing and gives
// nothing, stone broken off rock rides above the head (the same rock gives none again right away), a copy's building
// that waits for stone shows it over the copy's head, walking into the site with the stone hands it over and pays it,
// swings help raise it, a load handed to a copy cheers it, a load stowed when leaving; with no iron ore free a copy
// presses stored iron into scrap, never below the iron kept in reserve (the maker, 2026-11-12).
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
  await page.goto(`http://localhost:${port}/Replicated/?shot=1&at=sol&pi=3&local&copies=3&view=base&hour=15&hear=1`);
  await page.waitForFunction(() => !!window.__scene?.player && window.__scene.npcs.length === 3, null, { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.mouse.click(480, 270);
  const ev = (f, arg) => page.evaluate(f, arg);
  const H = JSON.parse((await import('node:fs')).readFileSync('src/data/supplies.json', 'utf8')).hands;

  // the copies stand still at home, away from where the original works
  await ev(() => { const s = window.__scene; s.npcs.forEach((n) => { n.state = 'idle'; n.until = s.time.now + 600_000; n.nextBuild = s.time.now + 600_000; }); s.player.locked = false; });

  // 1. trees are scenery: swings at one leave it standing, and nothing rides above the head
  const tree = await ev(async () => {
    const s = window.__scene, base = s.baseCenter, m = s.map, T = 16;
    const rockAt = (x, y) => { const tx = Math.floor(x / T), ty = Math.floor(y / T); return tx >= 0 && ty >= 0 && tx < m.w && ty < m.h && m.cells[ty * m.w + tx] === 2; };
    // a tree with no rock, crystal or building under the swing (those answer a swing of their own)
    const clear = (t) => !rockAt(t.x - 4, t.y - 4) && !rockAt(t.x - 4, t.y - 12)
      && s.nodes.every((n) => !n.alive || Math.hypot(n.x - (t.x - 4), n.y - t.y) > 30)
      && s.buildings.list.every((bl) => Math.hypot(bl.x - t.x, bl.y - t.y) > 80);
    const t = s.trees.filter((x) => x.alive && clear(x) && Math.hypot(x.x - base.x, x.y - base.y) > 160 && s.npcs.every((n) => Math.hypot(n.x - x.x, n.y - x.y) > 80))
      .sort((a, c) => Math.hypot(a.x - base.x, a.y - base.y) - Math.hypot(c.x - base.x, c.y - base.y))[0];
    if (!t) return null;
    s.hands.load = null;
    s.player.setPosition(t.x - 14, t.y + 2);
    const aim = { x: 1, y: 0, lengthSq: () => 1 };
    for (let i = 0; i < 8; i++) { s.resolveAttack(t.x - 4, t.y - 4, 14, aim); await new Promise((r) => setTimeout(r, 150)); }
    // whatever a felled tree once gave came after a scene timer: wait as long
    await new Promise((r) => setTimeout(r, 1500));
    return { index: t.index, alive: t.alive, felled: (s.pending.felled ?? []).includes(t.index), load: s.hands.load && { ...s.hands.load } };
  });
  log('tree', JSON.stringify(tree));
  if (!tree) fail('no tree to swing at');
  else {
    if (!tree.alive || tree.felled) fail('swings brought a tree down');
    if (tree.load) fail(`a swing at a tree gave something (${JSON.stringify(tree.load)})`);
  }

  // 2. rock: four swings break off stone and it rides above the head; the same rock right away gives nothing more
  const rock = await ev(async () => {
    const s = window.__scene, m = s.map, T = 16, base = s.baseCenter, hatch = s.warren.hatch;
    let best = null;
    for (let ty = 1; ty < m.h - 1; ty++) for (let tx = 1; tx < m.w - 1; tx++) {
      if (m.cells[ty * m.w + tx] !== 2 || m.cells[(ty + 1) * m.w + tx] !== 1) continue;
      const x = tx * T + 8, y = (ty + 1) * T + 6, hy = ty * T + 12;
      // nothing else answers the swing (a crystal, a tree) and nobody stands near enough to be handed the load
      if (s.nodes.some((n) => n.alive && Math.hypot(n.x - x, n.y - 4 - hy) < 30)) continue;
      if (s.trees.some((t) => t.alive && Math.hypot(t.x - x, t.y - hy) < 24)) continue;
      if (Math.hypot(hatch.x - x, hatch.y - y) < 60 || s.npcs.some((n) => Math.hypot(n.x - x, n.y - y) < 60)) continue;
      const d = Math.hypot(tx * T - base.x, ty * T - base.y);
      if (!best || d < best.d) best = { tx, ty, d, x, y, hy };
    }
    if (!best) return null;
    s.hands.load = null;
    s.player.setPosition(best.x, best.y);
    const aim = { x: 0, y: -1, lengthSq: () => 1 };
    for (let i = 0; i < 4; i++) { s.resolveAttack(best.x, best.hy, 12, aim); await new Promise((r) => setTimeout(r, 150)); }
    await new Promise((r) => setTimeout(r, 600));
    const load = s.hands.load && { ...s.hands.load };
    // four more swings on the same rock right away give nothing more
    for (let i = 0; i < 4; i++) { s.resolveAttack(best.x, best.hy, 12, aim); await new Promise((r) => setTimeout(r, 150)); }
    await new Promise((r) => setTimeout(r, 600));
    return { at: [best.tx, best.ty], load, again: s.hands.load && { ...s.hands.load } };
  });
  log('rock', JSON.stringify(rock));
  if (rock && (rock.load?.material !== 'stone' || rock.load?.n !== H.rockYield)) fail('rock gave no stone');
  if (rock && rock.again?.n !== rock.load?.n) fail('the same rock gave stone twice in a row');
  if (!rock) {
    log('note: no rock on this world: the stone for the building is given by hand');
    await ev((n) => { const s = window.__scene; s.hands.load = null; s.hands.take('stone', n, { x: s.player.x, y: s.player.y }); }, H.rockYield);
  }
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'screenshots/hands-carry.png' });

  // 3. a copy's building waits for stone: the stone shows over its head when you come near
  const plan = await ev(() => {
    const s = window.__scene, n = s.npcs[0];
    s.supplies.stone = 0;
    const bl = s.buildings.propose(n, { type: 'building', name: 'Workroom', purpose: 'A roof to work under.', width: 3, height: 2, material: 'stone', roof: 'flat', door: 'south', primary: 'sand', secondary: 'slate' });
    bl.approved = true;
    // short of only what the original carries: the load pays it
    s.supplies.stone = Math.max(0, bl.cost.stone - (s.hands.load?.n ?? 0));
    s.player.setPosition(n.x - 50, n.y + 10);
    return { id: bl.id, material: bl.material, cost: bl.cost, carried: s.hands.load && { ...s.hands.load }, need: s.buildings.needOf(n.data.id), at: [bl.x, bl.y], w: bl.w, h: bl.h };
  });
  await page.waitForTimeout(500);
  const needShown = await ev(() => [...window.__scene.hands.needIcons.values()].some((i) => i.visible && i.alpha > 0.5));
  log('plan', JSON.stringify({ ...plan, needShown }));
  if (plan.material !== 'stone' || !plan.cost.stone) fail('the building does not take stone');
  if (plan.carried?.material !== 'stone') fail('the original does not carry the stone to the building');
  if (plan.need !== 'stone' || !needShown) fail('the copy does not show what its building waits for');
  await page.screenshot({ path: 'screenshots/hands-need.png' });

  // 4. walk into the site: the stone goes in and the building is paid
  const delivered = await ev(async (p) => {
    const s = window.__scene, bl = s.buildings.list.find((x) => x.id === p.id);
    const stone0 = s.supplies.stone;
    s.player.setPosition(bl.x - bl.w * 8 - 6, bl.y + 2);
    await new Promise((r) => setTimeout(r, 400));
    return { load: s.hands.load, paid: bl.paid, stone0, stone: s.supplies.stone, log: s.mindLog.slice(-3).map((e) => e.text) };
  }, plan);
  log('delivered', JSON.stringify(delivered));
  if (delivered.load) fail('the load was not handed over at the site');
  if (!delivered.paid) fail('the building was not paid with the stone');

  // 5. swing at it: each blow counts, the original is among its builders
  const raised = await ev(async (p) => {
    const s = window.__scene, bl = s.buildings.list.find((x) => x.id === p.id);
    const before = bl.progress, aim = { x: 1, y: 0, lengthSq: () => 1 };
    for (let i = 0; i < 4; i++) { s.resolveAttack(bl.x - bl.w * 8 + 4, bl.y - 4, 14, aim); await new Promise((r) => setTimeout(r, 120)); }
    return { before, after: bl.progress, helpers: bl.helpers, me: window.__session.replicant?.id, words: s.buildings.describe((id) => (id === window.__session.replicant?.id ? window.__session.replicant.name : 'copy')) };
  }, plan);
  log('raised', JSON.stringify(raised));
  if (Math.abs(raised.after - raised.before - 4 * H.swingWorth) > 1e-6) fail('the original\'s swings did not count');
  if (!raised.helpers.includes(raised.me)) fail('the original is not among the builders');

  // 6. a load handed to a copy cheers it
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

  // 8. no iron ore free: a copy presses stored iron into scrap at the hatch, and never below the reserve
  const P = JSON.parse((await import('node:fs')).readFileSync('src/data/supplies.json', 'utf8')).press;
  const press = await ev(async (P) => {
    const s = window.__scene, w = s.warren, n = s.npcs[1];
    w.data.entrance.dug = true;
    w.data.scavenged = Object.fromEntries(s.nodes.filter((o) => o.kind === 'iron').map((o) => [o.index, Date.now()]));
    w.supplies.iron = P.keepIron + P.iron; w.supplies.scrap = 0;
    const tasks = new Set();
    for (let i = 0; i < 60; i++) { const t = w.pickTask(n, 0); if (t) tasks.add(t.task); for (const id of [...w.digging.keys()]) w.digging.delete(id); }
    n.state = 'idle';
    w.press(n);
    for (let i = 0; i < 60 && (w.supplies.scrap ?? 0) < P.scrap; i++) await new Promise((r) => setTimeout(r, 250));
    const after = { iron: w.supplies.iron, scrap: w.supplies.scrap };
    const tasksAfter = new Set();
    for (let i = 0; i < 60; i++) { const t = w.pickTask(n, 0); if (t) tasksAfter.add(t.task); for (const id of [...w.digging.keys()]) w.digging.delete(id); }
    return { tasks: [...tasks], after, canPress: w.canPress, tasksAfter: [...tasksAfter] };
  }, P);
  log('press', JSON.stringify(press));
  if (!press.tasks.includes('press')) fail('a copy never chose to press iron into scrap with no ore free');
  if (press.after.iron !== P.keepIron || press.after.scrap !== P.scrap) fail('pressing did not turn iron into scrap');
  if (press.canPress || press.tasksAfter.includes('press')) fail('a copy would press below the iron reserve');
} finally { await b.close(); try { process.kill(-server.pid); } catch {} }
console.log('errors', errors);
process.exit(errors.length ? 1 : 0);
