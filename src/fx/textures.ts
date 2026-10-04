// Procedural textures for light, glow, fog and sky. Banded on purpose so they match the pixel look.
import Phaser from 'phaser';
import { PALETTE } from '../core/data';

function canvasTexture(scene: Phaser.Scene, key: string, w: number, h: number, paint: (img: ImageData) => void) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const ct = scene.textures.createCanvas(key, w, h)!;
  const ctx = ct.getContext();
  const img = ctx.createImageData(w, h);
  paint(img);
  ctx.putImageData(img, 0, 0);
  ct.refresh();
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const dither = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)];

/** White radial light, quantized to a few bands with ordered dithering between them. */
export function makeLightTexture(scene: Phaser.Scene, key = 'light', size = 128, bands = 6) {
  canvasTexture(scene, key, size, size, (img) => {
    const c = size / 2;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const d = Math.min(1, Math.hypot(x + 0.5 - c, y + 0.5 - c) / c);
      const v = Math.pow(1 - d, 1.6) * bands;
      const q = Math.floor(v) + (v % 1 > dither(x, y) ? 1 : 0);
      const a = Math.min(1, q / bands);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(a * 255);
      img.data[i + 3] = 255;
    }
  });
}

/** Soft glow sprite (alpha falloff) for additive bloom on top of the darkness. */
export function makeGlowTexture(scene: Phaser.Scene, key = 'glow', size = 64) {
  canvasTexture(scene, key, size, size, (img) => {
    const c = size / 2;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const d = Math.min(1, Math.hypot(x + 0.5 - c, y + 0.5 - c) / c);
      const v = Math.pow(1 - d, 2.2) * 5;
      const q = Math.floor(v) + (v % 1 > dither(x, y) ? 1 : 0);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(Math.min(1, q / 5) * 255);
    }
  });
}

export function makeVignette(scene: Phaser.Scene, w: number, h: number, key = 'vignette') {
  const [r, g, b] = rgb(PALETTE[25]);
  canvasTexture(scene, key, w, h, (img) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const nx = (x - w / 2) / (w / 2), ny = (y - h / 2) / (h / 2);
      const d = Math.hypot(nx * 0.9, ny * 1.05);
      const v = Math.max(0, d - 0.55) / 0.75;
      const q = Math.min(1, Math.round((v * 8) + dither(x, y) - 0.5) / 8);
      const i = (y * w + x) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b;
      img.data[i + 3] = Math.round(Math.max(0, q) * 0.85 * 255);
    }
  });
}

/** Vertical sky gradient through the planet's sky colors, banded + dithered. */
export function makeSky(scene: Phaser.Scene, key: string, colors: number[], w: number, h: number) {
  const stops = colors.map(rgb);
  canvasTexture(scene, key, w, h, (img) => {
    for (let y = 0; y < h; y++) {
      const t = (y / (h - 1)) * (stops.length - 1);
      for (let x = 0; x < w; x++) {
        const bands = 10;
        const tq = Math.min(stops.length - 1, (Math.floor(t * bands) + (((t * bands) % 1) > dither(x, y) ? 1 : 0)) / bands);
        const i0 = Math.min(stops.length - 2, Math.floor(tq));
        const f = tq - i0;
        const a = stops[i0], b = stops[i0 + 1];
        const i = (y * w + x) * 4;
        img.data[i] = a[0] + (b[0] - a[0]) * f;
        img.data[i + 1] = a[1] + (b[1] - a[1]) * f;
        img.data[i + 2] = a[2] + (b[2] - a[2]) * f;
        img.data[i + 3] = 255;
      }
    }
  });
}

/** Tileable star field. */
export function makeStars(scene: Phaser.Scene, key: string, size: number, count: number, seed: number, accent: number) {
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const cols = [PALETTE[21], PALETTE[20], PALETTE[19], accent].map(rgb);
  canvasTexture(scene, key, size, size, (img) => {
    for (let n = 0; n < count; n++) {
      const x = Math.floor(rnd() * size), y = Math.floor(rnd() * size);
      const c = cols[Math.floor(rnd() * cols.length)];
      const i = (y * size + x) * 4;
      img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2];
      img.data[i + 3] = rnd() < 0.3 ? 255 : 140;
    }
  });
}

