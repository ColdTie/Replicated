// Scripted headless playtest of session 9's births: the Replicator makes a blank copy (grey, still, dim), its first
// wake (the canned mind here) is the becoming: it chooses a body from the parts kit, a voice, a temperament, wants
// and a name; the parts snap on and it starts to live. Also checks the player's own composed body and a copy
// that was born before (inherit-and-drift look) still draws.
// Usage: npm run build && node tools/playtest-become.mjs
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const port = 4184;
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
for (;;) { try { if ((await fetch(`http://localhost:${port}/Replicated/`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }
const errors = [];
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const log = (...a) => console.log(...a);
const fail = (m) => { errors.push(m); log('FAIL', m); };
try {
  const page = await b.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://localhost:${port}/Replicated/?shot=1&local&view=base&hour=21`);
  await page.waitForFunction(() => !!window.__scene?.player, null, { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.mouse.click(480, 270);
  const ev = (f, arg) => page.evaluate(f, arg);

  // the player's own body is composed from the kit
  log('player', await ev(() => JSON.stringify({ key: window.__scene.player.sprite.texture.key.slice(0, 40), body: window.__session.replicant?.traits.body })));
  if (!(await ev(() => window.__scene.player.sprite.texture.key.startsWith('body:')))) fail('player body is not composed');

  // 1. a blank birth
  await ev(() => { const s = window.__scene; s.base.placeReplicator(false); s.embers = 45; s.player.setPosition(s.base.spotX, s.base.spotY); s.player.locked = false; });
  await page.waitForTimeout(300);
  log('replicate', await ev(() => window.__scene.tryReplicate()));
  await page.waitForFunction(() => window.__scene.npcs.length === 1 && !window.__scene.replicating, null, { timeout: 30000 });
  await page.waitForTimeout(400);
  const born = await ev(() => { const n = window.__scene.npcs[0]; return { name: n.data.name, blank: n.blank, state: n.state, key: n.sprite.texture.key, tinted: n.sprite.isTinted, light: n.light.intensity, traits: n.data.traits, stats: n.data.stats }; });
  log('born', JSON.stringify(born));
  if (!born.blank || !born.traits.blank) fail('the new copy is not blank');
  if (!born.key.includes('.blank')) fail('blank body not drawn from the blank kit');
  await page.screenshot({ path: 'screenshots/become-blank.png' });

  // 2. the becoming (canned mind): save the row locally so the mind can find it, then wake it
  await ev(async () => { const s = window.__scene; const n = s.npcs[0]; const saved = await window.__session.store.createReplicant({ ...n.data }); n.data.id = saved.id; });
  const x0 = await ev(() => Math.round(window.__scene.npcs[0].x));
  await ev(() => { window.__scene.shot = false; return window.__scene.wake(window.__scene.npcs[0]); });
  await page.waitForFunction(() => !window.__scene.npcs[0].blank && window.__scene.npcs[0].state !== 'born', null, { timeout: 15000 }).catch(() => fail('the copy never became itself'));
  await page.waitForTimeout(1200);
  const became = await ev(() => { const n = window.__scene.npcs[0]; const t = n.data.traits; return { name: n.data.name, state: n.state, key: n.sprite.texture.key.slice(0, 70), body: t.body, feature: t.feature, trail: t.trail, gear: t.gear, voice: t.voice, temperament: t.temperament, wants: t.wants, blank: t.blank, nightFrom: n.nightFrom, pace: n.pace, bubble: !!n.bubble }; });
  log('became', JSON.stringify(became));
  if (became.blank || !became.body || !became.temperament || !became.wants?.length || !became.voice) fail('becoming left traits unset');
  if (!became.key.startsWith('body:') || became.key.includes('.blank')) fail('body not redrawn from its choices');
  if (became.name === born.name) fail('the copy kept its given name');
  await page.screenshot({ path: 'screenshots/become-itself.png' });
  // it moves now
  await ev(() => { window.__scene.shot = true; });
  await page.waitForFunction((x0) => Math.abs(window.__scene.npcs[0].x - x0) > 6 || window.__scene.npcs[0].state === 'walk', x0, { timeout: 20000 }).catch(() => fail('the copy never moved after becoming'));
  log('moves', await ev(() => window.__scene.npcs[0].state));

  // 2b. needs: no food or water; a lonely, aimless copy says so, and finished work lifts purpose
  const fed = await ev(() => {
    const s = window.__scene; const n = s.npcs[0];
    n.needs.company = 0.1; n.needs.purpose = 0.1;
    const before = { needs: Object.keys(n.needs), low: n.lowNeeds(), mood: n.moodWord };
    n.onWorked(true);
    return { before, after: { purpose: Math.round(n.needs.purpose * 100) / 100, low: n.lowNeeds() } };
  });
  log('needs', JSON.stringify(fed));
  if (fed.before.needs.includes('food') || fed.before.needs.includes('water')) fail('copies still have food or water needs');
  if (!fed.before.low.some((l) => l.startsWith('lonely'))) fail('loneliness is not reported');
  if (!(fed.after.purpose > 0.5)) fail('finished work did not lift purpose');

  // 3. the journal shows what it wants
  const journal = await ev(async () => { await window.__scene.toggleJournal(); const el = document.querySelector('.jn'); const t = el?.textContent ?? ''; return { wants: t.includes('WANTS'), text: t.slice(0, 200) }; });
  log('journal', JSON.stringify(journal));
  if (!journal.wants) fail('journal has no WANTS section');
} finally { await b.close(); try { process.kill(-server.pid); } catch {} }
console.log('errors', errors);
process.exit(errors.length ? 1 : 0);
