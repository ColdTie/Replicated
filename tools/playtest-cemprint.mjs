// Scripted headless playtest of one building system (src/entities/Buildings.ts cemsTakeOver / tend, src/core/designs.ts
// blueprintModel): on Earth with a seeded Cem bed and three copies, the copies begin a Meeting Hall of their own; once it
// is paid, the Cems take it up and print it from a voxel model of its blueprint (the ants carrying its
// wood, a Cem printer beside it); the copies tend the bed instead of swinging and every stroke brings the print nearer;
// it finishes solid and lit and still counts as the copies' (a Meeting Hall still gathers them). Your own design print
// is tended too. Usage: npm run build && node tools/playtest-cemprint.mjs   (saves screenshots/cemprint-*.png)
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const port = 4203;
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
  await page.goto(`http://localhost:${port}/Replicated/?shot=1&at=sol&pi=3&local&copies=3&view=seeded&hour=15&rain=0&hear=1`);
  await page.waitForFunction(() => !!window.__scene?.player && window.__scene.npcs.length === 3, null, { timeout: 20000 });
  await page.waitForFunction(() => window.__scene.bioworks?.awake, null, { timeout: 10000 }).catch(() => fail('the bed was not seeded'));
  await page.waitForTimeout(1500);

  // 1. the copies begin a Meeting Hall of their own (approved: the village's shared work)
  const proposed = await ev(() => {
    const s = window.__scene;
    const bl = s.buildings.propose(s.npcs[0], { type: 'building', name: 'Long House', purpose: 'Room for all of us.', width: 4, height: 3, material: 'wood', roof: 'peaked', door: 'south', primary: 'sand', secondary: 'plum' }, 'hall');
    return bl && { id: bl.id, approved: bl.approved, cems: !!bl.cems, cost: bl.cost };
  });
  log('proposed', JSON.stringify(proposed));
  if (!proposed) { fail('no lot for the proposal'); throw new Error('stop'); }

  // 2. paid: the Cems take it up (no swings) and print it from its blueprint
  await ev((id) => { const s = window.__scene; s.supplies.wood = 30; s.markSupplies(); const bl = s.buildings.list.find((x) => x.id === id); bl.progress = Math.round(s.buildings.swingsFor(bl) * 0.25); s.buildings.fund(bl); }, proposed.id);
  await page.waitForFunction((id) => !!window.__scene.buildings.list.find((x) => x.id === id)?.cems, proposed.id, { timeout: 6000 }).catch(() => fail('the Cems did not take up the paid blueprint'));
  await page.waitForTimeout(600);
  const taken = await ev((id) => {
    const s = window.__scene, bl = s.buildings.list.find((x) => x.id === id), p = s.buildings.placed.get(bl.id), m = p?.cem?.m;
    return { paid: bl.paid, fraction: s.buildings.fraction(bl), printMs: bl.printMs, model: m && { w: m.w, d: m.d, h: m.h, volume: m.volume }, trails: s.bioworks.trails.filter((t) => t.id.startsWith(bl.id)).length, bio: !!s.buildings.printers.get(bl.id)?.bio, words: s.buildings.describe(() => 'x').find((w) => w.includes('Long House')) };
  }, proposed.id);
  log('taken', JSON.stringify(taken));
  if (!taken.model || taken.model.w !== 16) fail('no voxel model of the blueprint (4 voxels a tile across)');
  if (!(taken.fraction >= 0.2 && taken.fraction < 0.5)) fail(`the print did not go on from what was raised by hand (${taken.fraction})`);
  if (taken.trails !== 2 || !taken.bio) fail('no ants or Cem printer for the copy\'s print');
  if (!taken.words?.includes('printed by the Cems')) fail('the minds are not told the Cems print it');
  const swing = await ev((id) => { const s = window.__scene, bl = s.buildings.list.find((x) => x.id === id), before = bl.progress; return { struck: s.buildings.playerSwing(bl.x, bl.y - 4, 14), before, after: bl.progress }; }, proposed.id);
  if (swing.struck) fail('a swing still raised a building the Cems print');

  // 3. the copies tend the bed: they go to its rim and every stroke brings the print nearer
  // (every copy starts afresh: a chore it was walking to before the Cems took over is dropped)
  const fresh = () => window.__scene.npcs.forEach((n) => { n.state = 'idle'; n.chore = null; n.target = null; n.until = 0; n.nextBuild = 0; });
  const t0 = await ev(([id, f]) => { new Function(`return (${f})`)()(); return window.__scene.buildings.list.find((x) => x.id === id).printStart; }, [proposed.id, fresh.toString()]);
  await page.waitForFunction(([id, t]) => window.__scene.buildings.list.find((x) => x.id === id).printStart < t - 1000, [proposed.id, t0], { timeout: 30000 }).catch(() => fail('no copy tended the bed for the print'));
  // the one tending kneels at the bed's rim
  const tending = await page.waitForFunction(() => { const s = window.__scene, bw = s.bioworks; return s.npcs.some((n) => n.state === 'chore' && Math.hypot(n.x - bw.center.x, n.y - bw.center.y) < 70) && s.npcs.map((n) => `${n.state}:${Math.round(Math.hypot(n.x - bw.center.x, n.y - bw.center.y))}`); }, null, { timeout: 15000 }).then((h) => h.jsonValue()).catch(() => null);
  log('copies by the bed', JSON.stringify(tending));
  if (!tending) fail('no copy tends at the bed');
  await ev(() => { const s = window.__scene, bw = s.bioworks; s.player.setPosition(bw.center.x - 50, bw.center.y + 50); });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'screenshots/cemprint-tending.png' });
  await ev((id) => { const s = window.__scene, bl = s.buildings.list.find((x) => x.id === id); bl.printStart = Date.now() - bl.printMs * 0.6; s.player.setPosition(bl.x - 60, bl.y + 30); }, proposed.id);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'screenshots/cemprint-rising.png' });

  // 4. it finishes: solid, lit, the ants go home, and it is still the copies' Meeting Hall
  await ev((id) => { const bl = window.__scene.buildings.list.find((x) => x.id === id); bl.printStart = Date.now() - bl.printMs - 100; }, proposed.id);
  await page.waitForFunction((id) => window.__scene.buildings.list.find((x) => x.id === id).built, proposed.id, { timeout: 8000 }).catch(() => fail('the copy\'s print never finished'));
  await page.waitForTimeout(1500);
  const done = await ev((id) => { const s = window.__scene, bl = s.buildings.list.find((x) => x.id === id), p = s.buildings.placed.get(bl.id); return { solid: !!p.solid, lights: p.cem.lights.length, hall: s.buildings.has('hall'), gather: !!s.buildings.gatheringSpot(), ending: s.bioworks.trails.filter((t) => t.id.startsWith(bl.id)).every((t) => t.ending) }; }, proposed.id);
  log('done', JSON.stringify(done));
  if (!done.solid || !done.lights) fail('the finished print is not solid and lit');
  if (!done.hall || !done.gather) fail('the printed Meeting Hall does not count as the copies\' hall');
  if (!done.ending) fail('the ants did not go home');
  await page.screenshot({ path: 'screenshots/cemprint-done.png' });

  // 5. your own design is tended too
  const design = await ev(() => {
    const s = window.__scene;
    for (const k of ['salt', 'iron', 'quartz', 'copper', 'wood']) s.supplies[k] = 38;
    s.addEmbers(40); s.markSupplies();
    const bl = s.buildings.print('house');
    s.npcs.forEach((n) => { n.state = 'idle'; n.chore = null; n.target = null; n.until = 0; n.nextBuild = 0; });
    return bl && { id: bl.id, start: bl.printStart };
  });
  if (!design) fail('the House could not be printed on the seeded Earth');
  else await page.waitForFunction(([id, t]) => window.__scene.buildings.list.find((x) => x.id === id).printStart < t - 1000, [design.id, design.start], { timeout: 30000 }).catch(() => fail('no copy tended the bed for your design'));
  log('errors', JSON.stringify(errors));
} catch (e) {
  if (String(e).includes('stop')) log('stopped'); else throw e;
} finally {
  await b.close();
  try { process.kill(-server.pid); } catch { /* the preview server already stopped */ }
}
process.exit(errors.length ? 1 : 0);