/** Tileable soft fog made of dithered noise blobs. */
export function makeFog(scene: Phaser.Scene, key: string, size: number, seed: number) {
  canvasTexture(scene, key, size, size, (img) => {
    const blobs: [number, number, number][] = [];
    let s = seed;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 9; i++) blobs.push([rnd() * size, rnd() * size, 18 + rnd() * 34]);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let v = 0;
      for (const [bx, by, br] of blobs) {
        for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
          const d = Math.hypot(x - bx - ox, y - by - oy) / br;
          if (d < 1) v += (1 - d) * (1 - d);
        }
      }
      const q = Math.min(1, Math.floor(v * 4 + dither(x, y)) / 4);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(q * 255);
    }
  });
}

export function makePixel(scene: Phaser.Scene) {
  if (!scene.textures.exists('px')) {
    const g = scene.make.graphics({}, false);
    g.fillStyle(0xffffff).fillRect(0, 0, 2, 2);
    g.generateTexture('px', 2, 2);
    g.fillStyle(0xffffff).fillRect(0, 0, 1, 1);
    g.clear().fillStyle(0xffffff).fillRect(0, 0, 1, 1).generateTexture('px1', 1, 1);
    g.destroy();
  }
  if (!scene.textures.exists('shadow')) {
    canvasTexture(scene, 'shadow', 12, 5, (img) => {
      for (let y = 0; y < 5; y++) for (let x = 0; x < 12; x++) {
        const d = Math.hypot((x + 0.5 - 6) / 6, (y + 0.5 - 2.5) / 2.5);
        const i = (y * 12 + x) * 4;
        img.data[i + 3] = d < 1 ? 255 : 0;
      }
    });
  }
}

export function rgb(c: number): [number, number, number] {
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
}

/** Tileable soft diagonal light shafts for daytime sunbeams. */
export function makeRays(scene: Phaser.Scene, key = 'rays', size = 256) {
  canvasTexture(scene, key, size, size, (img) => {
    const shafts = [[20, 22], [70, 10], [110, 30], [170, 14], [205, 24]];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      // distance across the 45 degree shafts; x + y wraps cleanly so the texture tiles without a seam
      const u = (x + y) % size;
      let v = 0;
      for (const [c, w] of shafts) {
        const d = Math.min(Math.abs(u - c), size - Math.abs(u - c)) / w;
        if (d < 1) v = Math.max(v, (1 - d * d));
      }
      const q = Math.min(1, Math.floor(v * 4 + dither(x, y)) / 4);
      const i = (y * size + x) * 4;
      img.data[i] = 255; img.data[i + 1] = 240; img.data[i + 2] = 200;
      img.data[i + 3] = Math.round(q * 255);
    }
  });
}

/** Small textures for weather and water: a rain streak and a ripple ring. */
export function makeWeatherBits(scene: Phaser.Scene) {
  if (!scene.textures.exists('drop')) {
    canvasTexture(scene, 'drop', 2, 6, (img) => {
      for (let y = 0; y < 6; y++) {
        const x = y < 3 ? 1 : 0;
        const i = (y * 2 + x) * 4;
        img.data[i] = 200; img.data[i + 1] = 220; img.data[i + 2] = 255;
        img.data[i + 3] = 120 + y * 20;
      }
    });
  }
  if (!scene.textures.exists('ring')) {
    canvasTexture(scene, 'ring', 11, 5, (img) => {
      for (let y = 0; y < 5; y++) for (let x = 0; x < 11; x++) {
        const d = Math.hypot((x + 0.5 - 5.5) / 5.5, (y + 0.5 - 2.5) / 2.5);
        if (d > 0.72 && d < 1.02) {
          const i = (y * 11 + x) * 4;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
          img.data[i + 3] = 255;
        }
      }
    });
  }
}
