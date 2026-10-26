// Scripted headless playtest of coming back (session 15, M2): what changed since the original last saw the planet
// becomes beats, the camera tours them and gives the player back, a key skips the tour, and a letter that came for
// the original waits as an envelope by the vessel that opens the sender's talk box on its letters.
// Usage: npm run build && node tools/playtest-return.mjs
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const port = 4194;
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
  const ev = (f, arg) => page.evaluate(f, arg);

  // 1. beats: an older snapshot without the newest copy, its builds and a room
  const beats = await ev(() => {
    const s = window.__scene, h = s.homecoming;
    const now = h.snapshot();
    const gone = s.npcs[2].data.id;
    const old = { ...now, at: Date.now() - 3 * 3_600_000, copies: Object.fromEntries(Object.entries(now.copies).filter(([k]) => k !== gone)), builds: now.builds.slice(0, Math.max(0, now.builds.length - 3)), rooms: [] };
    const list = h.beats(old);
    return { snapshot: { builds: now.builds.length, copies: Object.keys(now.copies).length, rooms: now.rooms.length }, beats: list.length, first: list[0] && { x: Math.round(list[0].x), y: Math.round(list[0].y), by: list[0].by?.data.name } };
  });
  log('beats', JSON.stringify(beats));
  if (!beats.beats || beats.first?.by !== (await ev(() => window.__scene.npcs[2].data.name))) fail('the new copy is not the first beat');
  const none = await ev(() => { const h = window.__scene.homecoming; return h.beats(h.snapshot()).length; });
  if (none) fail(`nothing changed but there were ${none} beats`);

  // 2. the tour pans to each beat and gives the player back
  const toured = await ev(async () => {
    const s = window.__scene, h = s.homecoming, cam = s.cameras.main;
    s.player.locked = true;
    const target = { x: s.player.x + 200, y: s.player.y - 120 };
    let done = false, farthest = 0;
    h.tour([target], () => { done = true; s.player.locked = false; });
    for (let i = 0; i < 250 && !done; i++) {
      await new Promise((r) => setTimeout(r, 100));
      farthest = Math.max(farthest, Math.hypot(cam.midPoint.x - s.player.x, cam.midPoint.y - s.player.y));
    }
    return { done, farthest: Math.round(farthest), touring: h.touring, following: !!cam._follow, locked: s.player.locked };
  });
  log('tour', JSON.stringify(toured));
  if (!toured.done || toured.touring || !toured.following || toured.locked) fail('the tour did not give the player back');
  if (toured.farthest < 120) fail('the camera did not visit the beat');

  // 3. a key skips it
  const skipped = await ev(async () => {
    const s = window.__scene, h = s.homecoming;
    let done = false;
    const t0 = performance.now();
    h.tour([{ x: s.player.x + 300, y: s.player.y }, { x: s.player.x - 300, y: s.player.y }, { x: s.player.x, y: s.player.y + 300 }], () => { done = true; });
    await new Promise((r) => setTimeout(r, 500));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', code: 'KeyX', keyCode: 88 }));
    for (let i = 0; i < 40 && !done; i++) await new Promise((r) => setTimeout(r, 100));
    return { done, ms: Math.round(performance.now() - t0) };
  });
  log('skip', JSON.stringify(skipped));
  if (!skipped.done || skipped.ms > 3000) fail('a key did not skip the tour');

  // 4. a letter for the original waits by the vessel; walking into it opens the sender's letters
  const letter = await ev(async () => {
    const s = window.__scene, st = window.__session.store, me = window.__session.replicant;
    const n = s.npcs[0];
    const saved = await st.createReplicant({ ...n.data }); n.data.id = saved.id;
    const since = new Date(Date.now() - 1000).toISOString();
    await st.sendMessage(n.data, me.id, 'The lamps by the square are lit for you.');
    await s.homecoming.placeLetters(Date.parse(since) - 10);
    const env = s.homecoming.envelopes.map((e) => ({ x: e.img.x, y: e.img.y, from: e.letter.from_replicant }));
    return { env, from: n.data.id };
  });
  log('envelopes', JSON.stringify(letter));
  if (letter.env.length !== 1 || letter.env[0].from !== letter.from) fail('the letter did not wait by the vessel');
  await ev(() => { const s = window.__scene; s.player.locked = false; s.cameras.main.centerOn(s.vesselPos.x, s.vesselPos.y + 20); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'screenshots/return-letters.png' });
  const opened = await ev(async (e) => {
    const s = window.__scene;
    s.player.setPosition(e.x, e.y + 1);
    for (let i = 0; i < 30 && !s.talker.talk; i++) await new Promise((r) => setTimeout(r, 100));
    for (let i = 0; i < 30 && !s.talker.talkBox?.pages?.some((p) => p.key === 'letters:0'); i++) await new Promise((r) => setTimeout(r, 100));
    const box = s.talker.talkBox;
    return { open: !!s.talker.talk, left: s.homecoming.envelopes.length, page: box?.pages?.[box.index]?.key ?? box?.current?.key ?? null, keys: box?.pages?.map((p) => p.key) };
  }, letter.env[0]);
  log('opened', JSON.stringify(opened));
  if (!opened.open || opened.left) fail('walking into the envelope did not open the talk');
  if (opened.page !== 'letters:0') fail('the talk did not open on the letters');
  await page.screenshot({ path: 'screenshots/return-letter-open.png' });
} finally { await b.close(); try { process.kill(-server.pid); } catch {} }
console.log('errors', errors);
process.exit(errors.length ? 1 : 0);
