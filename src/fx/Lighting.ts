// Darkness layer: a screen-sized render texture filled with the ambient color, lights stamped in
// additively, then multiplied over the scene. Glow sprites add warm bloom on top.
import Phaser from 'phaser';

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

const M = 8;

export class Lighting {
  private rt: Phaser.GameObjects.RenderTexture;
  private lights = new Set<Light>();
  private t = 0;

  constructor(private scene: Phaser.Scene, private ambient: number, depth: number) {
    const { width, height } = scene.scale;
    // Oversized by a margin so camera shake and sub-pixel follow never expose an unlit edge
    this.rt = scene.add.renderTexture(-M, -M, width + M * 2, height + M * 2)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(depth)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);
  }

  add(l: Partial<Light> & Pick<Light, 'x' | 'y' | 'radius' | 'color'>): Light {
    const light: Light = { intensity: 1, active: true, phase: Math.random() * 10, ...l };
    this.lights.add(light);
    return light;
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
        alpha: Math.min(1, l.intensity * f),
        blendMode: Phaser.BlendModes.ADD,
      });
    }
  }
}
