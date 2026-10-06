// A pixel planet seen from space: a shaded, slowly turning sphere drawn into a canvas texture. Rocky worlds show
// drifting land and sea in the biome's colors with polar caps (`poles`); gas and ice giants show turbulent bands
// and a storm. Earth gets a warm light where the base is.
import Phaser from 'phaser';
import { PALETTE, type PlanetDef } from '../core/data';
import { valueNoise } from '../core/rng';
import { rgb } from './textures';
import type { PlanetKind, Temp } from '../world/system';

export interface GlobeStyle { earth?: boolean; kind?: PlanetKind; temp?: Temp }

/** Band colors for giants: scorched reds when hot, Jupiter tans for gas giants, Neptune blues for ice giants. */
export function giantColors(kind: PlanetKind, temp: Temp): number[] {
  if (temp === 'hot') return [6, 7, 9, 10];
  if (kind === 'neptune') return temp === 'cold' ? [16, 17, 18, 20] : [15, 16, 17, 20];
  return [5, 31, 30, 2];
}

export class Globe {
  private ct: Phaser.Textures.CanvasTexture;
  private img: ImageData;
  private sea: number[][]; private land: number[][]; private cap: number[][]; private poleSize: number;
  private bands: number[][] = [];
  private giant: boolean;
  private earth: boolean;

  constructor(scene: Phaser.Scene, readonly key: string, readonly size: number, p: PlanetDef, style: GlobeStyle | boolean = {}) {
    const st: GlobeStyle = typeof style === 'boolean' ? { earth: style } : style;
    this.earth = !!st.earth;
    this.giant = st.kind === 'giant' || st.kind === 'neptune';
    if (scene.textures.exists(key)) scene.textures.remove(key);
    this.ct = scene.textures.createCanvas(key, size, size)!;
    this.img = this.ct.getContext().createImageData(size, size);
    const acc = p.accent.map((i) => rgb(PALETTE[i]));
    const gr = (p.ground ?? [25, 24, 23]).map((i) => rgb(PALETTE[i]));
    this.sea = this.earth ? [rgb(PALETTE[15]), rgb(PALETTE[16])] : [gr[0], gr[1]];
    this.land = this.earth ? [rgb(PALETTE[14]), rgb(PALETTE[13]), rgb(PALETTE[12])] : [acc[0], acc[1], acc[2]];
    this.cap = (p.poles?.colors ?? [20, 19]).map((i) => rgb(PALETTE[i]));
    this.poleSize = p.poles?.size ?? 0;
    if (this.giant) this.bands = giantColors(st.kind!, st.temp ?? 'warm').map((i) => rgb(PALETTE[i]));
    this.draw(0);
  }

  draw(rot: number) {
    const n = this.size, c = n / 2, d = this.img.data;
    const lx = -0.6, ly = -0.35, lz = 0.72; // light from the upper left
    const cr = Math.cos(rot * Math.PI * 2), sr = Math.sin(rot * Math.PI * 2);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4;
      const nx = (x + 0.5 - c) / c, ny = (y + 0.5 - c) / c;
      const r2 = nx * nx + ny * ny;
      if (r2 > 1) { d[i + 3] = 0; continue; }
      const nz = Math.sqrt(1 - r2);
      // rotate the surface point around the vertical axis
      const px = nx * cr + nz * sr, pz = -nx * sr + nz * cr;
      let col: number[];
      if (this.giant) {
        // bands: latitude plus a little turbulence, and one dark storm
        const turb = valueNoise(px * 3 + 5, ny * 3 + pz * 2 + 5, 11) - 0.5;
        const band = Math.sin((ny + turb * 0.18) * 11 + valueNoise(ny * 4 + 3, 0, 13) * 2) * 0.5 + 0.5;
        const k = Math.min(this.bands.length - 1, Math.floor(band * this.bands.length));
        col = this.bands[k];
        const sx = px - 0.35, sy = ny - 0.25;
        if ((sx * sx) / 0.05 + (sy * sy) / 0.012 < 1 && pz > 0) col = this.bands[0];
      } else {
        const h = valueNoise(px * 2.2 + 10, ny * 2.2 + pz * 1.7 + 10, 7) * 0.65 + valueNoise(px * 5 + 3, ny * 5 + pz * 4, 9) * 0.35;
        // true latitude (0 equator .. 1 pole); the cap edge wanders with the terrain noise
        const lat = Math.asin(Math.min(1, Math.abs(ny))) / (Math.PI / 2);
        const capEdge = 1 - this.poleSize + (h - 0.5) * 0.22;
        if (this.poleSize > 0 && lat > capEdge) col = this.cap[lat > capEdge + 0.07 && h < 0.68 ? 1 : 0];
        else if (h > 0.52) col = this.land[h > 0.66 ? 2 : h > 0.58 ? 1 : 0];
        else col = this.sea[h > 0.42 ? 1 : 0];
      }
      const lambert = Math.max(0, nx * lx + ny * ly + nz * lz);
      // banded, dithered light so it matches the pixel look
      const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5][(y & 3) * 4 + (x & 3)] / 16;
      const band = Math.min(4, Math.floor(lambert * 4 + bayer));
      let k = [0.18, 0.4, 0.65, 0.85, 1][band];
      // rim haze
      if (r2 > 0.88) k = Math.max(k, 0.35);
      let r = col[0] * k, g = col[1] * k, b = col[2] * k;
      if (r2 > 0.88) { r += 20; g += 40; b += 70; }
      // the base: a warm light on the night side of Earth
      if (this.earth && lambert < 0.15 && Math.abs(px - 0.2) < 0.05 && Math.abs(ny - 0.15) < 0.05) { r = 254; g = 174; b = 52; }
      d[i] = Math.min(255, r); d[i + 1] = Math.min(255, g); d[i + 2] = Math.min(255, b); d[i + 3] = 255;
    }
    this.ct.getContext().putImageData(this.img, 0, 0);
    this.ct.refresh();
  }
}

// playtest hook: tools/*.mjs render every world's globe side by side
(window as unknown as { __Globe: typeof Globe }).__Globe = Globe;
