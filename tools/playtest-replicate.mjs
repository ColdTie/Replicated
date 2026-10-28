// Scripted headless playtest of making a Vessel (story/STORY.md Copying, Steve 2026-10-28; src/entities/Chips.ts,
// src/entities/Replication.ts, designs.json nouschip, drift.json): the Nous Chip waits for the Supercomputer, is printed
// by the Cems on their bed and lies there until you walk onto it; the Replicator makes nothing without a chip; with one
// (and the Ember) WAKE or HOLD opens, Esc spends nothing, WAKE spends the chip and the Ember, the maker is free while the
// body prints (with the Cems awake: drift.json printMs), nothing more is begun meanwhile, and the Vessel steps out once;
// a HOLD begun before a reload steps out after it; on Earth, with no Cems, the Replicator is built on its pad and prints
// the slow way (printMsAlone). Usage: npm run build && node tools/playtest-replicate.mjs (saves screenshots/replicate-*.png)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { chromium } from 'playwright';
const port = 4207;
const HW = JSON.parse(fs.readFileSync('src/data/homeworld.json', 'utf8'));
const DRIFT = JSON.parse(fs.readFileSync('src/data/drift.json', 'utf8'));
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
  const shot = (name) => page.screenshot({ path: `screenshots/${name}.png` });
  const ev = (f, arg) => page.evaluate(f, arg);
  /** what the save holds: the Replicator's print, how many rows carry this id, chips lying on the bed, chips carried */
  const saved = (id) => ev(async (id) => {
    const s = window.__scene, st = window.__session.store, me = window.__session.replicant;
    const p = await st.loadPlanet(s.planet.star, s.planet.planetIndex, 0);
    return {
      replication: p?.data.replication ?? null, rows: id ? st.db.replicants.filter((r) => r.id === id).length : 0,
      chipsOnBed: (p?.data.buildings ?? []).filter((x) => x.design === 'nouschip').length, carried: st.db.replicants.find((r) => r.id === me.id)?.traits.chips ?? 0,
    };
  }, id);
  const url = `http://localhost:${port}/Replicated/?local&hour=13&rain=0`;
  const reload = async () => {
    await page.goto(url);
    await page.waitForFunction(() => window.__game?.scene.isActive('home') || !!window.__scene?.player, null, { timeout: 30000 });
    if (await ev(() => window.__game.scene.isActive('home'))) { await page.waitForTimeout(1200); await page.mouse.click(480, 294); }
    await page.waitForFunction(() => !!window.__scene?.player && !!window.__scene.replication, null, { timeout: 30000 });
  };
  /** stand on the Replicator's ring and press attack */
  const atRing = async () => {
    await ev(() => { const s = window.__scene; s.player.setPosition(s.base.spotX, s.base.spotY); s.player.locked = false; });
    await page.waitForTimeout(250);
    await page.keyboard.press('Space');
  };
  await page.goto(url);
  await page.waitForFunction(() => !!window.__scene?.player, null, { timeout: 30000 });

  // the opening, quickly: Thales' word (two pages), the name
  await page.waitForFunction(() => !!window.__scene.talker.talk?.script, null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  for (let i = 0; i < 10 && (await ev(() => !!window.__scene.talker.talk)); i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(350); }
  await page.waitForSelector('.ov input', { timeout: 8000 });
  await page.type('.ov input', 'Tenth');
  await page.click('.ov button');
  await page.waitForFunction(() => !window.__scene.player.locked, null, { timeout: 10000 });

  // past the beginning (tools/playtest-tutorial.mjs plays it): the Printworks stands, the Cems are awake
  await ev(async (goal) => {
    const s = window.__scene, me = window.__session.replicant;
    me.traits.tutorial = { ...me.traits.tutorial, step: 'open', grown: 5, told: ['opening', 'printer', 'awake', 'open'] };
    await window.__session.store.patchTraits(me.id, { tutorial: me.traits.tutorial });
    s.buildings.finishNow(goal);
    s.buildings.save();
    s.bioworks.wake(false);
  }, HW.goal);
  if (!(await ev(() => window.__scene.bioworks.awake))) fail('the Cems did not wake');

  // 1. without a chip the Replicator makes nothing, whatever the Ember
  await ev(() => { const s = window.__scene; s.addEmbers(40 - s.embers); });
  await atRing();
  await page.waitForTimeout(900);
  const none = await ev(() => ({ choice: !!window.__scene.choice, embers: window.__scene.embers, busy: window.__scene.replication.busy }));
  log('no chip', JSON.stringify(none));
  if (none.choice || none.busy || none.embers !== 40) fail('the Replicator made something without a Nous Chip');

  // 2. the Nous Chip: it waits for the Supercomputer; the Cems print it on their bed; it lies there until taken
  const chip = await ev(() => {
    const s = window.__scene, bl = s.buildings;
    for (const k of ['salt', 'iron', 'quartz', 'copper', 'wood']) s.supplies[k] = 60;
    s.markSupplies();
    s.addEmbers(60 - s.embers);
    const before = bl.whyNot('nouschip');
    bl.standNow('supercomputer');
    const after = bl.whyNot('nouschip');
    const c = bl.print('nouschip');
    if (c) c.printStart = Date.now() - (c.printMs ?? 0) - 1000;
    const bw = s.bioworks;
    return { before, after, printed: !!c, id: c?.id, onBed: c ? Math.round(Math.hypot(c.x - bw.center.x, c.y - bw.center.y)) : -1 };
  });
  log('chip', JSON.stringify(chip));
  if (chip.before !== 'NEEDS SUPERCOMPUTER') fail(`before the Supercomputer the chip says "${chip.before}"`);
  if (chip.after !== null || !chip.printed) fail(`with the Supercomputer standing the chip could not be printed ("${chip.after}")`);
  if (chip.onBed > 40) fail(`the chip was not printed on the Cem bed (${chip.onBed} px from it)`);
  await page.waitForFunction(() => window.__scene.chips.waiting.length === 1, null, { timeout: 8000 }).catch(() => fail('the finished chip does not lie on the bed'));
  await ev(() => { const s = window.__scene, c = s.chips.waiting[0]; s.player.setPosition(c.x - 40, c.y + 20); });
  await page.waitForTimeout(800);
  await shot('replicate-chip');
  await ev(() => { const s = window.__scene, c = s.chips.waiting[0]; s.player.setPosition(c.x, c.y - 2); });
  await page.waitForFunction(() => (window.__session.replicant.traits.chips ?? 0) === 1, null, { timeout: 5000 }).catch(() => fail('walking onto the chip did not take it'));
  await page.waitForTimeout(400);
  await ev(() => window.__scene.flushPlanet());
  const took = await saved();
  log('took', JSON.stringify(took));
  if (took.chipsOnBed !== 0) fail('the taken chip is still in the planet\'s save');
  if (took.carried !== 1) fail('the chip carried is not saved on the Vessel\'s row');

  // 3. with a chip: WAKE or HOLD opens; Esc closes it with nothing spent
  await ev(() => { const s = window.__scene; s.addEmbers(40 - s.embers); });
  await atRing();
  await page.waitForFunction(() => !!window.__scene.choice, null, { timeout: 5000 }).catch(() => fail('with a chip the Replicator did not open WAKE or HOLD'));
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__scene.choice && !window.__scene.player.locked, null, { timeout: 3000 }).catch(() => fail('Esc did not close the choice'));
  const kept = await ev(() => ({ embers: window.__scene.embers, chips: window.__session.replicant.traits.chips }));
  if (kept.embers !== 40 || kept.chips !== 1) fail(`closing the choice spent something (${JSON.stringify(kept)})`);

  // 4. WAKE: the chip and the Ember; the maker free; the Cems print the body; nothing more begins meanwhile
  await atRing();
  await page.waitForFunction(() => !!window.__scene.choice, null, { timeout: 5000 }).catch(() => fail('the choice did not open again'));
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__scene.replication.busy && !window.__scene.replicating && !window.__scene.player.locked, null, { timeout: 6000 }).catch(() => fail('the body did not start, or the maker stayed held'));
  const begun = await ev(() => { const s = window.__scene, st = s.replication.state; return { embers: s.embers, chips: window.__session.replicant.traits.chips, kind: st?.kind, id: st?.row.id, blank: st?.row.traits.blank, cems: st?.cems, ms: st?.ms, can: s.canReplicate() }; });
  log('begun', JSON.stringify(begun));
  if (begun.embers !== 40 - DRIFT.cost || begun.chips !== 0) fail(`a Vessel did not cost a chip and ${DRIFT.cost} Ember`);
  if (begun.kind !== 'wake' || !begun.blank) fail('the Replicator does not print a woken (blank) Vessel');
  if (!begun.cems || begun.ms !== DRIFT.printMs) fail(`with the Cems awake the body does not take printMs (${begun.ms})`);
  await ev(() => window.__scene.flushPlanet());
  if ((await saved(begun.id)).replication?.row?.id !== begun.id) fail('the Vessel being printed is not in the planet\'s save');
  await ev(() => { const s = window.__scene, me = window.__session.replicant; me.traits.chips = 1; s.addEmbers(40 - s.embers); });
  await atRing();
  await page.waitForTimeout(800);
  if (await ev(() => !!window.__scene.choice)) fail('a second Vessel could be begun while one prints');
  await ev(() => { const s = window.__scene; s.player.setPosition(s.base.x - 40, s.base.y + 34); });
  await page.waitForTimeout(1500);
  await shot('replicate-printing');
  // its time runs out: it steps out where it rose, once
  await ev(() => { const st = window.__scene.replication.state; st.start = Date.now() - st.ms + 1200; });
  await page.waitForFunction((id) => window.__scene.npcs.some((n) => n.data.id === id) && !window.__scene.replication.busy, begun.id, { timeout: 15000 }).catch(() => fail('the woken Vessel never stepped out'));
  await page.waitForTimeout(1600);
  await shot('replicate-born');
  await ev(() => window.__scene.flushPlanet());
  const out = await saved(begun.id);
  log('born', JSON.stringify({ rows: out.rows, replication: out.replication }));
  if (out.rows !== 1) fail(`the woken Vessel's row was made ${out.rows} times`);
  if (out.replication) fail('the Replicator still prints in the save');

  // 5. HOLD, then a reload while it prints: it steps out after the reload, asleep in your likeness, once
  await ev(() => { const s = window.__scene; s.addEmbers(40 - s.embers); });
  await atRing();
  await page.waitForFunction(() => !!window.__scene.choice, null, { timeout: 5000 }).catch(() => fail('no choice for the held Vessel'));
  await page.waitForTimeout(300);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__scene.replication.busy, null, { timeout: 6000 }).catch(() => fail('the held Vessel did not start'));
  const heldId = await ev(() => { const s = window.__scene, st = s.replication.state; st.start = Date.now() - st.ms + 5000; s.pending.replication = st; return st.row.id; });
  await ev(() => window.__scene.flushPlanet());
  await reload();
  await page.waitForFunction((id) => window.__scene.npcs.some((n) => n.data.id === id && n.held), heldId, { timeout: 20000 }).catch(() => fail('the held Vessel never stepped out after the reload'));
  await page.waitForTimeout(800);
  await ev(() => window.__scene.flushPlanet());
  const after = await saved(heldId);
  const held = await ev((id) => { const n = window.__scene.npcs.find((x) => x.data.id === id), me = window.__session.replicant; return { held: n?.data.traits.held, same: JSON.stringify(n?.data.traits.body) === JSON.stringify(me.traits.body), chips: me.traits.chips }; }, heldId);
  log('held', JSON.stringify({ ...held, rows: after.rows, replication: after.replication }));
  if (after.rows !== 1) fail(`the held Vessel's row was made ${after.rows} times`);
  if (after.replication) fail('the Replicator still prints in the save after the held Vessel stepped out');
  if (!held.held || !held.same) fail('the held Vessel is not asleep in its maker\'s likeness');
  if (held.chips !== 0) fail(`the chips carried came back after the reload (${held.chips})`);

  // 6. Earth: no Cems; the Replicator is built on its pad and prints the slow way (drift.json printMsAlone)
  await page.goto(`http://localhost:${port}/Replicated/?shot=1&at=sol&pi=3&local&view=base&hour=13&rain=0`);
  await page.waitForFunction(() => !!window.__scene?.player && window.__scene.planet.star === 'sol', null, { timeout: 30000 });
  await page.waitForTimeout(800);
  const pad = await ev(() => { const s = window.__scene; s.frozen = false; s.player.setPosition(s.base.x, s.base.y); s.player.locked = false; return { built: s.base.built, canBuild: s.base.canBuild(s.embers) }; });
  if (pad.built || !pad.canBuild) fail(`Earth has no pad to build the Replicator on (${JSON.stringify(pad)})`);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__scene.base.built && !window.__scene.player.locked, null, { timeout: 5000 }).catch(() => fail('the Replicator was not built on its pad'));
  await ev(() => { const s = window.__scene, me = window.__session.replicant; me.traits.chips = 1; s.embers = 40; });
  await atRing();
  await page.waitForFunction(() => !!window.__scene.choice, null, { timeout: 5000 }).catch(() => fail('no choice at Earth\'s Replicator'));
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__scene.replication.busy, null, { timeout: 6000 }).catch(() => fail('Earth\'s Replicator did not start a body'));
  const alone = await ev(() => { const st = window.__scene.replication.state; return { cems: st?.cems, ms: st?.ms, awake: !!window.__scene.bioworks?.awake }; });
  log('alone', JSON.stringify(alone));
  if (alone.cems || alone.ms !== DRIFT.printMsAlone) fail(`without the Cems the body does not take printMsAlone (${JSON.stringify(alone)})`);
  await ev(() => { const st = window.__scene.replication.state; st.start = Date.now() - st.ms + 800; });
  await page.waitForFunction(() => !window.__scene.replication.busy && window.__scene.npcs.length === 1, null, { timeout: 15000 }).catch(() => fail('the Vessel never stepped out on Earth'));
  log('errors', JSON.stringify(errors));
} finally {
  await b.close();
  try { process.kill(-server.pid); } catch { /* gone */ }
}
process.exit(errors.length ? 1 : 0);
