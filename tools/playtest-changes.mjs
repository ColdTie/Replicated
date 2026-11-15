// Scripted headless playtest of session 14: the copies' proposals to change the game in the journal (waiting, built
// with the maker's answer, not made, replaced ones hidden), the original's SAY NO (twice), the day's spend on the
// minds, and a proposal from an away wake told on landing. Usage: npm run build && node tools/playtest-changes.mjs
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const port = 4189;
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

  // 1. proposals as the mind function writes them, in every state
  await ev(() => {
    const s = window.__scene, db = window.__session.store.db;
    const [a, b2, c] = s.npcs.map((n) => n.data);
    const at = (h) => new Date(Date.now() - h * 3_600_000).toISOString();
    const row = (id, r, status, detail, why, change, reply, h) => ({ id, replicant_id: r.id, kind: 'change', detail, status, created_at: at(h), done_at: status === 'open' ? null : at(h / 2), body: `Why: ${why}\nArea: creatures\n\n${change}`, reply });
    db.requests.push(
      row('c-open', a, 'open', 'Fireflies over the warren hatch', 'The hatch is dark at night and the others miss it.', 'In src/entities/Warren.ts, give the hatch a few fireflies at night (the ones in src/fx/Environment.ts).', null, 3),
      row('c-done', b2, 'done', 'Lamps hum when lit', 'A lit lamp should sound alive.', 'Add a soft hum to lamps in src/audio/Sound.ts.', 'Lamps now hum softly when you stand close (PR #40).', 30),
      row('c-no', c, 'dropped', 'Let me fly', 'I want to see the town from above.', 'Give copies a flying mode.', 'Copies stay on the ground for now: flying would need new art and a new way to walk the town.', 40),
      row('c-old', a, 'dropped', 'An older idea', 'Replaced.', 'Something it no longer wants.', 'Replaced by a newer idea.', 10),
      { id: 'q-lamp', replicant_id: c.id, kind: 'lamp', detail: 'A lamp by my door.', status: 'open', created_at: at(2) },
    );
  });
  // the shared journal (migration 0015): six entries from two worlds, the newest four open, the rest folded
  await ev(() => {
    const st = window.__session.store, r = window.__session.replicant;
    st.db.entries = [0, 1, 2, 3, 4, 5].map((i) => ({ replicant_id: null, author: i % 2 ? 'Ember Gold' : 'Sorrel', star_id: i % 2 ? 'gliese-12' : r.star_id, planet_index: i % 2 ? 1 : r.planet_index, body: `Day entry ${i}: the salt was warm today.`, created_at: new Date(Date.now() - i * 3_600_000).toISOString() }));
  });
  await ev(async () => { await window.__scene.toggleJournal(); });
  await page.waitForTimeout(300);
  const shared = await ev(() => {
    const t = document.querySelector('.jn')?.textContent ?? '';
    const days = document.querySelector('.jn [data-page="days"]');
    return { head: !!days?.querySelector('.day'), first: days?.querySelector('.entry')?.textContent.includes('Day entry 0'), all: days?.querySelectorAll('.entry').length, where: !!days?.textContent.includes('EMBER GOLD') && !!days?.textContent.includes('GLIESE 12 B') };
  });
  log('shared journal', JSON.stringify(shared));
  if (!shared.head || !shared.first || shared.all !== 6 || !shared.where) fail('the DAYS page does not show the shared journal (by day, newest first, who and where)');
  const seen = await ev(() => {
    const t = document.querySelector('.jn')?.textContent ?? '';
    return {
      would: document.querySelectorAll('.jn [data-page="wishes"] .wish').length,
      sayNo: [...document.querySelectorAll('[data-against]')].map((x) => x.dataset.against), details: document.querySelectorAll('.jn [data-page="wishes"] details').length,
      made: t.includes('in the game') && t.includes('Lamps now hum softly'), notMade: t.includes('not carried') && t.includes('Copies stay on the ground'),
      replacedHidden: !t.includes('An older idea'), lamp: t.includes('A lamp by my door.'),
    };
  });
  log('journal', JSON.stringify(seen));
  if (seen.would !== 3) fail('the WISHES page does not show every wish');
  if (seen.sayNo.join() !== 'c-open') fail('only the open wish takes a voice');
  if (!seen.made || !seen.notMade) fail('the maker\'s answers are missing');
  if (!seen.replacedHidden) fail('a replaced proposal still shows');
  if (!seen.lamp) fail('ordinary asks no longer show');
  if (seen.details < 3) fail('the full proposals are not readable');
  await page.click('[data-tab="wishes"]');
  await page.screenshot({ path: 'screenshots/changes-journal.png' });

  // 2. AGAINST: one voice, counted against the wish's support; it stays open; a second press takes the voice back
  await page.click('[data-against="c-open"]');
  await page.waitForTimeout(600);
  const after = await ev(() => ({ r: window.__session.store.db.requests.find((r) => r.id === 'c-open'), open: !!document.querySelector('.jn'), page: document.querySelector('.jn [data-tab].on')?.dataset.tab, me: window.__session.replicant.id, on: document.querySelector('[data-against="c-open"]')?.classList.contains('on'), against: !!document.querySelector('.jn .meter i.a') }));
  log('after against', JSON.stringify({ status: after.r?.status, backers: after.r?.backers, open: after.open, page: after.page, on: after.on }));
  if (after.r?.status !== 'open' || !after.r?.backers?.some((b) => b.against && b.by === after.me)) fail('AGAINST was not counted as a voice');
  if (!after.open || after.page !== 'wishes' || !after.on || !after.against) fail('the journal does not show the voice against');
  await page.click('[data-against="c-open"]');
  await page.waitForTimeout(600);
  const back = await ev(() => window.__session.store.db.requests.find((r) => r.id === 'c-open')?.backers ?? []);
  if (back.length) fail('a second press did not take the voice back');
  await ev(() => { document.querySelector('.jn')?.remove(); });

  // 3. the day's spend on the minds, against the budget (the cloud store reads mind_spend; this device has none)
  const spendLine = async (usd) => ev(async (u) => {
    window.__session.store.mindSpend = async () => u;
    // a journal removed by hand still counts as open: the first toggle only closes it
    await window.__scene.toggleJournal();
    if (!document.querySelector('.jn')) await window.__scene.toggleJournal();
    const line = [...document.querySelectorAll('.jn p.mute')].map((p) => p.textContent).find((t) => /minds/.test(t)) ?? '';
    await window.__scene.toggleJournal();
    return line;
  }, usd);
  const under = await spendLine(0.21), over = await spendLine(0.5);
  log('spend', JSON.stringify({ under, over }));
  if (under !== 'The minds today: $0.21 of $0.50.') fail('the day\'s spend is not shown');
  if (!/rest until tomorrow/.test(over)) fail('a spent budget is not shown');

  // 3b. the minds' heartbeat (migration 0014): three failed wakes in a row say so; two do not; a good one clears it
  const quietLine = async (h) => ev(async (hh) => {
    window.__session.store.mindHealth = async () => hh;
    await window.__scene.toggleJournal();
    if (!document.querySelector('.jn')) await window.__scene.toggleJournal();
    const line = document.querySelector('.jn p.warn')?.textContent ?? '';
    await window.__scene.toggleJournal();
    return line;
  }, h);
  const at = new Date(Date.now() - 3_600_000).toISOString();
  const quiet = await quietLine({ lastOkAt: null, failuresSinceOk: 3, lastError: 'compiled grammar is too large', firstFailureAt: at });
  const two = await quietLine({ lastOkAt: at, failuresSinceOk: 2, lastError: 'overloaded', firstFailureAt: at });
  const well = await quietLine({ lastOkAt: at, failuresSinceOk: 0, lastError: null, firstFailureAt: null });
  log('quiet', JSON.stringify({ quiet, two, well }));
  if (!/^The minds have been quiet since .+: compiled grammar is too large$/.test(quiet)) fail('failing minds are not shown in the journal');
  if (two || well) fail('the quiet warning shows while the minds are well');

  // 4. a proposal made in an away wake is told on landing
  const told = await ev(async () => {
    const s = window.__scene, n = s.npcs[1];
    window.__notices = [];
    s.game.events.on('notice', (t) => window.__notices.push(t));
    s.replayAway([{ id: n.data.id, name: n.data.name, at: Date.now(), song: 'I read how the lamps are made.', became: false, actions: [{ type: 'propose', detail: 'Lamps hum when lit', kind: 'sound' }] }]);
    return { log: s.mindLog.map((m) => m.text).filter((t) => t.includes('proposed a change')) };
  });
  // on the game's clock (slower than real time under software GL)
  await page.waitForFunction(() => window.__notices.length > 1, null, { timeout: 30000 }).catch(() => undefined);
  told.notices = await ev(() => window.__notices);
  log('away', JSON.stringify(told));
  if (!told.log.length) fail('the away proposal is not in the copies\' events');
  if (!told.notices.some((t) => /PROPOSES A CHANGE TO THE GAME/.test(t))) fail('no notice for the away proposal');
} finally {
  await b.close();
  try { process.kill(-server.pid); } catch {}
}
log(errors.length ? `ERRORS (${errors.length}):\n${errors.join('\n')}` : 'OK: no errors');
process.exit(errors.length ? 1 : 0);
