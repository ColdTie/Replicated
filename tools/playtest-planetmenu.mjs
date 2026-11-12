// Headless playtest of the planet menu (src/ui/planetMenu.ts) beside the 3D star map: it opens with the map, lists
// RECENT and CLOSEST worlds with their details; a click on a row picks that planet on the map, a pick on the map lights
// its row, Up / Down walk the rows (the map follows), L hides and shows the list, it is gone with the map, and Enter on
// the chosen row goes to that row's world (picking it first when the LAUNCH button points elsewhere), once.
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

  // Enter on the list's chosen row goes to that row's world and no other. A star picked on the map lights its first
  // row in the list, which is not always the planet the LAUNCH button would fly to: the first Enter then picks the
  // row's planet, the next one launches there, and two keys in one breath launch once
  await ev(() => { const s = window.__scene; window.__launched = []; s.scene.launch('starmap', { mode: 'launch', from: s.planet.star, fromPlanet: s.planet.planetIndex, embers: 9999, onLaunch: (star, planet) => window.__launched.push(`${star}:${planet}`) }); });
  await page.waitForSelector('.pm .pm-row', { timeout: 8000 }).catch(() => fail('the planet menu did not open a second time'));
  await page.waitForTimeout(1500);
  const lit = await ev(() => {
    const m = window.__game.scene.getScene('starmap');
    for (const id of [...new Set(m.menu.rows.map((r) => r.e.star))]) {
      if (id === m.d.from) continue;
      m.selected = m.projected.find((p) => p.star.id === id)?.star ?? null;
      if (!m.selected) continue;
      m.updateInfo(); m.menu.select(id);
      const e = m.menu.rows[m.menu.index]?.e, d = m.destination();
      if (e && d && e.star === d.star.id && e.planet !== d.planet) return { row: `${e.star}:${e.planet}`, button: `${d.star.id}:${d.planet}` };
    }
    return null;
  });
  log('lit row and button', JSON.stringify(lit));
  if (!lit) fail('no star whose first row differs from the planet LAUNCH flies to (the check needs one)');
  else {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    const first = await ev(() => { const m = window.__game.scene.getScene('starmap'); return { launched: window.__launched, open: window.__game.scene.isActive('starmap'), picked: `${m.sysStar?.id}:${m.selPlanet?.index}` }; });
    log('Enter', JSON.stringify(first));
    if (first.launched.length || !first.open) fail(`Enter on a row launched to ${first.launched} though the button pointed at another planet`);
    if (first.picked !== lit.row) fail(`Enter on a row did not pick its planet (${first.picked}, the row is ${lit.row})`);
    await page.keyboard.down('Enter'); await page.keyboard.down('Space');
    await page.keyboard.up('Enter'); await page.keyboard.up('Space');
    await page.waitForTimeout(600);
    const second = await ev(() => ({ launched: window.__launched, open: window.__game.scene.isActive('starmap') }));
    log('Enter and Space', JSON.stringify(second));
    if (second.launched.length !== 1 || second.launched[0] !== lit.row || second.open) fail(`the keys did not launch once to the row's world (${JSON.stringify(second.launched)})`);
  }

  // a husk waits on a world the ship cannot reach (no Ember): LAUNCH is dimmed, LINK is lit, and Enter takes the link
  await ev(() => { const s = window.__scene; window.__launched = []; window.__linked = []; s.scene.launch('starmap', { mode: 'launch', from: s.planet.star, fromPlanet: s.planet.planetIndex, embers: 0, onLaunch: (star, planet) => window.__launched.push(`${star}:${planet}`), onLink: (star, planet) => window.__linked.push(`${star}:${planet}`) }); });
  await page.waitForSelector('.pm .pm-row', { timeout: 8000 }).catch(() => fail('the planet menu did not open a third time'));
  await page.waitForTimeout(1500);
  const husk = await ev(() => {
    const m = window.__game.scene.getScene('starmap');
    const e = m.menu.rows.map((r) => r.e).find((x) => x.star !== m.d.from);
    m.d.mannies = [`${e.star}:${e.planet}`];
    m.selected = m.projected.find((p) => p.star.id === e.star).star;
    m.updateInfo(); m.menu.select(e.star);
    return { world: `${e.star}:${e.planet}`, launch: m.launchBtn.visible && m.launchBtn.alpha, link: m.linkBtn.visible };
  });
  log('husk world', JSON.stringify(husk));
  if (husk.launch !== 0.35 || !husk.link) fail('the check needs a dimmed LAUNCH beside a lit LINK');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  const linked = await ev(() => ({ launched: window.__launched, linked: window.__linked, open: window.__game.scene.isActive('starmap') }));
  log('Enter with LAUNCH dimmed', JSON.stringify(linked));
  if (linked.launched.length || linked.linked.length !== 1 || linked.linked[0] !== husk.world || linked.open) fail(`Enter did not take the lit LINK past a dimmed LAUNCH (${JSON.stringify(linked)})`);
  log('errors', JSON.stringify(errors));
} finally {
  await b.close();
  try { process.kill(-server.pid); } catch { /* the preview server already stopped */ }
}
process.exit(errors.length ? 1 : 0);
