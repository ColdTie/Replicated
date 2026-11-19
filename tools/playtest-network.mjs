// Scripted headless playtest of the links between worlds (the maker, 2026-11-19 pm): Tamsin's Cem Mind and Watcher's
// Watchglass wait for the Nous Chip; a letter to another star takes the light's time until a Cem Mind stands at both
// ends, then it arrives at once; a watch kept on another Watchglass world reaches this one once its light has crossed,
// never one kept before both stood, and the journal's HERE page shows it. Also lands on Glasswind.
// Usage: npm run build && node tools/playtest-network.mjs
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const port = 4237;
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
  await page.waitForFunction(() => !!window.__scene?.player && !!window.__scene.buildings, null, { timeout: 30000 });
  for (let i = 0; i < 6 && await ev(() => !!window.__scene.dialogue?.open); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }

  // 1. both wait for the Nous Chip
  for (const id of ['cemmind', 'watchglass']) {
    const why = await ev((d) => window.__scene.buildings.whyNot(d), id);
    log(id, 'whyNot', why);
    if (!String(why).includes('NOUS')) fail(`${id} does not wait for the Nous Chip (${why})`);
  }

  // 2. letters: light speed, then at once between two Cem Minds
  const far = 'gliese-12';
  const letters = await ev((far) => {
    const s = window.__scene, now = Date.now();
    const light = s.mailTo(far);
    s.network = [{ star: far, planet: 1, buildings: [{ design: 'cemmind', built: true }], archive: [] }];
    const oneEnd = s.mailTo(far);
    s.buildings.list.push({ id: 'cm-test', design: 'cemmind', name: 'Cem Mind', built: false, printStart: now - 1000, printMs: 500, by: 'player' });
    const both = s.mailTo(far);
    return { light, oneEnd, both };
  }, far);
  log('letters', JSON.stringify(letters));
  if (!(letters.light > 0)) fail('a letter to another star took no time before any Cem Mind');
  if (letters.oneEnd !== letters.light) fail('one Cem Mind alone changed the letter time');
  if (letters.both !== 0) fail('a letter between two Cem Minds did not arrive at once');

  // 3. the Watchglass: a far watch arrives after its light; an old one never; none without a Watchglass here
  const watch = await ev(() => {
    const s = window.__scene, now = Date.now(), H = 3_600_000;
    s.buildings.list = s.buildings.list.filter((b) => b.id !== 'cm-test');
    const sol = (at) => ({ by: 'w', name: 'Watcher', star: 'PROXIMA CENTAURI', ly: 4.2, text: `seen at ${at}`, at });
    s.network = [{ star: 'sol', planet: 3, buildings: [{ design: 'watchglass', built: true, printStart: now - 48 * H }], archive: [sol(now - 47 * H), sol(now - 1000), sol(now - 72 * H)] }];
    const none = s.sharedWatches().length;
    s.buildings.list.push({ id: 'wg-test', design: 'watchglass', name: 'Watchglass', built: true, printStart: now - 50 * H, by: 'player' });
    const got = s.sharedWatches();
    return { none, got: got.map((w) => w.text), from: got[0]?.fromStar };
  });
  log('watch', JSON.stringify(watch));
  if (watch.none !== 0) fail('watches arrived without a Watchglass here');
  if (watch.got.length !== 1) fail(`expected one arrived watch (the recent one still in flight, the old one before the Watchglass), got ${watch.got.length}`);

  // 4. the journal's HERE page shows it
  await page.keyboard.press('Tab');
  await page.waitForTimeout(600);
  const here = await ev(() => {
    const tab = [...document.querySelectorAll('button, [data-tab]')].find((e) => /HERE/.test(e.textContent ?? ''));
    tab?.click();
    return document.body.innerText;
  });
  await page.waitForTimeout(300);
  const text = await ev(() => document.body.innerText);
  if (!/THROUGH THE WATCHGLASS/.test(text + here)) fail('the journal does not show the watches through the Watchglass');
  await page.keyboard.press('Escape');

  // 5. Glasswind loads and is landed on
  const w = await b.newPage({ viewport: { width: 960, height: 540 } });
  w.on('pageerror', (e) => errors.push(`GLASSWIND: ${e}`));
  await w.goto(`http://localhost:${port}/Replicated/?local&shot=1&at=lalande-21185&pi=1`);
  await w.waitForFunction(() => !!window.__scene?.player, null, { timeout: 30000 }).catch(() => fail('Glasswind did not load'));
  const got = await w.evaluate(() => window.__scene?.planet?.name);
  log('landed', got);
  if (got !== 'GLASSWIND') fail(`landed on ${got}, not GLASSWIND`);
  await w.close();
} catch (e) {
  fail(String(e));
} finally {
  await b.close();
  try { process.kill(-server.pid); } catch { /* gone */ }
}
if (errors.length) { console.log('ERRORS', errors); process.exit(1); }
console.log('ok');
