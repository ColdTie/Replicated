// Scripted headless playtest of the copies' wishes of 2026-11-15 (the maker, pm): the lesson board beside the
// Printworks (Tamsin's printer lesson track, src/entities/Lessons.ts) shows the step and the teacher, only once a track
// exists; the journal's HERE page lists the lessons and the warren's plants; seeds in the planters show in the warren
// (Ember Gold's wish, src/world/garden.ts), taller stage by stage.
// Usage: npm run build && node tools/playtest-lessons.mjs (saves screenshots/lessons-*.png)
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const port = 4232;
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
  const ev = (f, arg) => page.evaluate(f, arg);
  await page.goto(`http://localhost:${port}/Replicated/?local&hour=13&rain=0`);
  await page.waitForFunction(() => window.__game?.scene.isActive('home') || !!window.__scene?.player, null, { timeout: 30000 });
  if (await ev(() => window.__game.scene.isActive('home'))) { await page.waitForTimeout(1200); await page.mouse.click(480, 294); }
  await page.waitForFunction(() => !!window.__scene?.player && !!window.__scene.lessonBoard, null, { timeout: 30000 });
  for (let i = 0; i < 6 && await ev(() => !!window.__scene.dialogue?.open); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }

  // 1. the Printworks stands, no lesson yet: no board
  await ev(() => {
    const s = window.__scene;
    for (const g of s.buildings.list) if (!g.built && !g.design) s.buildings.finishNow(g.id);
    s.bioworks?.wake(false);
  });
  const where = await ev(() => window.__scene.bioworks?.boardSpot ?? null);
  if (!where) fail('the Printworks gives the board no place');
  await page.waitForTimeout(2500);
  if (await ev(() => window.__scene.lessonBoard.active)) fail('a board stands with no lesson');

  // 2. Thales opens the track for Tamsin and she works step 2: the board shows it with the teacher's name
  await ev((w) => {
    const s = window.__scene;
    s.lessons = [{ student: 's', studentName: 'Tamsin', teacher: 't', teacherName: 'Thales', step: 2, worked: Date.now(), did: 'a line of copper along the bead', at: Date.now() }];
    if (w) { s.player.setPosition(w.x - 8, w.y + 16); s.cameras.main.centerOn(w.x, w.y - 10); }
  }, where);
  await page.waitForFunction(() => window.__scene.lessonBoard.active, null, { timeout: 10000 }).catch(() => fail('a lesson does not raise the board'));
  const text = await ev(() => window.__scene.lessonBoard.shown?.filter((o) => o.text !== undefined).map((o) => o.text) ?? []);
  log('board', JSON.stringify(text));
  if (text[0] !== 'LESSON 2/6' || text[1] !== 'THALES') fail('the board does not show the step and the teacher');
  await page.screenshot({ path: 'screenshots/lessons-board.png' });

  // 3. the journal's HERE page: the lessons, and a seed growing in the warren
  await ev(async () => {
    const s = window.__scene;
    s.plants = { p1: { by: 'e', name: 'Ember Gold', room: 'Greenroom', at: Date.now() - 1.5 * 86_400_000, tended: 0 } };
    await s.toggleJournal();
  });
  await page.waitForTimeout(400);
  await page.click('[data-tab="here"]');
  const here = await ev(() => document.querySelector('.jn [data-page="here"]')?.textContent ?? '');
  if (!here.includes('LESSONS') || !here.includes('Tamsin learns the printers from Thales: step 2 of 6')) fail('the journal does not show the lessons');
  if (!here.includes('GROWING') || !here.includes('In Greenroom: a green sprout, planted by Ember Gold')) fail('the journal does not show the plant');
  await page.screenshot({ path: 'screenshots/lessons-journal.png' });

  // 4. the warren: seeds in the Grove's planters, a sprout and a full plant, drawn over them
  const w2 = await b.newPage({ viewport: { width: 960, height: 540 } });
  w2.on('pageerror', (e) => errors.push(String(e)));
  await w2.goto(`http://localhost:${port}/Replicated/?local&shot=1&view=warren&copies=3`);
  await w2.waitForFunction(() => window.__game?.scene.isActive('warren'), null, { timeout: 30000 });
  await w2.waitForTimeout(1500);
  const grown = await w2.evaluate(() => {
    const ws = window.__game.scene.getScene('warren');
    return [...ws.items.values()].filter((e) => e.plant).length;
  });
  log('plants drawn', grown);
  if (grown !== 2) fail(`the planters show ${grown} plants, not 2`);
  await w2.screenshot({ path: 'screenshots/lessons-warren.png' });
} catch (e) {
  fail(String(e));
} finally {
  await b.close();
  try { process.kill(-server.pid); } catch { /* gone */ }
}
const real = errors.filter((e) => !/favicon|AudioContext/.test(e));
if (real.length) { console.log('errors:', real); process.exit(1); }
console.log('ok');
