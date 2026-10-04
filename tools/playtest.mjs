// Scripted headless playtest of Milestone 1/2 mechanics: ruin core -> door -> module, dash, combo, spitter reflect, petting.
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
  await page.goto(`http://localhost:${port}/Replicated/?shot=1&view=ruin&hour=21`);
  await page.waitForFunction(()=>!!window.__scene?.player,null,{timeout:15000});
  await page.waitForTimeout(1500);
  await page.mouse.click(480,270); // first gesture -> audio
  await page.waitForTimeout(300);
  const ev=(f,arg)=>page.evaluate(f,arg);
  log('audio', await ev(()=>{const s=window.__scene; return s.sys.game && (window.__sound?.ctx?.state)}));
  // ruin flow
  const r0 = await ev(()=>{const s=window.__scene; const r=s.ruins[0]; return {door:r.doorPos, machine:r.machinePos, inside:r.inside, open:r.open}});
  log('ruin', JSON.stringify(r0));
  await ev((r)=>{const s=window.__scene; s.player.setPosition(r.machine.x+14, r.machine.y-2); s.player.aim.set(-1,0);}, r0);
  await ev(()=>{const s=window.__scene; s.resolveAttack(s.player.x-14, s.player.y-5, 17, s.player.aim, false);});
  await page.waitForTimeout(700);
  log('core state', await ev(()=>window.__scene.ruins[0].coreState));
  await ev((r)=>{const s=window.__scene; s.player.setPosition(r.machine.x+10, r.machine.y+16);}, r0);
  await page.waitForTimeout(300);
  log('core state', await ev(()=>window.__scene.ruins[0].coreState));
  await ev((r)=>{const s=window.__scene; s.player.setPosition(r.door.x, r.door.y+20);}, r0);
  await page.waitForTimeout(1600);
  log('door open', await ev(()=>window.__scene.ruins[0].open));
  await page.waitForFunction(()=>!!window.__scene.ruins[0].module,null,{timeout:15000});
  await ev((r)=>{const s=window.__scene; s.player.setPosition(r.inside.x, r.inside.y+2);}, r0);
  await page.waitForTimeout(1500);
  log('module', await ev(()=>{const r=window.__scene.ruins[0]; const p=window.__scene.player; return JSON.stringify({m: r.module && {x:r.module.x,y:r.module.y}, p:{x:p.x,y:p.y}, replicant: !!window.__session.replicant})}));
  log('taken', await ev(()=>window.__scene.ruins[0].taken), 'mods', await ev(()=>JSON.stringify(window.__session?.replicant?.traits?.mods ?? 'n/a')));
  // keyboard: dash + combo
  await ev(()=>{const s=window.__scene; const c=s.map.base.center; s.player.setPosition(c.x, c.y+40);});
  const x0 = await ev(()=>window.__scene.player.x);
  await page.keyboard.press('ShiftLeft'); await page.waitForTimeout(800);
  log('dash moved', Math.round(await ev(()=>window.__scene.player.x) - x0), 'dashUntil set', await ev(()=>window.__scene.player.dashUntil>0));
  for (let i=0;i<3;i++){ await page.keyboard.press('Space'); await page.waitForTimeout(150); }
  log('combo', await ev(()=>window.__scene.player.combo));
  // spitter reflect
  const sp = await ev(()=>{const s=window.__scene; const e=s.enemies.find(e=>e.constructor.name.includes('Spitter')||e.def?.kind==='spitter'); if(!e) return null; s.player.setPosition(e.x+60,e.y); s.frozen=false; return {x:e.x,y:e.y,hp:e.hp}; });
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
  }
  // grazer pet
  const pet = await ev(()=>{const s=window.__scene; const g=s.grazers[0]; s.player.setPosition(g.x+6,g.y); return !!g;});
  await page.waitForTimeout(300);
  log('grazer happy', await ev(()=>window.__scene.grazers[0].sprite.anims.currentAnim?.key));
  // pond splash

} finally { await b.close(); try{process.kill(-server.pid)}catch{} }
console.log('errors', errors);
process.exit(errors.length ? 1 : 0);
