// Scripted headless playtest of session 9 step 4: a copy proposes a building, it waits for the original's word,
// the original approves it in the journal, the copies pay its wood and raise it together, it lights up; the
// original talks to a copy and gives it Ember. Usage: npm run build && node tools/playtest-buildings.mjs
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const port = 4185;
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

  // 1. a proposal: placed on clear ground, faint, waiting
  const proposed = await ev(() => {
    const s = window.__scene;
    const bld = s.buildings.propose(s.npcs[0], { type: 'building', name: 'Watchtower', purpose: 'To see the far side.', width: 3, height: 2, material: 'wood', roof: 'peaked', door: 'south', primary: 'sand', secondary: 'plum' });
    return bld && { id: bld.id, name: bld.name, at: [bld.x, bld.y], approved: bld.approved, cost: bld.cost, words: s.buildings.describe((id) => s.npcs.find((n) => n.data.id === id)?.data.name ?? '?') };
  });
  log('proposed', JSON.stringify(proposed));
  if (!proposed) fail('no spot for the building');
  if (proposed?.approved) fail('proposal was approved before the original spoke');
  // nobody works on it while it waits
  await ev(() => { const s = window.__scene; s.supplies.wood = 10; s.npcs.forEach((n) => { n.state = 'idle'; n.until = 0; n.nextBuild = 0; }); });
  await page.waitForTimeout(2500);
  log('waiting progress', await ev(() => window.__scene.buildings.list[0].progress));
  if ((await ev(() => window.__scene.buildings.list[0].progress)) > 0) fail('work started before approval');

  // 2. the original approves through the journal; the copies pay and raise it together
  await ev(async () => { await window.__scene.toggleJournal(); });
  const buttons = await ev(() => ({ approve: !!document.querySelector('[data-approve]'), veto: !!document.querySelector('[data-veto]'), talk: !!document.querySelector('[data-send]'), give: !!document.querySelector('[data-give]') }));
  log('journal buttons', JSON.stringify(buttons));
  if (!buttons.approve || !buttons.talk || !buttons.give) fail('journal lacks the original\'s actions');
  await page.click('[data-approve]');
  await page.waitForTimeout(600);
  log('approved', await ev(() => JSON.stringify({ approved: window.__scene.buildings.list[0].approved, journalOpen: !!document.querySelector('.jn') })));
  await ev(() => { document.querySelector('.jn')?.remove(); });
  await page.waitForFunction(() => window.__scene.buildings.list[0].progress > 0, null, { timeout: 25000 }).catch(() => fail('nobody joined the raising'));
  log('raising', await ev(() => JSON.stringify({ progress: window.__scene.buildings.list[0].progress, paid: window.__scene.buildings.list[0].paid, wood: window.__scene.supplies.wood, helpers: window.__scene.buildings.list[0].helpers.length })));
  if ((await ev(() => window.__scene.supplies.wood)) >= 10) fail('the building took no wood');
  await page.waitForFunction(() => window.__scene.buildings.list[0].built, null, { timeout: 60000 }).catch(() => fail('the building never got finished'));
  await page.waitForTimeout(900);
  const built = await ev(() => { const s = window.__scene; const bl = s.buildings.list[0]; s.player.setPosition(bl.x - 30, bl.y + 10); s.cameras.main.centerOn(bl.x, bl.y - 10); return { built: bl.built, helpers: bl.helpers.length, progress: bl.progress, total: s.buildings.swingsFor(bl) }; });
  log('built', JSON.stringify(built));
  if (built.helpers < 2) log('note: only one copy helped');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'screenshots/building-built.png' });

  // 3. talk and give
  const talked = await ev(async () => {
    const s = window.__scene; const n = s.npcs[1];
    const saved = await window.__session.store.createReplicant({ ...n.data }); n.data.id = saved.id;
    await s.talkTo(n.data.id, 'Build me something tall.');
    const j = await window.__session.store.journal([n.data.id]);
    const embers0 = s.embers; s.embers = 20;
    s.giveTo(n.data.id);
    return { mail: j.mail.length, to: j.mail[0]?.to_replicant === n.data.id, body: j.mail[0]?.body, inventory: n.data.traits.inventory, embers: s.embers, embers0 };
  });
  log('talk and give', JSON.stringify(talked));
  if (!talked.mail || !talked.to) fail('talking did not write a letter');
  if (talked.inventory?.ember !== 5 || talked.embers !== 15) fail('giving did not hand over 5 Ember');
} finally { await b.close(); try { process.kill(-server.pid); } catch {} }
console.log('errors', errors);
process.exit(errors.length ? 1 : 0);
