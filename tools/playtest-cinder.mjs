// Scripted headless playtest of Cinder Sounding's glass ridges (Vigil's carried wish, docs/universe.md; items.json
// soundglass): the world on Gliese 884 b has rows of sounding-glass fins out on the sand, no other world has any, the
// older nodes keep their indexes (the ridges come last), a fin breaks in its hits and its sounding glass goes into the
// world's store.
// Usage: npm run build && node tools/playtest-cinder.mjs   (saves screenshots/cinder-ridge.png; fails loudly on page errors)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { chromium } from 'playwright';
const port = 4231;
const ITEMS = JSON.parse(fs.readFileSync('src/data/items.json', 'utf8'));
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
  const kinds = () => ev(() => window.__scene.nodes.map((n) => n.kind));

  // another world has no glass
  await page.goto(`http://localhost:${port}/Replicated/?shot=1&at=sol&pi=3`);
  await page.waitForFunction(() => !!window.__scene?.player && window.__scene.nodes.length > 0, null, { timeout: 30000 });
  const earth = await kinds();
  if (earth.includes('soundglass')) fail('Earth has glass ridges');
  log('earth nodes', earth.length, 'glass', earth.filter((k) => k === 'soundglass').length);

  // Cinder Sounding: rows of fins, every one after every older node
  await page.goto(`http://localhost:${port}/Replicated/?shot=1&at=gliese-884&pi=1&hour=17.5`);
  await page.waitForFunction(() => !!window.__scene?.player && window.__scene.nodes.length > 0 && window.__scene.planet.id === 'cinder', null, { timeout: 30000 });
  const ks = await kinds();
  const glass = ks.filter((k) => k === 'soundglass').length, want = ITEMS.soundglass.ridges * ITEMS.soundglass.perRidge;
  log('cinder nodes', ks.length, 'glass', glass, 'of', want);
  if (glass < want - ITEMS.soundglass.perRidge || glass > want) fail(`${glass} glass fins (want about ${want})`);
  if (ks.indexOf('soundglass') !== ks.length - glass) fail('a glass fin comes before an older node');

  // stand by the fin nearest the base and break it: its glass reaches the store
  const at = await ev(() => {
    const s = window.__scene, c = s.map.base.center;
    const n = s.nodes.filter((x) => x.kind === 'soundglass').sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0];
    s.player.setPosition?.(n.x - 26, n.y + 4);
    if (!s.player.setPosition) { s.player.x = n.x - 26; s.player.y = n.y + 4; }
    s.cameras.main.centerOn(n.x, n.y);
    return { x: n.x, y: n.y, before: Math.floor(s.supplies.soundglass ?? 0) };
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'screenshots/cinder-ridge.png' });
  await ev(({ x, y }) => {
    const s = window.__scene, n = s.nodes.find((q) => q.kind === 'soundglass' && q.x === x && q.y === y);
    const dir = { x: 1, y: 0 };
    while (n.alive) n.hit(dir);
  }, at);
  await page.waitForFunction((before) => Math.floor(window.__scene.supplies.soundglass ?? 0) > before, at.before, { timeout: 15000 }).catch(() => {});
  const after = await ev(() => Math.floor(window.__scene.supplies.soundglass ?? 0));
  log('sounding glass in the store', at.before, '->', after);
  if (after <= at.before) fail('the broken fin gave no sounding glass to the store');
} catch (e) {
  fail(String(e));
} finally {
  await b.close();
  try { process.kill(-server.pid); } catch { /* gone */ }
}
if (errors.length) { console.log('ERRORS', errors); process.exit(1); }
console.log('OK');
