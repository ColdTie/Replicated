// Headless playtest of Milestone 4: open the star map at the vessel, launch to Alpha Centauri, warp, arrive, land.
// Saves screenshots/m4-*.png along the way. Usage: npm run build && node tools/playtest-travel.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { chromium } from 'playwright';
const port = 4184;
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
for (;;) { try { if ((await fetch(`http://localhost:${port}/Replicated/`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }
const errors = [];
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const fail = (m) => { errors.push(m); console.log('FAIL', m); };
const log = (...a) => console.log(...a);
try {
  const page = await b.newPage({ viewport: { width: 1440, height: 810 } });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://localhost:${port}/Replicated/?shot=1&at=sol&pi=3&view=base&hour=21&copies=1&fast`);
  await page.waitForFunction(() => !!window.__scene?.player, null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  const ev = (f, a) => page.evaluate(f, a);
  const shot = async (name) => {
    const url = await ev(() => new Promise((res, rej) => { setTimeout(() => rej(new Error('snapshot timed out: game loop stalled')), 15000); window.__game.renderer.snapshot((img) => {
      const c = document.createElement('canvas'); c.width = 1440; c.height = 810;
      const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.drawImage(img, 0, 0, 1440, 810); res(c.toDataURL('image/png'));
    }); }));
    fs.writeFileSync(`screenshots/${name}.png`, Buffer.from(url.split(',')[1], 'base64'));
    log('saved', name);
  };
  const active = () => ev(() => window.__game.scene.getScenes(true).map((s) => s.scene.key).join(','));

  // walk to the board spot and press action
  await ev(() => { const s = window.__scene; s.embers = 80; s.supplies.seed = 12; s.player.setPosition(s.boardSpot.x, s.boardSpot.y); s.player.locked = false; });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__game.scene.isActive('starmap'), null, { timeout: 10000 });
  log('scenes', await active());
  await page.waitForTimeout(1500);
  await shot('m4-starmap');
  // pick Alpha Centauri and launch
  await ev(() => { const m = window.__game.scene.getScene('starmap'); m.selected = m.projected.find((p) => p.star.id === 'alpha-cen').star; m.updateInfo(); });
  await page.waitForTimeout(800);
  await shot('m4-starmap-selected');
  await ev(() => window.__game.scene.getScene('starmap').launch());
  await page.waitForTimeout(1500);
  log('embers after fuel', await ev(() => window.__scene.embers));
  // the hold takes this world's own material (Earth: seed), up to supplies.json signature.hold
  const loaded = await ev(() => ({ cargo: window.__session.replicant.traits.cargo, left: window.__scene.supplies.seed }));
  log('hold', JSON.stringify(loaded));
  if (loaded.cargo?.material !== 'seed' || loaded.cargo?.n !== 10 || loaded.left !== 2) fail('the hold did not take the seed');
  await page.waitForFunction(() => window.__game.scene.isActive('travel'), null, { timeout: 30000 });
  // trips are a fraction of a second now (travel.json): hold this one in the air for the warp screenshot
  await ev(() => { window.__game.scene.getScene('travel').j.arrives_at = new Date(Date.now() + 600_000).toISOString(); });
  log('scenes', await active());
  await page.waitForTimeout(2500);
  await shot('m4-orbit');
  await page.waitForTimeout(6000);
  await shot('m4-warp');
  // jump the clock: arrive now
  await ev(() => { const t = window.__game.scene.getScene('travel'); t.j.arrives_at = new Date(Date.now() - 1000).toISOString(); });
  await page.waitForTimeout(4000);
  await shot('m4-arrival');
  await page.waitForFunction(() => window.__game.scene.isActive('planet') && window.__scene?.player && window.__scene.planet.star === 'alpha-cen', null, { timeout: 40000 });
  log('landed on', await ev(() => `${window.__scene.planet.name} (${window.__scene.planet.id}) replicant at ${window.__session.replicant.star_id}`));
  await page.waitForTimeout(9000);
  // the hold was unloaded into the new world's store
  const unloaded = await ev(() => ({ cargo: window.__session.replicant.traits.cargo ?? null, seed: window.__scene.supplies.seed ?? 0, own: window.__scene.trade.own, mood: window.__scene.trade.importMood }));
  log('unloaded', JSON.stringify(unloaded));
  if (unloaded.cargo || unloaded.seed < 10) fail('the hold was not unloaded on landing');
  if (unloaded.own !== 'seed' && !(unloaded.mood > 0)) fail('an import did not lift the mood');
  await shot('m4-new-world');
} finally { await b.close(); try { process.kill(-server.pid); } catch {} }
console.log('errors', errors);
process.exit(errors.length ? 1 : 0);
