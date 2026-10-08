// Scripted headless playtest of a beacon world: the sleeping keeper wakes, fights, falls; the monolith lights,
// the Spark drops and is collected; the planet save and the star map know the beacon is lit.
// Usage: npm run build && node tools/playtest-beacon.mjs   (saves screenshots/beacon-*.png; fails loudly on page errors)
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const port = 4185;
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
for (;;) { try { if ((await fetch(`http://localhost:${port}/Replicated/`)).ok) break; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 200)); }
const errors = [];
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const log = (...a) => console.log(...a);
const shot = (page, name) => page.screenshot({ path: `screenshots/${name}.png` });
try {
  const page = await b.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://localhost:${port}/Replicated/?shot=1&at=fomalhaut&view=beacon&hour=21`);
  await page.waitForFunction(() => !!window.__scene?.player, null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.mouse.click(480, 270);
  await page.waitForTimeout(300);
  const ev = (f, arg) => page.evaluate(f, arg);
  const st = await ev(() => { const s = window.__scene; return { planet: s.planet.name, star: s.planet.star, beacon: !!s.map.beacon, lit: s.beacon?.lit, keeper: s.guardian?.state, hp: s.guardian?.hp, plaza: s.map.beacon?.plaza }; });
  log('world', JSON.stringify(st));
  if (!st.beacon || st.lit !== false || st.keeper !== 'asleep') throw new Error('beacon world did not stage');
  await shot(page, 'beacon-sleep');

  // walk up: the keeper wakes
  await ev(() => { const s = window.__scene; s.frozen = false; const g = s.guardian; s.player.setPosition(g.x - 10, g.y + 40); });
  await page.waitForTimeout(1600);
  log('after approach', await ev(() => window.__scene.guardian.state));
  await shot(page, 'beacon-wake');

  // keep your distance: it charges (and may stun itself on a wall)
  let sawCharge = false;
  for (let i = 0; i < 40 && !sawCharge; i++) {
    await page.waitForTimeout(100);
    sawCharge = await ev(() => { const s = window.__scene, g = s.guardian, p = s.player; p.hp = 5; if (g.state !== 'charge' && g.state !== 'stunned') p.setPosition(g.x + 84, g.y); return g.state === 'charge'; });
  }
  log('charge seen', sawCharge);
  if (!sawCharge) throw new Error('keeper never charged');
  // step out of its way: with nothing to hit it may run into the plaza wall and stun itself
  await ev(() => { const s = window.__scene, g = s.guardian, p = s.player; p.setPosition(g.x + 40, g.y + 44); });
  let sawStun = false;
  for (let i = 0; i < 12 && !sawStun; i++) { await page.waitForTimeout(100); sawStun = await ev(() => window.__scene.guardian.state === 'stunned'); }
  log('stun seen', sawStun, '(only if the charge met a wall)');

  // fight: stay close, keep hp topped up (this is a mechanics test, not a skill test), swing at it
  let fightShot = false, stunned = false, slammed = false, charged = false;
  for (let i = 0; i < 160; i++) {
    await page.waitForTimeout(120);
    const r = await ev((i) => {
      const s = window.__scene, g = s.guardian, p = s.player;
      if (!g.alive) return { dead: true };
      p.hp = 5;
      const d = Math.hypot(g.x - p.x, g.y - p.y);
      if (d > 26) p.setPosition(g.x + (p.x > g.x ? 22 : -22), g.y + 4);
      const aim = { x: Math.sign(g.x - p.x) || 1, y: 0 };
      s.resolveAttack(p.x + aim.x * 14, p.y - 5, 17, aim, i % 3 === 2);
      return { state: g.state, hp: g.hp, d: Math.round(d) };
    }, i);
    if (r.dead) break;
    charged ||= r.state === 'charge'; stunned ||= r.state === 'stunned'; slammed ||= r.state === 'slamAir';
    if (!fightShot && (r.state === 'charge' || r.state === 'slamAir' || r.state === 'chargeWindup')) { fightShot = true; await shot(page, 'beacon-fight'); }
    if (i % 10 === 0) log('fight', JSON.stringify(r));
  }
  const after = await ev(() => { const s = window.__scene; return { alive: s.guardian.alive, hp: s.guardian.hp }; });
  log('keeper', JSON.stringify(after), 'saw charge', charged, 'stun', stunned, 'slam', slammed);
  if (after.alive) throw new Error('keeper did not fall');
  if (!fightShot) await shot(page, 'beacon-fight');
  await page.waitForTimeout(2600);
  const lit = await ev(() => { const s = window.__scene; return { lit: s.beacon.lit, sparks: s.sparks.length, taken: window.__session.replicant.traits.sparks ?? 0, pending: !!s.pending.beacon }; });
  log('lit', JSON.stringify(lit));
  if (!lit.lit || lit.sparks + lit.taken !== 1 || !lit.pending) throw new Error('beacon did not light or no spark');
  await shot(page, 'beacon-lit');

  // collect the spark
  // (it may already have flown to you: the keeper fell at your feet)
  await ev(() => { const s = window.__scene; const sp = s.sparks[0]; if (sp) s.player.setPosition(sp.x, sp.y + 6); });
  await page.waitForTimeout(1800);
  // screenshot mode never writes saves, so push the queued beacon delta through the store by hand
  const got = await ev(async () => {
    const s = window.__scene, st = window.__session.store;
    const pending = s.pending.beacon;
    await st.applyPlanetDelta(s.planet.star, s.planet.planetIndex, 0, { nodes: {}, beacon: pending });
    const save = await st.loadPlanet(s.planet.star, s.planet.planetIndex, s.planet.seed);
    const litStars = await st.litBeacons();
    return { left: s.sparks.length, sparks: window.__session.replicant.traits.sparks, pending, saved: save.data.beacon, litStars };
  });
  log('spark', JSON.stringify(got));
  if (got.left !== 0 || got.sparks !== 1 || !got.saved?.lit || !got.litStars.includes('fomalhaut')) throw new Error('spark or save wrong');
  await shot(page, 'beacon-after');

  // the star map shows the lit beacon
  await ev(() => { const s = window.__scene; s.scene.pause(); s.scene.launch('starmap', { mode: 'view', from: 'fomalhaut', lit: ['fomalhaut'] }); });
  await page.waitForTimeout(1200);
  await shot(page, 'map-beacon-lit');
  log('errors', JSON.stringify(errors));
} finally {
  await b.close();
  process.kill(-server.pid);
}
process.exit(errors.length ? 1 : 0);
