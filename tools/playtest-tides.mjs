// Scripted headless playtest of Lignin Tides' lignin reefs (Ember Gold's carried wish, docs/universe.md; items.json
// tidelignin): the world on GJ 1061 b has clusters of lignin shelves on its ponds' rims, no other world has any, the
// older nodes keep their indexes (the reefs come last), a reef breaks in its hits and its tidal lignin goes into the
// world's store.
// Usage: npm run build && node tools/playtest-tides.mjs   (saves screenshots/tides-reef.png; fails loudly on page errors)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { chromium } from 'playwright';
const port = 4232;
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
  // the generated nodes only (by index; the wild fields' salt blooms come after them, keyed by name)
  const kinds = () => ev(() => window.__scene.nodes.filter((n) => /^\d+$/.test(n.key)).map((n) => n.kind));

  // another world has no reefs
  await page.goto(`http://localhost:${port}/Replicated/?shot=1&at=sol&pi=3`);
  await page.waitForFunction(() => !!window.__scene?.player && window.__scene.nodes.length > 0, null, { timeout: 30000 });
  const earth = await kinds();
  if (earth.includes('tidelignin')) fail('Earth has lignin reefs');
  log('earth nodes', earth.length, 'reef', earth.filter((k) => k === 'tidelignin').length);

  // Lignin Tides: reefs on the rims, every one after every older node
  await page.goto(`http://localhost:${port}/Replicated/?shot=1&at=gj-1061&pi=1&hour=12`);
  await page.waitForFunction(() => !!window.__scene?.player && window.__scene.nodes.length > 0 && window.__scene.planet.id === 'tides', null, { timeout: 30000 });
  const ks = await kinds();
  const reef = ks.filter((k) => k === 'tidelignin').length, want = ITEMS.tidelignin.reefs * ITEMS.tidelignin.perReef;
  log('tides nodes', ks.length, 'reef', reef, 'of', want);
  if (reef < want - ITEMS.tidelignin.perReef || reef > want) fail(`${reef} reef shelves (want about ${want})`);
  if (ks.indexOf('tidelignin') !== ks.length - reef) fail('a reef shelf comes before an older node');

  // stand by the reef nearest the base and break it: its reef reaches the store
  const at = await ev(() => {
    const s = window.__scene, c = s.map.base.center;
    const n = s.nodes.filter((x) => x.kind === 'tidelignin').sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0];
    s.player.setPosition?.(n.x - 26, n.y + 4);
    if (!s.player.setPosition) { s.player.x = n.x - 26; s.player.y = n.y + 4; }
    s.cameras.main.centerOn(n.x, n.y);
    return { x: n.x, y: n.y, before: Math.floor(s.supplies.tidelignin ?? 0) };
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'screenshots/tides-reef.png' });
  await ev(({ x, y }) => {
    const s = window.__scene, n = s.nodes.find((q) => q.kind === 'tidelignin' && q.x === x && q.y === y);
    const dir = { x: 1, y: 0 };
    while (n.alive) n.hit(dir);
  }, at);
  await page.waitForFunction((before) => Math.floor(window.__scene.supplies.tidelignin ?? 0) > before, at.before, { timeout: 15000 }).catch(() => {});
  const after = await ev(() => Math.floor(window.__scene.supplies.tidelignin ?? 0));
  log('tidal lignin in the store', at.before, '->', after);
  if (after <= at.before) fail('the broken reef gave no tidal lignin to the store');
} catch (e) {
  fail(String(e));
} finally {
  await b.close();
  try { process.kill(-server.pid); } catch { /* gone */ }
}
if (errors.length) { console.log('ERRORS', errors); process.exit(1); }
console.log('OK');
