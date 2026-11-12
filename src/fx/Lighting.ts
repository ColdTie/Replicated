// Darkness layer: a screen-sized render texture filled with the ambient color, lights stamped in
// additively, then multiplied over the scene. Glow sprites add warm bloom on top.
import Phaser from 'phaser';
import LIGHT from '../data/light.json';
import { MAX_W, onScreenSize } from '../core/viewport';

export interface Light {
  x: number;
  y: number;
  radius: number;      // pixels
  color: number;
  intensity: number;   // 0..1
  flicker?: number;    // 0..1 amount of slow flicker
  phase?: number;
  active: boolean;
}

// the margin past each screen edge: more than the largest camera shake moves the screen at the widest game (Phaser
// shakes by intensity x width; the keeper's slam is 0.014)
const M = Math.ceil(0.015 * MAX_W) + 1;

/**
 * How strong a lamp is under this ambient color (light.json lamps): full in the dark, faint under a bright sky. A lamp
 * takes the darkness away, so in daylight there is little for it to take; at full strength it only wiped the sky's
 * color off pale ground and left a white hole.
 */
export function lampStrength(ambient: number) {
  const luma = (0.2126 * ((ambient >> 16) & 255) + 0.7152 * ((ambient >> 8) & 255) + 0.0722 * (ambient & 255)) / 255;
  const { fullDark, curve, floor } = LIGHT.lamps;
  return Math.max(floor, Math.min(1, Math.pow((1 - luma) / fullDark, curve)));
}

export class Lighting {
  private rt: Phaser.GameObjects.RenderTexture;
  private lights = new Set<Light>();
  private t = 0;
  /** every lamp's strength under the ambient color now (lampStrength) */
  private lamp = 1;

  constructor(private scene: Phaser.Scene, private ambient: number, private depth: number) {
    this.lamp = lampStrength(ambient);
    // As big as the game is now (it is filled every frame, so a bigger one costs on every screen), made again when the
    // game's width changes (src/core/viewport.ts). Not rt.resize(): Phaser 3.90 makes a RenderTexture's GL target with
    // autoResize off, so resize() changes its frame but not its framebuffer and the lights land in the wrong place.
    this.rt = this.make(scene.scale.width, scene.scale.height);
    onScreenSize(scene, (w, h) => {
      if (this.rt.width === w + M * 2 && this.rt.height === h + M * 2) return;
      this.rt.destroy();
      this.rt = this.make(w, h);
    });
  }

  /** The darkness layer, oversized by a margin so camera shake and sub-pixel follow never expose an unlit edge. */
  private make(w: number, h: number) {
    return this.scene.add.renderTexture(-M, -M, w + M * 2, h + M * 2)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(this.depth)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);
  }

  add(l: Partial<Light> & Pick<Light, 'x' | 'y' | 'radius' | 'color'>): Light {
    const light: Light = { intensity: 1, active: true, phase: Math.random() * 10, ...l };
    this.lights.add(light);
    return light;
  }

  setAmbient(c: number) {
    if (c === this.ambient) return;
    this.ambient = c;
    this.lamp = lampStrength(c);
  }

  remove(l: Light) {
    this.lights.delete(l);
  }

  update(dt: number) {
    this.t += dt / 1000;
    const cam = this.scene.cameras.main;
    const vx = cam.worldView.x, vy = cam.worldView.y, vw = cam.worldView.width, vh = cam.worldView.height;
    this.rt.clear();
    this.rt.fill(this.ambient, 1);
    for (const l of this.lights) {
      if (!l.active || l.intensity <= 0) continue;
      if (l.x + l.radius < vx || l.x - l.radius > vx + vw || l.y + l.radius < vy || l.y - l.radius > vy + vh) continue;
      const f = l.flicker ? 1 - l.flicker * (0.5 + 0.5 * Math.sin(this.t * 2.3 + (l.phase ?? 0)) * Math.sin(this.t * 3.7 + (l.phase ?? 0) * 2)) : 1;
      const scale = (l.radius * 2) / 128;
      this.rt.stamp('light', undefined, Math.round(l.x - vx) + M, Math.round(l.y - vy) + M, {
        scale,
        tint: l.color,
        alpha: Math.min(1, l.intensity * f) * this.lamp,
        blendMode: Phaser.BlendModes.ADD,
      });
    }
  }
}
