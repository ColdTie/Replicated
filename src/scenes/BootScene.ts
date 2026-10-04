import Phaser from 'phaser';
import { GEN_URL, anim, getManifest, setManifest, type Manifest } from '../core/assets';
import { makeGlowTexture, makeLightTexture, makePixel } from '../fx/textures';

export class BootScene extends Phaser.Scene {
  constructor() { super('boot'); }

  preload() {
    const { width, height } = this.scale;
    const bar = this.add.rectangle(width / 2 - 40, height / 2, 0, 2, 0xf77622).setOrigin(0, 0.5);
    this.load.on('progress', (p: number) => (bar.width = 80 * p));

    this.load.json('manifest', `${GEN_URL}manifest.json`);
    this.load.once('filecomplete-json-manifest', (_key: string, _type: string, data: Manifest) => {
      setManifest(data);
      for (const [name, s] of Object.entries(data.sprites)) {
        if (s.tinted) continue; // per-planet palettes load with the planet
        for (const [variant, file] of Object.entries(s.files)) {
          const key = variant === '*' ? name : `${name}.${variant}`;
          this.load.spritesheet(key, `${GEN_URL}${file}`, { frameWidth: s.frameWidth, frameHeight: s.frameHeight });
        }
      }
      if (data.font) this.load.image('font', `${GEN_URL}${data.font.file}`);
    });
  }

  create() {
    const m = getManifest();
    for (const [name, s] of Object.entries(m.sprites)) {
      if (s.tinted) continue;
      for (const variant of Object.keys(s.files)) {
        const key = variant === '*' ? name : `${name}.${variant}`;
        if (s.featured && s.variants) {
          // One row per visor x cape variant: anims "<name>.<variant>:<anim>" point at that row's frames
          for (const [v, row] of Object.entries(s.variants)) {
            for (const [a, def] of Object.entries(s.animations)) {
              this.anims.create({
                key: anim(`${name}.${v}`, a),
                frames: this.anims.generateFrameNumbers(name, { frames: def.frames.map((f) => f + row * s.frames) }),
                frameRate: def.fps,
                repeat: def.repeat ?? -1,
              });
            }
          }
          continue;
        }
        for (const [a, def] of Object.entries(s.animations)) {
          this.anims.create({
            key: anim(key, a),
            frames: this.anims.generateFrameNumbers(key, { frames: def.frames }),
            frameRate: def.fps,
            repeat: def.repeat ?? -1,
          });
        }
      }
    }
    if (m.font) {
      const cfg = {
        image: 'font', width: m.font.width, height: m.font.height, chars: m.font.chars,
        charsPerRow: m.font.chars.length, offset: { x: 0, y: 0 }, spacing: { x: 0, y: 0 }, lineSpacing: 3,
      };
      this.cache.bitmapFont.add('pixel', Phaser.GameObjects.RetroFont.Parse(this, cfg as unknown as Phaser.Types.GameObjects.BitmapText.RetroFontConfig));
    }
    makePixel(this);
    makeLightTexture(this);
    makeGlowTexture(this);

    this.scene.start('home');
  }
}
