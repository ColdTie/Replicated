// Gives the copies time to live: loads each planet from a snapshot of the live data (planet_states + its copies,
// written by hand from Supabase into a JSON file), plays it headless for N minutes in ?sim mode (device storage,
// the copies' minds asleep so they only act on their own plans: dig, cut, make beds, build, raise), and writes
// what changed to an output file for the write-back.
// Usage: npm run build && cp -r dist dist-sim && node tools/sim-live.mjs <seed.json> <out.json> [--minutes 10] [--parallel 4]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { chromium } from 'playwright';

const [, , seedPath, outPath] = process.argv;
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
const minutes = arg('minutes', 10), parallel = arg('parallel', 4);
const planets = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
const port = arg('port', 4197);
const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-sim', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
for (let i = 0; ; i++) {
  try { if ((await fetch(`http://localhost:${port}/Replicated/`)).ok) break; } catch {}
  if (i > 150 || server.exitCode !== null) { console.log(`preview server did not start on ${port} (try --port)`); process.exit(1); }
  await new Promise((r) => setTimeout(r, 200));
}
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const PLAYER_ID = '3b7c94da-3313-4fb6-8948-a54c1d3e710f';
const results = [];

async function simulate(p) {
  const ctx = await browser.newContext({ viewport: { width: 480, height: 270 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const db = {
    profiles: [{ id: 'p1', name: 'STEVE', kid_mode: false, feature_color: 10, sort: 0 }],
    replicants: [
      { id: PLAYER_ID, profile_id: 'p1', name: 'Steve', model: 'replicant', traits: { awake: true, feature: 10 }, status: 'active', star_id: p.star, planet_index: p.pi, pos_x: null, pos_y: null },
      ...p.npcs,
    ],
    planets: { [`${p.star}:${p.pi}`]: { star_id: p.star, planet_index: p.pi, seed: p.seed, embers: p.embers, data: p.data } },
    journeys: [], discovered: ['sol'], notes: [], mail: [], requests: [],
  };
  await page.addInitScript((d) => { if (!localStorage.getItem('replicated.local.v1')) localStorage.setItem('replicated.local.v1', d); }, JSON.stringify(db));
  const say = (...a) => console.log(`  [${p.star}]`, ...a);
  await page.goto(`http://localhost:${port}/Replicated/?sim&low&hour=13`);
  say('loading');
  await page.waitForFunction(() => !!window.__scene?.player && window.__scene.npcs?.length >= 0 && !!window.__scene.warren, null, { timeout: 60000 });
  const before = await page.evaluate(() => { const s = window.__scene; return { rooms: s.warren.data.rooms.filter((r) => r.dug).length, planned: s.warren.data.rooms.length, items: s.warren.data.items.length, entrance: s.warren.opened, structures: s.village.structures.length, buildings: s.buildings.list.length, embers: s.embers }; });
  say('loaded', JSON.stringify(before));
  const t0 = Date.now();
  while (Date.now() - t0 < minutes * 60_000) {
    await page.waitForTimeout(Math.min(30_000, minutes * 60_000));
    // keep the original standing by the base, out of the fights
    await page.evaluate(() => { const s = window.__scene; if (!s.player.alive) return; const c = s.baseCenter; if (Math.hypot(s.player.x - c.x, s.player.y - c.y) > 80) s.player.setPosition(c.x + 30, c.y + 60); s.player.hp = 5; });
  }
  say('wrapping up', errors.length, 'errors');
  // everyone back up, needs written, the planet flushed
  const out = await page.evaluate(async () => {
    const s = window.__scene, st = window.__session.store;
    for (const n of [...s.warren.below.keys()]) s.warren.leave(n);
    for (const n of s.npcs) { n.data.traits.needs = { ...n.needs }; n.data.traits.weary = Math.round(n.weary * 100) / 100; n.data.pos_x = Math.round(n.x); n.data.pos_y = Math.round(n.y); await st.saveReplicant(n.data); }
    s.pending.npcTick = Date.now();
    s.pending.warren = structuredClone(s.warren.data);
    s.pending.supplies = { ...s.supplies };
    s.pending.buildings = structuredClone(s.buildings.list);
    s.pending.structures = s.village.structures;
    s.pending.village = { work: Math.round(s.village.work * 100) / 100 };
    await Promise.race([s.flushPlanet(), new Promise((r) => setTimeout(r, 3000))]);
    await new Promise((r) => setTimeout(r, 500));
    const after = { rooms: s.warren.data.rooms.filter((r) => r.dug).length, planned: s.warren.data.rooms.length, items: s.warren.data.items.length, entrance: s.warren.opened, structures: s.village.structures.length, buildings: s.buildings.list.length, embers: s.embers, supplies: s.supplies, felled: (s.pending.felled ?? window.__session.planet?.data.felled ?? []).length };
    return { after, log: s.mindLog.map((e) => e.text) };
  });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('replicated.local.v1')));
  const planet = stored.planets[`${p.star}:${p.pi}`];
  const npcs = stored.replicants.filter((r) => r.status === 'npc').map((r) => ({ id: r.id, needs: r.traits.needs, weary: r.traits.weary, sleptAt: r.traits.sleptAt, pos_x: r.pos_x, pos_y: r.pos_y }));
  await ctx.close();
  const { nodes: _n, ...data } = planet.data;
  const r = { star: p.star, pi: p.pi, emberDelta: planet.embers - p.embers, data, npcs, before, after: out.after, log: out.log, errors };
  console.log(`${p.star}: rooms ${before.rooms}->${out.after.rooms} of ${out.after.planned}, items ${before.items}->${out.after.items}, hole ${before.entrance}->${out.after.entrance}, village ${before.structures}->${out.after.structures}, embers ${r.emberDelta >= 0 ? '+' : ''}${r.emberDelta}, errors ${errors.length}`);
  return r;
}

try {
  const queue = [...planets];
  await Promise.all(Array.from({ length: Math.min(parallel, queue.length) }, async () => {
    while (queue.length) { const p = queue.shift(); try { results.push(await simulate(p)); } catch (e) { console.log(`${p.star}: failed ${e}`); } }
  }));
} finally { await browser.close(); try { process.kill(-server.pid); } catch {} }
fs.writeFileSync(outPath, JSON.stringify(results, null, 1));
console.log(`wrote ${results.length} planets to ${outPath}`);
