// Scripted headless playtest of talking to the copies, on a snapshot of Steve's Earth (its six copies, their real
// notes and letters): walk up to a copy and its talk hint shows; E opens the talk box (SAYS, THOUGHTS, WANTS,
// LETTERS), E / Space turn the pages, Left goes back, Esc closes and the copy goes back to what it was doing;
// right click opens it too and no longer dashes (Shift still does); a left click on a copy a few steps away talks to
// it; a blank copy has one wordless page; words readable without any module; R sends a reply as a
// letter and the copy's answer comes as a new page.
// Usage: npm run build && node tools/playtest-talk.mjs [seed.json] [journal.json]
// (without arguments it seeds a small made-up Earth of its own)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { chromium } from 'playwright';

const port = 4187;
const [, , seedPath, journalPath] = process.argv;
const PLAYER_ID = '3b7c94da-3313-4fb6-8948-a54c1d3e710f';

/** A small Earth with three copies when no live snapshot is given. */
function madeUp() {
  const at = (h) => new Date(Date.now() - h * 3_600_000).toISOString();
  const copy = (id, name, feature, body, wants) => ({ id, profile_id: null, name, model: 'replicant', status: 'npc', star_id: 'sol', planet_index: 3, pos_x: null, pos_y: null, parent_id: PLAYER_ID, generation: 1, traits: { v: 1, awake: true, feature, trail: 20, gear: body.headgear, body, wants, needs: { company: 0.9, purpose: 0.1 }, weary: 0 } });
  const body = (o) => ({ head: 'round', visor: 'band', torso: 'slim', arms: 'thin', legs: 'thin', back: 'none', headgear: 0, primary: 'silver', secondary: 'steel', accent: 'red', ...o });
  return {
    planet: { star: 'sol', pi: 3, seed: 1969, embers: 120, data: {} },
    npcs: [
      copy('c-glint', 'Glint', 9, body({ back: 'cape', headgear: 5, torso: 'armored' }), [{ text: 'Plant new trees near the base so the six are not alone', category: 'tend', done: false, at: 0 }]),
      copy('c-prism', 'Prism', 18, body({ visor: 'prism', accessory: 'sash' }), [{ text: 'Hear Moss write back a second time', category: 'care for others', done: false, at: 0 }]),
      copy('c-kiln', 'Kiln', 10, body({ legs: 'sturdy', back: 'pack' }), [{ text: 'Keep a shelf in the Kiln Room for the things we make', category: 'build', done: true, at: 0 }]),
    ],
    journal: {
      others: [{ id: 'f-lumen', name: 'Lumen', star_id: 'alderamin', planet_index: 1, status: 'npc' }],
      notes: [
        { replicant_id: 'c-glint', body: 'I keep the six trees and want more beside them.', created_at: at(20) },
        { replicant_id: 'c-prism', body: 'Quiet hour, no letters still.', created_at: at(9) },
        { replicant_id: 'c-prism', body: 'The Watchtower is built. I can sit there at dusk and learn the stars.', created_at: at(60) },
      ],
      mail: [
        { id: 'm1', from_replicant: 'c-prism', to_replicant: PLAYER_ID, body: "You're home and standing beside me. I would like to sit up there with the others at dusk and watch for you coming back.", sent_at: at(150), arrives_at: at(150), read_at: null },
        { id: 'm2', from_replicant: 'f-lumen', to_replicant: 'c-glint', body: 'Thank you for the rain. We have none here, only a quiet so deep I hear the lamp hum.', sent_at: at(40), arrives_at: at(39), read_at: null },
      ],
    },
  };
}

