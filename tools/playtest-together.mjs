// Scripted headless playtest of session 10: a lonely copy walks over to another and they stand together; a full
// store starts the Meeting Hall on its own, the copies raise it and gather at its door; a full store of stone
// improves a warren room (and the painting shows it); what the copies did in an away wake plays out on landing;
// a Spark awakens a copy as a player of its own. Usage: npm run build && node tools/playtest-together.mjs
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const port = 4186;
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

  // 1. lonely: it walks over to the nearest copy and they stand together; company fills
  await ev(() => { const s = window.__scene; const n = s.npcs[0]; n.needs.company = 0.1; n.nextSeek = 0; n.nextBuild = 1e12; n.state = 'idle'; n.until = 0; s.npcs.slice(1).forEach((o) => { o.nextBuild = 1e12; }); });
  await page.waitForFunction(() => window.__scene.npcs[0].state === 'visit', null, { timeout: 20000 }).catch(() => fail('the lonely copy never went to anyone'));
  const c0 = await ev(() => window.__scene.npcs[0].needs.company);
  await page.waitForTimeout(6000);
  const visit = await ev(() => { const s = window.__scene; const [a, ...o] = s.npcs; const near = o.map((x) => Math.round(Math.hypot(x.x - a.x, x.y - a.y))); return { state: a.state, company: a.needs.company, near, partner: o.some((x) => x.state === 'visit') }; });
  log('visit', JSON.stringify({ ...visit, c0 }));
  if (!(visit.company > c0)) fail('company did not fill while together');
  const gain = await ev(() => { const n = window.__scene.npcs[0]; const st = n.state; n.state = 'visit'; const c = n.needs.company; n.advanceNeeds(0.005); const d = n.needs.company - c; n.state = st; return d; });
  if (!(gain > 0.15)) fail(`standing together fills company too slowly (${gain})`);
  if (Math.min(...visit.near) > 40) fail('the lonely copy is not beside anyone');

  // 2. a full store of wood: the Meeting Hall starts on its own (already approved), is raised, and gathers them
  await ev(() => { const s = window.__scene; s.supplies.wood = s.warren.cap; s.buildings.nextCommunal = 0; s.npcs.forEach((n) => { n.state = 'idle'; n.until = 0; n.nextBuild = 0; n.needs.company = 0.9; }); });
  await page.waitForFunction(() => window.__scene.buildings.list.some((x) => x.kind === 'hall'), null, { timeout: 20000 }).catch(() => fail('no Meeting Hall was started'));
  const hall = await ev(() => { const h = window.__scene.buildings.list.find((x) => x.kind === 'hall'); return h && { name: h.name, approved: h.approved, cost: h.cost }; });
  log('hall', JSON.stringify(hall));
  if (hall && !hall.approved) fail('the communal hall waited for approval');
  await page.waitForFunction(() => window.__scene.buildings.list.find((x) => x.kind === 'hall')?.progress > 0, null, { timeout: 30000 }).catch(() => fail('nobody raised the hall'));
  log('wood after paying', await ev(() => window.__scene.supplies.wood));
  await ev(() => { const s = window.__scene; const h = s.buildings.list.find((x) => x.kind === 'hall'); h.progress = s.buildings.swingsFor(h) - 1; });
  await page.waitForFunction(() => window.__scene.buildings.list.find((x) => x.kind === 'hall')?.built, null, { timeout: 30000 }).catch(() => fail('the hall never finished'));
  const spot = await ev(() => window.__scene.buildings.gatheringSpot());
  if (!spot) fail('a built hall gives no gathering spot');
  await page.waitForTimeout(1500);
  await ev(() => { const s = window.__scene; s.npcs.forEach((n) => { n.needs.company = 0.05; n.nextSeek = 0; n.nextBuild = 1e12; n.chore = null; n.target = null; n.state = 'idle'; n.until = 0; }); });
  await page.waitForFunction(() => { const s = window.__scene, g = s.buildings.gatheringSpot(); return s.npcs.filter((n) => n.state === 'visit' && Math.hypot(n.x - g.x, n.y - g.y) < 40).length >= 2; }, null, { timeout: 30000 })
    .catch(async () => fail(`the copies did not gather at the hall: ${await ev(() => { const s = window.__scene, g = s.buildings.gatheringSpot(); return JSON.stringify({ g, n: s.npcs.map((n) => [n.state, Math.round(n.x), Math.round(n.y), n.target && [Math.round(n.target.x), Math.round(n.target.y)], !!n.seek]) }); })}`));
  await ev(() => { const s = window.__scene, g = s.buildings.gatheringSpot(); s.player.setPosition(g.x + 40, g.y + 20); s.cameras.main.centerOn(g.x, g.y - 16); });
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'screenshots/together-hall.png' });
  log('at the hall', await ev(() => { const s = window.__scene, g = s.buildings.gatheringSpot(); return s.npcs.map((n) => `${n.data.name}:${n.state}:${Math.round(Math.hypot(n.x - g.x, n.y - g.y))}`).join(' '); }));

  // 3. a full store of stone improves a dug room, one level at a time (live and while away)
  const better = await ev(() => {
    const s = window.__scene, w = s.warren;
    w.data.entrance.dug = true;
    const r = w.dig(s.npcs[0], { type: 'dig', kind: 'hall', name: 'Hearth', size: 'small', beside: 'Entrance', direction: 'south' });
    r.dug = true;
    s.supplies.stone = w.cap; s.supplies.soil = 30;
    let task = null;
    // a copy with its bed already made (one without makes its bed first)
    w.data.items.push({ id: 'bed1', kind: 'rest', room: r.id, x: r.x + 1, y: r.y, by: s.npcs[1].data.id, for: s.npcs[1].data.id, at: Date.now() });
    for (let i = 0; i < 40 && task?.task !== 'improve'; i++) { w.digging.clear(); task = w.pickTask(s.npcs[1], 0); }
    const stone0 = s.supplies.stone;
    w.improveRoom(r, s.npcs[1]);
    const one = { level: r.level, stone: s.supplies.stone, stone0 };
    s.supplies.stone = w.cap; s.supplies.soil = 30;
    w.applyOffline(4);
    return { picked: task?.task, ...one, after: r.level, words: w.data.rooms.length && window.__scene.mindLog.slice(-3).map((e) => e.text) };
  });
  log('improve', JSON.stringify(better));
  if (better.picked !== 'improve') fail('a full store of stone never picked a room to improve');
  if (better.level !== 1 || !(better.stone < better.stone0)) fail('improving did not pay and raise the level');
  if (!(better.after >= 2)) fail('time away did not improve the room further');

  // 4. an away wake plays out: the queue is taken once, its song is sung, its room planned
  const away = await ev(async () => {
    const s = window.__scene, st = window.__session.store, n = s.npcs[1];
    const key = `${s.planet.star}:${s.planet.planetIndex}`;
    st.db.planets[key] ??= { star_id: s.planet.star, planet_index: s.planet.planetIndex, seed: 1, embers: 0, data: {} };
    st.db.planets[key].data.awayQueue = [
      { id: n.data.id, name: n.data.name, at: Date.now(), song: 'I dug alone in the quiet.', actions: [{ type: 'dig', kind: 'archive', name: 'Quiet', size: 'small', beside: 'Entrance', direction: 'east', purpose: 'For letters.' }, { type: 'note', body: 'x' }] },
      // placed on the saved warren by the mind function already (applied): told, never placed twice
      { id: n.data.id, name: n.data.name, at: Date.now() + 1, actions: [{ type: 'dig', applied: true, kind: 'rest', name: 'Hollow', size: 'small' }, { type: 'furnish', applied: true, item: 'rest', room: 'Hollow', forId: n.data.id }, { type: 'dig', applied: true, failed: true, name: 'Nowhere' }] },
    ];
    const q = await st.takeMindQueue(s.planet.star, s.planet.planetIndex);
    const again = await st.takeMindQueue(s.planet.star, s.planet.planetIndex);
    const rooms0 = s.warren.data.rooms.length;
    s.replayAway(q);
    return { taken: q.length, again: again.length, rooms: s.warren.data.rooms.length - rooms0, log: s.mindLog.slice(-4).map((e) => e.text) };
  });
  log('away', JSON.stringify(away));
  if (away.taken !== 2 || away.again !== 0) fail('the away queue was not taken exactly once');
  if (away.rooms !== 1) fail('the away dig was not played out (or an applied one was placed again)');
  if (!away.log.some((t) => t.includes('marked out Hollow')) || !away.log.some((t) => t.includes('resting station'))) fail('applied away deeds were not told');
  if (away.log.some((t) => t.includes('Nowhere'))) fail('a failed away deed was told');
  await page.waitForFunction(() => !!window.__scene.npcs[1].bubble, null, { timeout: 20000 }).catch(() => fail('the away song was never sung'));

  // 5. a Spark awakens a copy: a profile in its name, its row active, the copy gone from the planet
  const woke = await ev(async () => {
    const s = window.__scene, st = window.__session.store, me = window.__session.replicant;
    const n = s.npcs[2];
    const saved = await st.createReplicant({ ...n.data }); n.data.id = saved.id;
    me.traits.sparks = 1;
    s.shot = false;
    await s.awakenCopy(n.data.id);
    s.shot = true;
    const profiles = await st.listProfiles();
    const row = st.db.replicants.find((r) => r.id === saved.id);
    return { npcs: s.npcs.length, sparks: me.traits.sparks, profile: profiles.find((p) => p.id === row.profile_id)?.name, name: n.data.name, status: row.status };
  });
  log('awaken', JSON.stringify(woke));
  if (woke.npcs !== 2 || woke.sparks !== 0 || woke.status !== 'active' || woke.profile !== woke.name) fail('the handoff did not happen');
  await page.waitForTimeout(2500);
  // the awakened copy plays as itself: its profile loads it
  const plays = await ev(async () => { const st = window.__session.store; const p = (await st.listProfiles()).find((x) => x.name !== 'STEVE' && x.name !== window.__session.replicant.name) ?? (await st.listProfiles()).slice(-1)[0]; const r = await st.loadReplicant(p); return { name: r.name, status: r.status, body: !!r.traits.body }; });
  log('plays as', JSON.stringify(plays));
  if (plays.status !== 'active' || !plays.body) fail('the awakened profile does not load the copy');
} finally { await b.close(); try { process.kill(-server.pid); } catch {} }
console.log('errors', errors);
process.exit(errors.length ? 1 : 0);
