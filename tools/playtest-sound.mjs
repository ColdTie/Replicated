// Headless playtest of the sound (src/audio/Sound.ts, src/data/sound.json): the buses are there, each world has its
// bed and the warren and the vault their own, footsteps know the ground (metal by the ship, stone on the square, ice by
// open water on the homeworld, snow on its frost), the talk box ducks music and ambience, a sound far away is quieter
// and to its side, and every new sound plays without an error.
// Usage: npm run build && node tools/playtest-sound.mjs
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const port = 4199;
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
  await page.goto(`http://localhost:${port}/Replicated/?shot=1&view=base&hour=13`);
  await page.waitForFunction(() => !!window.__scene?.player, null, { timeout: 30000 });
  await page.mouse.click(480, 270);
  await page.waitForTimeout(800);
  const ev = (f, a) => page.evaluate(f, a);

  const buses = await ev(() => { const s = window.__sound; return { running: s.ctx?.state, buses: ['sfxBus', 'musicBus', 'ambienceBus', 'uiBus', 'voiceBus', 'duckNode'].filter((k) => !!s[k]), bed: s.bed?.id }; });
  log('buses', JSON.stringify(buses));
  if (buses.buses.length !== 6) fail('a bus is missing');
  if (buses.bed !== 'homeworld') fail(`the homeworld bed is not playing (${buses.bed})`);

  // footsteps know the ground
  const feet = await ev(() => {
    const s = window.__scene, m = s.map, out = { vessel: s.footSurface(s.vessel.x, s.vessel.y + 10), square: null, ice: null, snow: null };
    const sq = m.town.square;
    out.square = s.footSurface((sq.x + 1) * 16 + 8, (sq.y + sq.h - 1) * 16 + 8);
    for (let ty = 2; ty < m.h - 2 && (!out.ice || !out.snow); ty++) for (let tx = 2; tx < m.w - 2; tx++) {
      const x = tx * 16 + 8, y = ty * 16 + 8, f = s.footSurface(x, y);
      if (f === 'ice') out.ice ??= f; else if (f === 'snow') out.snow ??= f;
    }
    return out;
  });
  log('feet', JSON.stringify(feet));
  if (feet.vessel !== 'metal' || feet.square !== 'stone' || feet.ice !== 'ice' || feet.snow !== 'snow') fail('footsteps do not know the ground');

  // distance: a hit far away is quieter and to its side
  const far = await ev(() => { const s = window.__sound, p = window.__scene.player; return { near: s.spatial({ x: p.x + 10, y: p.y }), right: s.spatial({ x: p.x + 200, y: p.y }), left: s.spatial({ x: p.x - 200, y: p.y }), gone: s.spatial({ x: p.x + 900, y: p.y }) }; });
  log('spatial', JSON.stringify(far));
  if (!(far.near.k > far.right.k && far.right.pan > 0.5 && far.left.pan < -0.5 && far.gone.k === 0)) fail('distance and panning are wrong');

  // ducking under the talk box (Thales stands here)
  const duck = await ev(async () => {
    const s = window.__scene, th = s.npcs.find((n) => n.data.traits.thales);
    s.talker.openTalk(th);
    await new Promise((r) => setTimeout(r, 900));
    const under = window.__sound.duckNode.gain.value;
    s.talker.closeTalk();
    await new Promise((r) => setTimeout(r, 900));
    return { under, after: window.__sound.duckNode.gain.value };
  });
  log('duck', JSON.stringify(duck));
  if (!(duck.under < 0.5 && duck.after > 0.9)) fail('music and ambience do not step back under the talk box');

  // every new sound plays; the cave and the vault have their own beds
  const played = await ev(async () => {
    const s = window.__sound, at = { x: window.__scene.player.x + 60, y: window.__scene.player.y };
    for (const f of ['grass', 'stone', 'snow', 'ice', 'metal', 'printed', 'sand', 'water', 'salt']) { s.lastPlay = {}; s.step(f); s.step(f, at); }
    s.lastPlay = {};
    s.wake(); s.link(true); s.link(false); s.launch(); s.landing(1); s.birth(); s.scan(); s.printLayer(40, 60); s.printDone(); s.vaultDoor();
    s.choiceOpen(); s.choicePick('wake'); s.menuMove(1); s.menuPick(); s.hit(false, at); s.crystal(at); s.swing(); s.collect();
    // each resource its own voice (hit and pickup), and the Cem bed's sounds and the design menu's
    for (const k of ['ember', 'iron', 'hydrogen', 'salt', 'quartz', 'copper']) { s.mineral(k, at); s.pickup(k); }
    s.cemBreath(at); s.fungusClean(at); s.antPatter(); s.cemsWake(at); s.cemLayer(at); s.cemDone(at); s.designOpen(); s.designMove(3); s.designPrint();
    s.enterPlace('cave'); const cave = s.bed.id; s.enterPlace('vault'); const vault = s.bed.id; s.leavePlace(); s.leavePlace();
    await new Promise((r) => setTimeout(r, 300));
    return { cave, vault, back: s.bed.id };
  });
  log('places', JSON.stringify(played));
  if (played.cave !== 'cave' || played.vault !== 'vault' || played.back !== 'homeworld') fail('the cave and the vault do not have their own beds');
  // Earth has its own
  await ev(() => window.__sound.setWorld('earth'));
  if ((await ev(() => window.__sound.bed.id)) !== 'earth') fail('Earth has no bed of its own');
  log('errors', JSON.stringify(errors));
} finally {
  await b.close();
  try { process.kill(-server.pid); } catch { /* the preview server already stopped */ }
}
process.exit(errors.length ? 1 : 0);