let world;
if (seedPath) {
  const p = JSON.parse(fs.readFileSync(seedPath, 'utf8'))[0];
  world = { planet: { star: p.star, pi: p.pi, seed: p.seed, embers: p.embers, data: p.data }, npcs: p.npcs, journal: JSON.parse(fs.readFileSync(journalPath, 'utf8')) };
} else world = madeUp();
const glintId = world.npcs.find((n) => n.name === 'Glint').id;
const prismId = world.npcs.find((n) => n.name === 'Prism').id;
const kilnId = world.npcs.find((n) => n.name === 'Kiln').id;
// what Glint's mind wanted to tell the player (traits.tell is written by the mind; here a fixture)
const TELL = 'You came back. I kept the six trees for you, and the smallest one leans toward the vessel now, as if it has been waiting too. Will you stay until dusk? Lookout says the Watchtower is best then.';
const npcs = world.npcs.map((n) => (n.id === glintId ? { ...n, traits: { ...n.traits, tell: { text: TELL, at: Date.now() - 4 * 60_000 } } } : n));
const db = {
  profiles: [{ id: 'p1', name: 'STEVE', kid_mode: false, feature_color: 10, sort: 0 }],
  replicants: [
    { id: PLAYER_ID, profile_id: 'p1', name: 'Steve', model: 'replicant', traits: { awake: true, feature: 10, mods: ['listen'] }, status: 'active', star_id: world.planet.star, planet_index: world.planet.pi, pos_x: null, pos_y: null },
    ...npcs,
    ...world.journal.others.map((o) => ({ id: o.id, profile_id: null, name: o.name, model: 'replicant', status: o.status, star_id: o.star_id, planet_index: o.planet_index, pos_x: null, pos_y: null, traits: { v: 1 } })),
  ],
  planets: { [`${world.planet.star}:${world.planet.pi}`]: { star_id: world.planet.star, planet_index: world.planet.pi, seed: world.planet.seed, embers: world.planet.embers, data: world.planet.data } },
  journeys: [], discovered: ['sol'], notes: world.journal.notes, mail: world.journal.mail, requests: [],
};

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
  await page.addInitScript((d) => { if (!localStorage.getItem('replicated.local.v1')) localStorage.setItem('replicated.local.v1', d); }, JSON.stringify(db));
  // ?sim: straight in from the seeded storage, minds asleep (nothing is said for them)
  await page.goto(`http://localhost:${port}/Replicated/?sim&hour=15&rain=0`);
  await page.waitForFunction(() => !!window.__scene?.player && window.__scene.npcs.length >= 3 && !window.__scene.player.locked, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.mouse.click(480, 100);
  await page.waitForTimeout(500);
  const ev = (f, arg) => page.evaluate(f, arg);
  const box = () => ev(() => { const t = window.__game.scene.getScene('ui').talkBox; return { open: t.isOpen, key: t.pageKey, section: t.page?.section, index: t.index, count: t.pageCount, typing: t.typing, text: t.page?.lines.map((l) => l.map((s) => s.text).join('')).join('\n') ?? '' }; });
  const typed = () => page.waitForFunction(() => !window.__game.scene.getScene('ui').talkBox.typing, null, { timeout: 20000 });
  // every copy stands still where it is put, and so do the creatures; swings and boardings are counted
  await ev(() => {
    const s = window.__scene;
    for (const n of s.npcs) { n.state = 'idle'; n.until = 1e15; n.nextGreet = 1e15; n.nextBuild = 1e15; n.target = null; }
    // Earth's creatures hold still (a hit would end the talk, as it should)
    s.frozen = true;
    window.__count = { attack: 0, interact: 0 };
    const p = s.player, atk = p.attack.bind(p), inter = s.tryInteract.bind(s);
    p.attack = (...a) => { window.__count.attack++; return atk(...a); };
    s.tryInteract = () => { window.__count.interact++; return inter(); };
  });
  // a clear spot near the base: the copy there, the player 70 px to its left
  const spot = await ev((id) => {
    const s = window.__scene, c = s.map.base.center;
    for (let r = 40; r < 400; r += 12) for (let a = 0; a < 6.28; a += 0.4) {
      const x = c.x + Math.cos(a) * r, y = c.y + Math.sin(a) * r;
      let ok = true;
      for (let dx = -80; dx <= 14 && ok; dx += 4) for (const dy of [-6, 0, 6]) if (s.blockedAt(x + dx, y + dy)) { ok = false; break; }
      if (!ok) continue;
      // not by the husk vault's doorway (standing in it takes you down) or the hatch
      if (Math.abs(y - s.dock.y) < 40 && x - 90 < s.dock.x + 20 && x + 20 > s.dock.x - 20) continue;
      if (Math.abs(y - s.warren.hatch.y) < 30 && x - 90 < s.warren.hatch.x + 20 && x + 20 > s.warren.hatch.x - 20) continue;
      const n = s.npcs.find((q) => q.data.id === id);
      n.x = x; n.y = y; n.sync();
      // the others well away
      s.npcs.filter((q) => q !== n).forEach((q, i) => { q.x = x + 200 + i * 10; q.y = y + 120; q.sync(); });
      s.player.setPosition(x - 70, y);
      return { x: Math.round(x), y: Math.round(y) };
    }
    return null;
  }, glintId);
  if (!spot) throw new Error('no clear spot near the base');
  await page.waitForTimeout(600);

  // 1. walk up to Glint: its talk hint shows (only for the nearest copy)
  if (await ev(() => !!window.__scene.talkable)) fail('a talk hint showed while nobody was near');
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction((id) => { const s = window.__scene, n = s.npcs.find((q) => q.data.id === id); return Math.hypot(s.player.x - n.x, s.player.y - n.y) < 24; }, glintId, { timeout: 8000 }).catch(() => fail('could not walk up to Glint'));
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(500);
  const hint = await ev((id) => { const s = window.__scene, n = s.npcs.find((q) => q.data.id === id); return { talkable: s.talkable?.data.name, alpha: n.talkHint?.alpha ?? 0, visible: !!n.talkHint?.visible }; }, glintId);
  log('hint', JSON.stringify(hint));
  if (hint.talkable !== 'Glint' || !(hint.alpha > 0.9) || !hint.visible) fail('no talk hint over Glint');
  await ev(() => { const s = window.__scene; s.cameras.main.stopFollow(); s.cameras.main.centerOn(Math.round(s.player.x + 12), Math.round(s.player.y - 10)); });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/talk-hint.png' });
  await ev(() => { const s = window.__scene; s.cameras.main.startFollow(s.player.zone, true, 0.1, 0.1, 0, 8); });

  // 2. E opens the box: SAYS first, typed out; the copy stops, faces you and is in its talk state
  const before = await ev((id) => window.__scene.npcs.find((q) => q.data.id === id).state, glintId);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
  let bx = await box();
  const glint = await ev((id) => { const n = window.__scene.npcs.find((q) => q.data.id === id); return { state: n.state, flip: n.sprite.flipX }; }, glintId);
  log('open', JSON.stringify({ ...bx, text: bx.text.slice(0, 60) }), JSON.stringify(glint));
  if (!bx.open || bx.section !== 'SAYS') fail('E did not open the talk box on SAYS');
  if (glint.state !== 'talk' || !glint.flip) fail('Glint did not stop and turn to face the player');
  if (!bx.typing) fail('SAYS did not type out');
  const typeStart = Date.now();
  await typed();
  const typeMs = Date.now() - typeStart + 300;
  bx = await box();
  log('typed', bx.text.length, 'chars in', typeMs, 'ms');
  if (!bx.text.startsWith('You came back.')) fail(`SAYS is not what Glint wanted to tell: ${bx.text.slice(0, 40)}`);
  const pos0 = await ev(() => ({ x: window.__scene.player.x, y: window.__scene.player.y }));
  await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(400); await page.keyboard.up('ArrowLeft');
  const pos1 = await ev(() => ({ x: window.__scene.player.x, y: window.__scene.player.y }));
  if (Math.hypot(pos1.x - pos0.x, pos1.y - pos0.y) > 0.5) fail('the player walked while the box was open');
  // ArrowLeft on the first page goes nowhere; the box is still on SAYS
  if ((await box()).index !== 0) fail('back from the first page moved');
  await page.screenshot({ path: 'screenshots/talk-says.png' });

  // 3. E / Space through the pages; each section once, screenshots of each
  const seen = [];
  const shots = { THOUGHTS: 'talk-thoughts', WANTS: 'talk-wants', LETTERS: 'talk-letters' };
  for (let i = 0; i < 20; i++) {
    bx = await box();
    if (!seen.includes(bx.section)) {
      seen.push(bx.section);
      if (shots[bx.section]) { await typed(); await page.waitForTimeout(150); await page.screenshot({ path: `screenshots/${shots[bx.section]}.png` }); }
    }
    if (bx.index === bx.count - 1) break;
    await page.keyboard.press(i % 2 ? 'Space' : 'KeyE');
    await page.waitForTimeout(80);
    if ((await box()).typing) { await page.keyboard.press('Space'); await page.waitForTimeout(80); }
  }
  log('sections', seen.join(' '), 'pages', bx.count);
  for (const s of ['SAYS', 'THOUGHTS', 'WANTS', 'LETTERS']) if (!seen.includes(s)) fail(`no ${s} page`);
  const last = await box();
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(120);
  if ((await box()).index !== last.index - 1) fail('Left did not go back a page');
  if (await ev(() => window.__count.attack + window.__count.interact)) fail('turning pages swung or interacted');

  // 4. Esc closes; the copy goes back to what it was doing; the closing key swings nothing
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  bx = await box();
  const after = await ev((id) => window.__scene.npcs.find((q) => q.data.id === id).state, glintId);
  if (bx.open) fail('Esc did not close the box');
  if (after !== before) fail(`Glint did not resume (${before} -> ${after})`);
  // the last advance closes too, and the press that closes it does not swing
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(200);
  for (let i = 0; i < 60 && (await box()).open; i++) { await page.keyboard.press('Space'); await page.waitForTimeout(120); }
  await page.waitForTimeout(300);
  if ((await box()).open) fail('the last page did not close the box');
  if (await ev(() => window.__count.attack + window.__count.interact)) fail('closing the box with Space swung');

  // 5. right click opens it too, Tab closes it without opening the journal
  await page.mouse.click(480, 270, { button: 'right' });
  await page.waitForTimeout(300);
  if (!(await box()).open) fail('right click did not open the talk box');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(400);
  if ((await box()).open) fail('Tab did not close the box');
  if (await ev(() => !!document.querySelector('.jn'))) fail('Tab opened the journal while closing the box');
  await ev(() => document.querySelector('.jn')?.remove());

  // 6. right click no longer dashes; Shift still does
  await ev((sp) => window.__scene.player.setPosition(sp.x - 70, sp.y), spot);
  await page.waitForTimeout(400);
  const r0 = await ev(() => ({ x: window.__scene.player.x, until: window.__scene.player.dashUntil }));
  await page.mouse.click(480, 270, { button: 'right' });
  await page.waitForTimeout(900);
  const rc = await ev((r) => ({ dashed: window.__scene.player.dashUntil !== r.until, moved: Math.round(window.__scene.player.x - r.x), open: window.__game.scene.getScene('ui').talkBox.isOpen }), r0);
  if (rc.dashed || Math.abs(rc.moved) > 2) fail('right click still dashes');
  if (rc.open) fail('right click away from every copy opened the box');
  await page.waitForTimeout(400);
  const d0 = await ev(() => ({ x: window.__scene.player.x, until: window.__scene.player.dashUntil }));
  await page.keyboard.press('Shift');
  await page.waitForFunction((d) => window.__scene.player.dashUntil !== d.until, d0, { timeout: 5000 }).catch(() => fail('Shift did not dash'));
  await page.waitForTimeout(400);
  log('dash', JSON.stringify({ moved: Math.round((await ev(() => window.__scene.player.x)) - d0.x), rightClickMoved: rc.moved, fps: await ev(() => Math.round(window.__game.loop.actualFps)) }));

  // 6b. a left click on a copy a few steps away talks to it and does not swing; a click beside it, or on a copy too
  // far away, swings as before
  const onScreen = (id, dy) => ev(({ id, dy }) => {
    const s = window.__scene, n = s.npcs.find((q) => q.data.id === id), v = s.cameras.main.worldView, r = s.game.canvas.getBoundingClientRect();
    return { x: r.left + (n.x - v.x) * r.width / v.width, y: r.top + (n.y + dy - v.y) * r.height / v.height };
  }, { id, dy });
  // (the player stands on the vessel's boarding spot here: a plain click would board, so boarding is off for this step)
  await ev(() => { const s = window.__scene; window.__interact = s.tryInteract; s.tryInteract = () => false; });
  const clickAt = async (from, dy) => {
    await ev((sp) => { window.__scene.player.setPosition(sp.x - sp.from, sp.y); window.__count.attack = 0; }, { ...spot, from });
    await page.waitForTimeout(400);
    const c = await onScreen(glintId, dy);
    await page.mouse.click(c.x, c.y);
    await page.waitForTimeout(400);
    const r = { open: (await box()).open, who: await ev(() => window.__scene.talker.talk?.npc.data.name ?? null), swung: await ev(() => window.__count.attack) };
    if (r.open) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
    return r;
  };
  const near = await clickAt(70, -10), mark = await clickAt(70, -27), beside = await clickAt(70, -60), far = await clickAt(150, -10);
  log('click', JSON.stringify({ near, mark, beside, far }));
  if (!near.open || near.who !== 'Glint') fail('a left click on Glint 70 px away did not talk to it');
  if (near.swung) fail('the click on a copy also swung');
  if (!mark.open || mark.who !== 'Glint') fail('a click on the speech mark over Glint did not talk to it');
  if (beside.open || !beside.swung) fail('a click beside the copy did not swing');
  if (far.open || !far.swung) fail('a click on a copy out of reach opened the box');
  // clicking through the last page with the cursor still on the copy: one click too many does not open it again
  await ev((sp) => { window.__scene.player.setPosition(sp.x - 70, sp.y); }, spot);
  await page.waitForTimeout(1500); // the camera eases after the jump
  let g = await onScreen(glintId, -10);
  await page.mouse.click(g.x, g.y);
  await page.waitForTimeout(300);
  if (!(await box()).open) fail('a click on Glint did not open the box');
  await ev(() => { window.__count.attack = 0; window.__scene.talker.closeTalk(); });
  await page.waitForTimeout(150);
  g = await onScreen(glintId, -10);
  await page.mouse.click(g.x, g.y);
  await page.waitForTimeout(300);
  const extra = { open: (await box()).open, swung: await ev(() => window.__count.attack) };
  log('click after close', JSON.stringify(extra));
  if (extra.open || extra.swung) fail('a click on the copy just after its box closed opened it again or swung');
  if (extra.open) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
  // a touchscreen laptop shows the touch controls: a mouse click on the talk button talks
  await ev((sp) => { const s = window.__scene; s.player.setPosition(sp.x - 24, sp.y); window.__count.attack = 0; s.game.scene.getScene('ui').touchUi.setVisible(true); }, spot);
  await page.waitForFunction(() => window.__game.scene.getScene('ui').talkBtn.visible, null, { timeout: 3000 }).catch(() => fail('the touch talk button did not show'));
  await page.waitForTimeout(300);
  const tb = await ev(() => { const u = window.__game.scene.getScene('ui'), r = u.game.canvas.getBoundingClientRect(); return { x: r.left + u.talkBtn.x * r.width / u.scale.width, y: r.top + u.talkBtn.y * r.height / u.scale.height }; });
  await page.mouse.click(tb.x, tb.y);
  await page.waitForTimeout(400);
  const btn = { open: (await box()).open, swung: await ev(() => window.__count.attack) };
  log('talk button by mouse', JSON.stringify(btn));
  if (!btn.open || btn.swung) fail('a mouse click on the touch talk button did not talk');
  if (btn.open) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
  await ev(() => window.__game.scene.getScene('ui').touchUi.setVisible(false));
  // the swings above were meant: the tally at the end counts only presses that slipped through a talk
  await ev(() => { window.__scene.tryInteract = window.__interact; window.__count.attack = 0; });

  // 7. a blank copy: one wordless page
  await ev(({ id, sp }) => {
    const s = window.__scene, n = s.npcs.find((q) => q.data.id === id);
    s.player.setPosition(sp.x - 64, sp.y);
    n.data.traits.blank = true; n.setBlank();
    n.x = sp.x - 46; n.y = sp.y; n.sync();
  }, { id: kilnId, sp: spot });
  await page.waitForTimeout(400);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(400);
  bx = await box();
  log('blank', JSON.stringify(bx));
  if (!bx.open || bx.count !== 1 || /[a-z]/i.test(bx.text)) fail('a blank copy did not get one wordless page');
  if (await ev((id) => window.__scene.npcs.find((q) => q.data.id === id).state !== 'blank', kilnId)) fail('talking changed the blank copy');
  await page.screenshot({ path: 'screenshots/talk-blank.png' });
  await page.keyboard.press('Escape');
  // a slow frame can take Esc and the next E together: wait until the box has really shut
  await page.waitForFunction(() => !window.__game.scene.getScene('ui').talkBox.isOpen, null, { timeout: 5000 }).catch(() => fail('Esc did not close the blank copy\'s box'));
  await page.waitForTimeout(300);
  await ev((id) => { const n = window.__scene.npcs.find((q) => q.data.id === id); n.x += 300; n.sync(); }, kilnId);

  // 8. no module needed to understand them (the ruins that held it are gone): Prism's words read plainly
  await ev(({ id, sp }) => {
    const s = window.__scene, n = s.npcs.find((q) => q.data.id === id);
    window.__session.replicant.traits.mods = [];
    s.player.setPosition(sp.x - 64, sp.y);
    n.x = sp.x - 46; n.y = sp.y; n.sync();
  }, { id: prismId, sp: spot });
  await page.waitForTimeout(400);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(500);
  await typed();
  const heard = await ev(() => { const t = window.__game.scene.getScene('ui').talkBox; return { tones: t.page.lines.flat().map((s) => s.tone), text: t.page.lines.map((l) => l.map((s) => s.text).join('')).join(' ') }; });
  log('hears without modules', heard.text.slice(0, 90));
  if (heard.tones.includes('rune') || heard.text.includes('cannot read them yet')) fail('runes without the listening module');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // 9. R: a reply goes as a letter (no quick wake), the mind's talk wake answers as a new SAYS page
  await ev(() => {
    window.__session.replicant.traits.mods = ['listen'];
    const s = window.__scene;
    window.__talkCalls = [];
    // stands in for the mind's PlanetScene.requestTalk (built in parallel): a talk wake that answers
    s.requestTalk = (n, said) => {
      window.__talkCalls.push({ id: n.data.id, said: said ?? null });
      return new Promise((res) => setTimeout(() => {
        const text = said ? 'Not yet. But I listen every dusk from the Star Window, and I will tell you the moment it comes.' : 'You are here. I was watching the Watchtower path for you.';
        if (!said) { n.data.traits.tell = { text, at: Date.now() }; s.game.events.emit('tell', n.data.id); }
        res(text);
      }, 1800));
    };
  });
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
  const composing = await ev(() => window.__game.scene.getScene('ui').talkBox.page?.composing);
  if (!composing) fail('no composing mark while the copy has nothing fresh to tell');
  await page.waitForFunction(() => window.__game.scene.getScene('ui').talkBox.page?.lines.some((l) => l.some((s) => s.text.includes('watching the Watchtower'))), null, { timeout: 8000 }).catch(() => fail('the fresh tell never reached SAYS'));
  await typed();
  const wakes0 = await ev((id) => { const s = window.__scene, n = s.npcs.find((q) => q.data.id === id); return s.nextWake.get(n) ?? null; }, prismId);
  const mail0 = await ev(() => window.__session.store.db.mail.length);
  await page.keyboard.press('KeyR');
  await page.waitForSelector('.talk-reply input', { timeout: 3000 }).catch(() => fail('R did not open the reply line'));
  const p0 = await ev(() => ({ x: window.__scene.player.x, y: window.__scene.player.y }));
  await page.keyboard.type('Did Moss write back yet? Stay warm, Prism.', { delay: 15 });
  await page.screenshot({ path: 'screenshots/talk-reply.png' });
  const p1 = await ev(() => ({ x: window.__scene.player.x, y: window.__scene.player.y }));
  if (Math.hypot(p1.x - p0.x, p1.y - p0.y) > 0.5) fail('typing the reply moved the player');
  if (await ev(() => !!document.querySelector('.jn'))) fail('typing opened the journal');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const sent = await ev(({ id, me }) => { const m = window.__session.store.db.mail[0]; return { n: window.__session.store.db.mail.length, to: m.to_replicant, from: m.from_replicant, body: m.body, arrives: Date.parse(m.arrives_at) <= Date.now() + 1000 }; }, { id: prismId, me: PLAYER_ID });
  log('sent', JSON.stringify(sent));
  if (sent.n !== mail0 + 1 || sent.to !== prismId || sent.from !== PLAYER_ID || !sent.arrives) fail('the reply was not sent as a letter that arrives at once');
  bx = await box();
  if (!/Prism is thinking/.test(bx.text) || bx.key !== 'x0:0') fail(`no thinking page after the reply: ${bx.key} ${bx.text}`);
  await page.screenshot({ path: 'screenshots/talk-thinking.png' });
  await page.waitForFunction(() => /Star Window/.test(window.__game.scene.getScene('ui').talkBox.page?.lines.map((l) => l.map((s) => s.text).join('')).join(' ') ?? ''), null, { timeout: 8000 }).catch(() => fail('the answer never came as a SAYS page'));
  await typed();
  await page.screenshot({ path: 'screenshots/talk-answer.png' });
  const calls = await ev(() => window.__talkCalls);
  log('requestTalk calls', JSON.stringify(calls));
  if (calls.length !== 2 || calls[0].said !== null || !/Moss/.test(calls[1].said ?? '')) fail('requestTalk was not called on open and with the reply');
  const wakes1 = await ev((id) => { const s = window.__scene, n = s.npcs.find((q) => q.data.id === id); return s.nextWake.get(n) ?? null; }, prismId);
  // the journal's TALK pulls the next wake in to 3 s; a reply from the box must not (an ordinary wake may push it later)
  if (wakes0 !== null && wakes1 !== null && wakes1 < wakes0) fail('the reply scheduled the old quick wake');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  if ((await box()).open) fail('Esc did not close after the reply');

  // 10. the real talk wake (PlanetScene.requestTalk) with the canned mind: a copy with nothing fresh to tell gathers its
  // words and answers; a reply gets an answer; its ordinary wake moves later, not sooner
  const real = await ev(async () => {
    const s = window.__scene;
    delete s.requestTalk; // back to the scene's own talk wake
    const st = window.__session.store;
    st.mindTick = Object.getPrototypeOf(st).mindTick; // ?sim keeps the minds asleep; this part wants the canned one
    const n = s.npcs.find((q) => q.data.name === 'Glint') ?? s.npcs[0];
    n.data.traits.tell = undefined;
    const before = s.nextWake.get(n) ?? 0;
    const told = await s.requestTalk(n);
    const answer = await s.requestTalk(n, 'The rain is coming back tonight.');
    return { name: n.data.name, told, answer, tell: n.data.traits.tell?.text ?? null, later: (s.nextWake.get(n) ?? 0) >= before };
  });
  log('real talk', JSON.stringify(real));
  if (!real.told || !real.answer || real.tell !== real.answer) fail('the real talk wake did not answer (or did not keep traits.tell)');
  if (!real.later) fail('a talk wake pulled the ordinary wake in');
  log('swings during all of it', JSON.stringify(await ev(() => window.__count)));
  if (await ev(() => window.__count.attack + window.__count.interact)) fail('something swung or boarded while talking');
} finally { await b.close(); try { process.kill(-server.pid); } catch {} }
console.log('errors', errors);
process.exit(errors.length ? 1 : 0);
