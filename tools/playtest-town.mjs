// Scripted headless playtest of the town (src/world/town.ts): a planet saved before the town (structures in a ring
// around the base, a building, a warren hatch by the vessel) loads, moves into the town once (every copy on its own
// lot with its own builds, the building on a civic lot, the hatch in the square's corner, nothing lost), saves, and a
// reload changes nothing; the world is open (rays and walking detours from the base); the copies live at home and
// reach the hatch, the Replicator, crystals, trees and each other without getting stuck.
// Usage: npm run build && node tools/playtest-town.mjs [seed.json] [--port 4187] [--shots]
//   seed.json: a snapshot of a live planet (the shape tools/sim-live.mjs takes); without it a made-up old Earth is used.
//   --shots: also saves screenshots/town-earth.png, town-earth-overview.png and town-street.png
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { chromium } from 'playwright';
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const port = Number(arg('port', 4187));
const seedPath = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
const shots = process.argv.includes('--shots');
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
for (;;) { try { if ((await fetch(`http://localhost:${port}/Replicated/`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }
const errors = [];
const log = (...a) => console.log(...a);
const fail = (m) => { errors.push(m); log('FAIL', m); };

// an old Earth: four copies, each with six builds in the ring around the old base, a built tower, a dug warren
function madeUpEarth() {
  const ids = ['c1', 'c2', 'c3', 'c4'];
  const kinds = ['hut', 'lamp', 'garden', 'flag', 'sign', 'totem'];
  const structures = [{ type: 'replicator', x: 886, y: 660, at: 1 }];
  ids.forEach((by, k) => kinds.forEach((type, j) => { const a = (k * 6 + j) / 24 * Math.PI * 2; structures.push({ type, x: Math.round(840 + Math.cos(a) * 90), y: Math.round(650 + Math.sin(a) * 60), at: 10 + k * 6 + j, by, ...(type === 'flag' ? { tint: 9 } : {}) }); }));
  const npcs = ids.map((id, k) => ({ id, profile_id: null, name: ['Glint', 'Prism', 'Sprout', 'Dusk'][k], model: 'replicant', status: 'npc', star_id: 'sol', planet_index: 3, pos_x: 840, pos_y: 706, created_at: `2026-10-06T00:0${k}:00Z`, traits: { v: 1, awake: true, feature: [10, 18, 11, 26][k], body: { head: 'round', visor: 'band', torso: 'slim', arms: 'thin', legs: 'thin', back: 'none', headgear: 0, primary: 'silver', secondary: 'slate', accent: 'gold' } } }));
  const data = {
    structures, nodes: { 3: { hits: 4, at: 1 } }, felled: [2, 5], doors: { 0: { open: true, taken: true } },
    buildings: [{ id: 'btower', name: 'Watchtower', purpose: 'To see far.', w: 2, h: 3, x: 756, y: 701, by: 'c1', material: 'stone', roof: 'dome', door: 'south', primary: 'grey', secondary: 'green', approved: true, progress: 18, built: true, helpers: ['c1', 'c2'], cost: { stone: 6 }, paid: true, at: 5 }],
    warren: { hatch: { x: 840, y: 694 }, entrance: { dug: true, swings: 0 }, rooms: [], items: [] },
    supplies: { wood: 10, stone: 10 }, village: { work: 0 },
  };
  return [{ star: 'sol', pi: 3, seed: 1969, embers: 100, data, npcs }];
}

const planets = seedPath ? JSON.parse(fs.readFileSync(seedPath, 'utf8')) : madeUpEarth();
const p = planets[0];
const PLAYER_ID = 'player-1';
const db = {
  profiles: [{ id: 'p1', name: 'STEVE', kid_mode: false, feature_color: 10, sort: 0 }],
  replicants: [{ id: PLAYER_ID, profile_id: 'p1', name: 'Steve', model: 'replicant', traits: { awake: true, feature: 10 }, status: 'active', star_id: p.star, planet_index: p.pi, pos_x: 900, pos_y: 760 }, ...p.npcs],
  planets: { [`${p.star}:${p.pi}`]: { star_id: p.star, planet_index: p.pi, seed: p.seed, embers: p.embers, data: p.data } },
  journeys: [], discovered: ['sol'], notes: [], mail: [], requests: [],
};
const before = p.data.structures.map((s) => `${s.type}|${s.by ?? ''}|${s.at}`).sort();

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await b.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((d) => { if (!localStorage.getItem('replicated.local.v1')) localStorage.setItem('replicated.local.v1', d); }, JSON.stringify(db));
  await page.goto(`http://localhost:${port}/Replicated/?sim&hour=13&rain=0`);
  await page.waitForFunction(() => !!window.__scene?.player && !!window.__scene.warren, null, { timeout: 60000 });
  const ev = (f, a) => page.evaluate(f, a);
  log('paint ms (ground, rock)', JSON.stringify(await ev(() => (window.__paintMs ?? []).map((v) => Math.round(v)))));

  // 1. the move into the town, as loaded
  const moved = await ev(() => {
    const s = window.__scene, town = s.map.town;
    const inLot = (lot, x, y) => x >= lot.rect.x * 16 - 2 && x <= (lot.rect.x + lot.rect.w) * 16 + 2 && y >= lot.rect.y * 16 - 2 && y <= (lot.rect.y + lot.rect.h) * 16 + 2;
    const copies = s.npcs.map((n) => {
      const lot = s.homeLot(n.data.id);
      const mine = s.village.structures.filter((x) => x.by === n.data.id);
      return { name: n.data.name, lot: lot?.index, mine: mine.length, onLot: lot ? mine.filter((x) => inLot(lot, x.x, x.y) || x.type === 'lamp').length : 0, home: lot ? Math.round(Math.hypot(n.x - lot.yard.x, n.y - lot.yard.y)) : -1 };
    });
    const v = s.vesselPos, pl = s.player;
    return {
      migrated: s.migrated, layout: s.pending.layout ?? window.__session.planet?.data.layout, structures: s.village.structures.length,
      lots: copies, distinctLots: new Set(copies.map((c) => c.lot)).size,
      buildings: s.buildings.list.map((x) => ({ name: x.name, built: x.built, progress: x.progress, helpers: x.helpers.length, lot: s.townState.civic[x.id], kind: town.lots[s.townState.civic[x.id]]?.kind })),
      hatch: s.warren.hatch, townHatch: town.hatch, playerFromVessel: Math.round(Math.hypot(pl.x - v.x, pl.y - v.y)),
      replicator: s.village.structures.find((x) => x.type === 'replicator'), pad: s.map.base.pad,
      positions: new Set(s.village.structures.map((x) => `${x.x},${x.y}`)).size,
    };
  });
  log('moved', JSON.stringify(moved));
  if (!moved.migrated) fail('the old save was not moved into the town');
  if (moved.structures !== p.data.structures.length) fail(`structures lost: ${moved.structures} of ${p.data.structures.length}`);
  if (moved.positions !== moved.structures) fail('two builds share a spot');
  if (moved.distinctLots !== p.npcs.length || moved.lots.some((c) => c.lot === undefined)) fail('not every copy has a lot of its own');
  if (moved.lots.some((c) => c.onLot < c.mine)) fail('a copy has builds off its lot');
  if (moved.lots.some((c) => c.home > 40)) fail('a copy did not start at home');
  if (moved.buildings.some((x) => x.lot === undefined || x.kind !== 'civic')) fail('a building is not on a civic lot');
  if (moved.hatch.x !== moved.townHatch.x || moved.hatch.y !== moved.townHatch.y) fail('the hatch did not move into the square');
  if (moved.playerFromVessel > 60) fail('the replicant is not by the vessel');
  if (moved.replicator && (moved.replicator.x !== moved.pad.x || moved.replicator.y !== moved.pad.y)) fail('the Replicator left its pad');

  // the save holds the move (the scene flushes every 4 s)
  await page.waitForFunction(() => { const d = JSON.parse(localStorage.getItem('replicated.local.v1')); return Object.values(d.planets)[0].data.layout === 2; }, null, { timeout: 15000 }).catch(() => fail('the town was never saved'));
  const saved1 = await ev(() => Object.values(JSON.parse(localStorage.getItem('replicated.local.v1')).planets)[0].data);
  const after = saved1.structures.map((s) => `${s.type}|${s.by ?? ''}|${s.at}`).sort();
  if (JSON.stringify(before) !== JSON.stringify(after)) fail('the saved structures differ from the old ones (lost or duplicated)');
  if (Object.values(saved1.nodes ?? {}).some((n) => n.hits)) fail('old crystal damage was carried over');
  if ((saved1.felled ?? []).length) fail('old felled trees were carried over');
  log('saved', JSON.stringify({ layout: saved1.layout, town: saved1.town, hatch: saved1.warren?.hatch, buildings: saved1.buildings?.map((x) => [x.name, x.x, x.y, x.built]) }));

  // 2. open ground: rays and shortest-walk detours from the base (the lead's baseline method)
  const reach = await ev(() => {
    const s = window.__scene, map = s.map, c = map.base.center;
    const cx = Math.floor(c.x / 16), cy = Math.floor(c.y / 16), W = map.w, H = map.h;
    const ok = (x, y) => x >= 0 && y >= 0 && x < W && y < H && map.cells[y * W + x] === 1;
    const rays = [];
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; let d = 0; while (d < 60 && ok(Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d))) d += 0.5; rays.push(Math.round(d)); }
    const dist = new Float32Array(W * H).fill(1e9); dist[cy * W + cx] = 0;
    const buckets = [[cy * W + cx]];
    for (let bk = 0; bk < buckets.length; bk++) { const list = buckets[bk]; if (!list) continue; for (const i of list) { const x = i % W, y = (i / W) | 0; const d0 = dist[i]; if (Math.floor(d0 * 2) !== bk) continue; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) { const nx = x + dx, ny = y + dy; if (!ok(nx, ny)) continue; if (dx && dy && (!ok(x + dx, y) || !ok(x, y + dy))) continue; const nd = d0 + (dx && dy ? 1.414 : 1); const j = ny * W + nx; if (nd < dist[j]) { dist[j] = nd; (buckets[Math.floor(nd * 2)] ||= []).push(j); } } } }
    const ratios = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const e = Math.hypot(x - cx, y - cy); if (e < 15 || e > 40 || !ok(x, y) || dist[y * W + x] > 1e8) continue; ratios.push(dist[y * W + x] / e); }
    ratios.sort((a, b) => a - b);
    let land = 0, rock = 0; for (const v of map.cells) { if (v) land++; if (v === 2) rock++; }
    return { size: [W, H], rockOfLand: +(rock / land).toFixed(3), rayMedian: [...rays].sort((a, b) => a - b)[8], detour90: +ratios[Math.floor(ratios.length * 0.9)].toFixed(2), over1_3: +(ratios.filter((r) => r > 1.3).length / ratios.length).toFixed(3) };
  });
  log('open', JSON.stringify(reach));
  if (reach.over1_3 > 0.08 || reach.detour90 > 1.25 || reach.rayMedian < 28) fail('the world is not open enough');

  // 3. copies reach what they need over open ground from home (BFS over walkable tiles, as they walk)
  const ways = await ev(() => {
    const s = window.__scene, map = s.map, W = map.w, H = map.h;
    const ok = (x, y) => x >= 0 && y >= 0 && x < W && y < H && map.walls[y][x] < 0;
    const from = (p) => { const seen = new Uint8Array(W * H); const q = [Math.floor(p.y / 16) * W + Math.floor(p.x / 16)]; seen[q[0]] = 1; for (let i = 0; i < q.length; i++) { const x = q[i] % W, y = (q[i] / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (ok(nx, ny) && !seen[ny * W + nx]) { seen[ny * W + nx] = 1; q.push(ny * W + nx); } } } return (t) => !!seen[Math.floor(t.y / 16) * W + Math.floor(t.x / 16)]; };
    const out = [];
    for (const n of s.npcs) {
      const can = from(n.home ?? n);
      const targets = [['hatch', s.warren.hatch], ['replicator', s.replicatorSpot], ...s.npcs.filter((o) => o !== n).map((o) => [o.data.name, o.home ?? o]), ...s.nodes.filter((c) => Math.hypot(c.x - n.home.x, c.y - n.home.y) < 330).map((c) => ['crystal', [{ x: c.x + 12, y: c.y + 4 }, { x: c.x - 12, y: c.y + 4 }]]), ...s.trees.filter((t) => t.alive && Math.hypot(t.x - n.home.x, t.y - n.home.y) < 300).map((t) => ['tree', { x: t.x + 12, y: t.y + 3 }])];
      const miss = targets.filter(([, t]) => !(Array.isArray(t) ? t.some(can) : can(t))).map(([k]) => k);
      out.push({ name: n.data.name, crystals: targets.filter(([k]) => k === 'crystal').length, trees: targets.filter(([k]) => k === 'tree').length, miss });
    }
    return out;
  });
  log('ways', JSON.stringify(ways));
  if (ways.some((w) => w.miss.length)) fail('a copy cannot reach something it needs');
  if (ways.some((w) => !w.crystals)) fail('a copy has no crystal within reach of home');
  if (ways.some((w) => !w.trees)) log('note: a copy has no tree near home (the base radius still gives wood)');

  // 4. let them live a minute: nobody stands stuck in a walk for long
  await ev(() => { const s = window.__scene; s.village.work = 40; s.npcs.forEach((n) => { n.nextBuild = 0; n.nextTrip = 0; }); window.__stuck = {}; window.__walked = {}; });
  let stuck = 0;
  const track = {};
  for (let t = 0; t < 120; t++) {
    await page.waitForTimeout(500);
    const now = await ev(() => window.__scene.npcs.map((n) => ({ id: n.data.id, name: n.data.name, state: n.state, x: n.x, y: n.y, target: n.target })));
    for (const n of now) {
      const k = track[n.id] ??= { x: n.x, y: n.y, still: 0, walked: 0, states: new Set() };
      k.states.add(n.state);
      const moved = Math.hypot(n.x - k.x, n.y - k.y);
      k.walked += moved;
      if ((n.state === 'walk' || n.state === 'carry') && moved < 0.5) k.still++; else k.still = 0;
      if (k.still === 8) { stuck++; log('stuck 4 s:', n.name, n.state, Math.round(n.x), Math.round(n.y), JSON.stringify(n.target)); }
      k.x = n.x; k.y = n.y;
    }
  }
  const life = await ev(() => { const s = window.__scene; return { builds: s.village.structures.length, embers: s.embers, log: s.mindLog.slice(-8).map((e) => e.text) }; });
  log('a minute in town', JSON.stringify(Object.fromEntries(Object.values(track).map((k, i) => [i, { walked: Math.round(k.walked), states: [...k.states].join('/') }]))), JSON.stringify(life));
  if (stuck) fail(`${stuck} times a copy stood stuck in a walk for 4 s`);

  if (shots) {
    const snap = async (name, w = 960, h = 540) => {
      const url = await ev(([w, h]) => new Promise((res) => window.__game.renderer.snapshot((img) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(img, 0, 0, w, h); res(c.toDataURL('image/png')); })), [w, h]);
      fs.writeFileSync(`screenshots/${name}.png`, Buffer.from(url.split(',')[1], 'base64'));
      log('saved', name);
    };
    // the landing view: by the vessel, the square, the first homes
    await ev(() => { const s = window.__scene, v = s.vesselPos; s.player.setPosition(v.x + 20, v.y + 18); s.cameras.main.centerOn(v.x + 30, v.y + 10); });
    await page.waitForTimeout(1500);
    await snap('town-earth');
    // down the main street between the homes
    await ev(() => { const s = window.__scene, l = s.map.town.lots[0]; s.player.setPosition(l.front.x + 10, l.front.y + 28); s.cameras.main.centerOn(l.front.x + 10, l.front.y + 10); });
    await page.waitForTimeout(1500);
    await snap('town-street');
    // the whole island from above
    await ev(() => { const s = window.__scene; s.cameras.main.stopFollow(); s.cameras.main.setZoom(0.115); s.cameras.main.centerOn(s.map.w * 8, s.map.h * 8); });
    await page.waitForTimeout(1200);
    await snap('town-earth-overview', 1440, 810);
  }
  // 5. reload: nothing moves again
  await page.reload();
  await page.waitForFunction(() => !!window.__scene?.player && !!window.__scene.warren, null, { timeout: 60000 });
  await page.waitForTimeout(5000);
  const again = await ev(() => { const s = window.__scene; return { migrated: s.migrated, town: s.townState, structures: s.village.structures.map((x) => `${x.type}|${x.x},${x.y}`).sort(), buildings: s.buildings.list.map((x) => `${x.id}|${x.x},${x.y}|${x.built}`), hatch: s.warren.hatch }; });
  const saved2 = await ev(() => Object.values(JSON.parse(localStorage.getItem('replicated.local.v1')).planets)[0].data);
  log('reload', JSON.stringify({ migrated: again.migrated, town: again.town }));
  if (again.migrated) fail('the town move ran a second time');
  if (JSON.stringify(again.town) !== JSON.stringify(saved1.town)) fail('lots changed on reload');
  const savedStructs = saved1.structures.map((x) => `${x.type}|${x.x},${x.y}`).sort();
  const liveAfter = saved2.structures.filter((x) => saved1.structures.some((y) => y.at === x.at && y.type === x.type)).map((x) => `${x.type}|${x.x},${x.y}`).sort();
  if (JSON.stringify(liveAfter) !== JSON.stringify(savedStructs)) fail('builds moved on reload');
  if (again.hatch.x !== saved1.warren?.hatch?.x && saved1.warren) fail('the hatch moved on reload');
} finally { await b.close(); try { process.kill(-server.pid); } catch {} }
console.log('errors', errors);
process.exit(errors.length ? 1 : 0);
