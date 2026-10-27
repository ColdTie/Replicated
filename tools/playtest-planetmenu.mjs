// Headless playtest of the planet menu (src/ui/planetMenu.ts) beside the 3D star map: it opens with the map, lists
// RECENT and CLOSEST worlds with their details; a click on a row picks that planet on the map, a pick on the map lights
// its row, Up / Down walk the rows (the map follows), L hides and shows the list, and it is gone with the map.
// Usage: npm run build && node tools/playtest-planetmenu.mjs   (saves screenshots/planet-menu*.png)
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const port = 4198;
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
for (;;) { try { if ((await fetch(`http://localhost:${port}/Replicated/`)).ok) break; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 200)); }
const errors = [];
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const log = (...a) => console.log(...a);
const fail = (m) => { errors.push(m); log('FAIL', m); };
try {
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://localhost:${port}/Replicated/?shot=1&view=base&hour=21`);
  await page.waitForFunction(() => !!window.__scene?.player, null, { timeout: 30000 });
  await page.waitForTimeout(800);
  const ev = (f, a) => page.evaluate(f, a);
  // open the map the way the board ring does (launch mode, from the homeworld)
  await ev(() => { const s = window.__scene; s.scene.pause(); s.scene.launch('starmap', { mode: 'launch', from: s.planet.star, fromPlanet: s.planet.planetIndex, embers: 200 }); });
  await page.waitForSelector('.pm .pm-row', { timeout: 8000 }).catch(() => fail('the planet menu did not open with the map'));
  await page.waitForTimeout(1500);
  const groups = await ev(() => [...document.querySelectorAll('.pm .pm-group')].map((g) => g.textContent));
  const rows = await ev(() => [...document.querySelectorAll('.pm .pm-row')].map((r) => r.querySelector('.n').textContent));
  log('groups', JSON.stringify(groups), 'rows', rows.length, JSON.stringify(rows.slice(0, 4)));
  if (groups.join() !== 'RECENT,CLOSEST') fail('the menu does not have RECENT and CLOSEST');
  if (!rows[0]?.startsWith('LHS 1140 B')) fail('this world does not lead RECENT');
  // CLOSEST holds other stars only (the planets of this one sit at 0.0 LY on the map), at most three worlds a star
  const closest = await ev(() => { let on = false; const out = []; for (const el of document.querySelector('.pm .pm-list').children) { if (el.classList.contains('pm-group')) on = el.textContent === 'CLOSEST'; else if (on) out.push(el.querySelector('.s').textContent); } return out; });
  const perStar = closest.reduce((m, s) => m.set(s.split(' - ')[0], (m.get(s.split(' - ')[0]) ?? 0) + 1), new Map());
  log('closest', JSON.stringify(closest.slice(0, 6)), JSON.stringify([...perStar]));
  if (!closest.length || closest.some((s) => s.startsWith('LHS 1140 ') || s.includes(' 0.0 LY'))) fail('CLOSEST lists the planets of the star you are at');
  if ([...perStar.values()].some((n) => n > 3)) fail('CLOSEST lists more than three worlds of one star');
  await page.screenshot({ path: 'screenshots/planet-menu.png' });

  // a click on a CLOSEST row: its details open and the map picks that planet
  // (a locator: the list refills once the map's clock reaches its timer, which a slow headless frame can delay)
  await page.locator('.pm .pm-row').nth(2).click();
  await page.waitForTimeout(700);
  const picked = await ev(() => { const m = window.__game.scene.getScene('starmap'); const on = document.querySelector('.pm .pm-row.on'); return { view: m.view, star: m.sysStar?.id, planet: m.selPlanet?.index, row: on?.querySelector('.n').textContent, details: [...(on?.querySelectorAll('.d div') ?? [])].map((d) => d.textContent) }; });
  log('picked', JSON.stringify(picked));
  if (picked.view !== 'system' || !picked.star || !picked.planet) fail('a row did not pick its planet on the map');
  for (const want of ['STAR ', 'LIGHT YEARS', 'FUEL', 'HABITABLE ZONE', 'VESSELS', 'HUSK', 'MAKES']) if (!picked.details.some((d) => d.includes(want))) fail(`the details lack ${want}`);
  await page.screenshot({ path: 'screenshots/planet-menu-details.png' });

  // Down: the next row, and the map follows it
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(500);
  const next = await ev(() => { const m = window.__game.scene.getScene('starmap'); return { star: m.sysStar?.id, planet: m.selPlanet?.index, row: document.querySelector('.pm .pm-row.on .n')?.textContent }; });
  log('down', JSON.stringify(next));
  if (next.row === picked.row || !next.star) fail('Down did not move to the next row and pick it on the map');

  // a pick on the map lights its row: back to the galaxy, pick another star
  await ev(() => { const m = window.__game.scene.getScene('starmap'); m.closeSystem(); });
  await page.waitForTimeout(300);
  const tapped = await ev(() => {
    const m = window.__game.scene.getScene('starmap');
    const rowsNow = [...document.querySelectorAll('.pm .pm-row')].map((r) => r.querySelector('.s').textContent);
    const target = m.projected.find((p) => p.star.id !== m.d.from && rowsNow.some((t) => t.startsWith(p.star.name + ' ')) && p.sx > 140 && p.sx < 460 && p.sy > 30 && p.sy < 240);
    if (!target) return null;
    m.tap(target.sx, target.sy);
    return { name: target.star.name, row: document.querySelector('.pm .pm-row.on .s')?.textContent };
  });
  log('map pick', JSON.stringify(tapped));
  if (!tapped || !tapped.row?.startsWith(tapped.name)) fail('a pick on the map did not light its row');

  // L hides the list (the map takes the room back) and shows it again
  const w0 = await ev(() => window.__game.scene.getScene('starmap').offX);
  await page.keyboard.press('KeyL');
  await page.waitForTimeout(200);
  const w1 = await ev(() => ({ off: window.__game.scene.getScene('starmap').offX, hidden: document.querySelector('.pm').classList.contains('off') }));
  await page.keyboard.press('KeyL');
  log('toggle', w0, JSON.stringify(w1));
  if (!w0 || w1.off !== 0 || !w1.hidden) fail('L did not hide the list and give the map its room');

  // gone with the map
  await ev(() => window.__game.scene.getScene('starmap').close());
  await page.waitForTimeout(300);
  if (await ev(() => !!document.querySelector('.pm'))) fail('the planet menu stayed after the map closed');
  log('errors', JSON.stringify(errors));
} finally {
  await b.close();
  try { process.kill(-server.pid); } catch { /* the preview server already stopped */ }
}
process.exit(errors.length ? 1 : 0);
