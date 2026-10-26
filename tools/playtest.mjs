// Scripted headless playtest of Milestone 1/2 mechanics: no ruins, dash, combo, spitter reflect, petting.
// Usage: npm run build && node tools/playtest.mjs   (prints each step; fails loudly on page errors)
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const port=4181;
const server = spawn('npx', ['vite','preview','--port',String(port),'--strictPort'], { stdio:'ignore', detached:true });
for (;;){ try{ if((await fetch(`http://localhost:${port}/Replicated/`)).ok) break;}catch{} await new Promise(r=>setTimeout(r,200)); }
const errors=[];
const b=await chromium.launch({ args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const log=(...a)=>console.log(...a);
try {
  const page=await b.newPage({viewport:{width:960,height:540}});
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
  await page.goto(`http://localhost:${port}/Replicated/?shot=1&at=sol&pi=3&hour=21`);
  await page.waitForFunction(()=>!!window.__scene?.player,null,{timeout:15000});
  await page.waitForTimeout(1500);
  await page.mouse.click(480,270); // first gesture -> audio
  await page.waitForTimeout(300);
  const ev=(f,arg)=>page.evaluate(f,arg);
  log('audio', await ev(()=>{const s=window.__scene; return s.sys.game && (window.__sound?.ctx?.state)}));
  // the ruins are gone (2026-10-26): no ruin walls anywhere, and the original reads the copies from the start
  const ruins = await ev(()=>{const s=window.__scene; return {walls: s.map.cells.filter(c=>c===3).length, hear: s.canHear()};});
  log('ruins', JSON.stringify(ruins));
  if (ruins.walls || !ruins.hear) errors.push('ruins still on the world, or the original cannot read the copies');
  // keyboard: dash + combo
  await ev(()=>{const s=window.__scene; const c=s.map.base.center; s.player.setPosition(c.x, c.y+40);});
  const x0 = await ev(()=>window.__scene.player.x);
  await page.keyboard.press('ShiftLeft'); await page.waitForTimeout(800);
  log('dash moved', Math.round(await ev(()=>window.__scene.player.x) - x0), 'dashUntil set', await ev(()=>window.__scene.player.dashUntil>0));
  for (let i=0;i<3;i++){ await page.keyboard.press('Space'); await page.waitForTimeout(150); }
  log('combo', await ev(()=>window.__scene.player.combo));
  // Earth is shy (planets.json): its spitter keeps its spores and its creatures never lunge at you
  const shy = await ev(async()=>{const s=window.__scene; const e=s.enemies.find(e=>e.def?.kind==='spitter'); if(!e) return null; s.player.setPosition(e.x+50,e.y); s.frozen=false; const hp=s.player.hp; await new Promise(r=>setTimeout(r,2500)); const out={shy:!!s.planet.shy, spores:s.spores.length, hurt:s.player.hp<hp}; s.frozen=true; return out;});
  log('shy earth', JSON.stringify(shy));
  if (shy && (!shy.shy || shy.spores || shy.hurt)) errors.push('a creature attacked on peaceful Earth');
  // spitter reflect (a hostile world's spitter: Earth's shyness lifted for this part)
  const sp = await ev(()=>{const s=window.__scene; s.planet.shy=false; const e=s.enemies.find(e=>e.constructor.name.includes('Spitter')||e.def?.kind==='spitter'); if(!e) return null; s.player.setPosition(e.x+60,e.y); s.frozen=false; return {x:e.x,y:e.y,hp:e.hp}; });
  log('spitter', JSON.stringify(sp));
  if (sp) {
    await ev(()=>{ window.__scene.enemies.forEach(e=>{ if(e.def?.kind!=='spitter'){ e.body.enable=false; e.state='dead'; e.sprite.setVisible(false);} }); });
    let reflected=false;
    for (let t=0;t<40 && !reflected;t++){
      await page.waitForTimeout(100);
      reflected = await ev((sp)=>{const s=window.__scene; const p=s.player; const near=s.spores.find(o=>!o.reflected && Math.hypot(o.x-p.x,o.y-p.y)<26); if(!near) return false; p.aim.set(near.x-p.x, near.y-p.y).normalize(); s.resolveAttack(p.x+p.aim.x*14, p.y-5+p.aim.y*14, 17, (()=>{const dx=sp.x-p.x, dy=sp.y-p.y, l=Math.hypot(dx,dy); return {x:dx/l,y:dy/l};})(), false); return s.spores.some(o=>o.reflected);}, sp).catch(e=>{errors.push(String(e)); return true;});
    }
    await page.waitForTimeout(1200);
    log('reflected', reflected, 'spitter hp', await ev(()=>window.__scene.enemies.find(e=>e.def?.kind==='spitter').hp), 'player hp', await ev(()=>window.__scene.player.hp));
    if (!reflected) errors.push('no spore was batted back');
  }
  await ev(()=>{ window.__scene.planet.shy = true; });
  // replicate: build the Replicator, stand on the glowing spot, press action
  await ev(()=>{const s=window.__scene; s.base.placeReplicator(false); s.embers=45; s.player.setPosition(s.base.spotX, s.base.spotY); s.player.locked=false;});
  await page.keyboard.press('Space');
  // wake or hold: the choice opens over the Replicator; Space again wakes it
  await page.waitForFunction(()=>!!window.__scene.choice,null,{timeout:5000}).catch(()=>{ errors.push('no wake or hold choice'); });
  await page.waitForTimeout(200);
  await page.keyboard.press('Space');
  await page.waitForFunction(()=>window.__scene.npcs.length===1 && !window.__scene.replicating,null,{timeout:30000});
  log('copy', await ev(()=>{const s=window.__scene; const n=s.npcs[0]; return JSON.stringify({name:n.data.name, gen:n.data.generation, traits:n.data.traits, stats:n.data.stats, embers:s.embers, unlocked:!s.player.locked});}));
  await page.keyboard.press('Space'); await page.waitForTimeout(300);
  log('second copy without embers', await ev(()=>window.__scene.npcs.length));
  // grazer pet
  const pet = await ev(()=>{const s=window.__scene; const g=s.grazers[0]; s.player.setPosition(g.x+6,g.y); return !!g;});
  await page.waitForTimeout(300);
  log('grazer happy', await ev(()=>window.__scene.grazers[0].sprite.anims.currentAnim?.key));
  // pond splash

} finally { await b.close(); try{process.kill(-server.pid)}catch{} }
console.log('errors', errors);
process.exit(errors.length ? 1 : 0);
