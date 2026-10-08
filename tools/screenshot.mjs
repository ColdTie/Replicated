// Headless Chromium screenshot of the built game for review in chat.
// Usage: npm run build && node tools/screenshot.mjs [--name phase0] [--query "shot=1"] [--wait 2500] [--size 960x540]
//        [--eval "<js run in the page after load, before the wait>"]
// Starts `vite preview`, opens the game, waits, saves screenshots/<name>.png, and fails on page errors.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const name = arg('name', 'latest');
const query = arg('query', 'shot=1');
const wait = Number(arg('wait', '2500'));
const [vw, vh] = arg('size', '1440x810').split('x').map(Number);
const evalJs = arg('eval', '');
const port = 4179;

const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore', detached: true });
const stopServer = () => { try { process.kill(-server.pid, 'SIGTERM'); } catch {} };
for (let i = 0; ; i++) {
  try { if ((await fetch(`http://localhost:${port}/Replicated/`)).ok) break; } catch {}
  if (i > 100 || server.exitCode !== null) { stopServer(); throw new Error('vite preview did not start'); }
  await new Promise((r) => setTimeout(r, 200));
}

const errors = [];
let browser;
try {
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://localhost:${port}/Replicated/?${query}`);
  await page.waitForFunction(() => !!window.__scene, null, { timeout: 15000 });
  if (evalJs) { await page.waitForTimeout(1500); await page.evaluate(evalJs); }
  await page.waitForTimeout(wait);
  fs.mkdirSync(path.join(root, 'screenshots'), { recursive: true });
  const out = path.join(root, 'screenshots', `${name}.png`);
  // Grab the 480x270 frame from Phaser and upscale with nearest neighbor (page.screenshot stalls on
  // continuously rendering WebGL under software GL).
  const dataUrl = await page.evaluate(([w, h]) => new Promise((res) => window.__game.renderer.snapshot((img) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, w, h);
    res(c.toDataURL('image/png'));
  })), [vw, vh]);
  fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log(`saved ${path.relative(root, out)}`);
} finally {
  await browser?.close();
  stopServer();
}
if (errors.length) {
  console.error('page errors:\n' + errors.join('\n'));
  process.exit(1);
}
process.exit(0);
