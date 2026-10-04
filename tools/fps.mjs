// Headless frame-rate probe (software GL, so only useful for comparing builds). Usage: node tools/fps.mjs "shot=1&hour=12"
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const port=4183, q=process.argv[2]??'shot=1';
const server = spawn('npx', ['vite','preview','--port',String(port),'--strictPort'], { stdio:'ignore', detached:true });
for (;;){ try{ if((await fetch(`http://localhost:${port}/Replicated/`)).ok) break;}catch{} await new Promise(r=>setTimeout(r,200)); }
const b=await chromium.launch({ args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
try {
  const page=await b.newPage({viewport:{width:960,height:540}});
  await page.goto(`http://localhost:${port}/Replicated/?${q}`);
  await page.waitForFunction(()=>!!window.__scene?.player,null,{timeout:15000});
  await page.waitForTimeout(3000);
  const r = await page.evaluate(()=>new Promise(res=>{let n=0; const t0=performance.now(); const f=()=>{n++; if(performance.now()-t0<3000) requestAnimationFrame(f); else res(n/3);}; requestAnimationFrame(f);}));
  console.log(q, 'fps', r.toFixed(1));
} finally { await b.close(); try{process.kill(-server.pid)}catch{} }
