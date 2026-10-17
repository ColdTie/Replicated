import Phaser from 'phaser';
import { GEN_URL, anim, getManifest, setManifest, type FontEntry, type Manifest } from '../core/assets';
import { makeGlowTexture, makeLightTexture, makePixel } from '../fx/textures';

/** Texture key of a font sheet: 'font' for the pixel font (as always), 'font.<name>' for the others. */
const fontImage = (name: string) => (name === 'pixel' ? 'font' : `font.${name}`);

/**
 * A proportional bitmap font: every glyph as wide as it is drawn, `spacing` px between letters. Same data shape
 * as Phaser's RetroFont parser makes, so BitmapText draws it like any other font.
 */
function parseProportional(scene: Phaser.Scene, key: string, f: FontEntry, lineSpacing: number) {
  const frame = scene.textures.getFrame(key);
  const tw = frame.source.width, th = frame.source.height;
  const chars: Record<number, unknown> = {};
  [...f.chars].forEach((c, i) => {
    const w = f.widths?.[i] ?? f.width, x = i * f.width;
    chars[c.charCodeAt(0)] = {
      x, y: 0, width: w, height: f.height, centerX: Math.floor(w / 2), centerY: Math.floor(f.height / 2),
      xOffset: 0, yOffset: 0, xAdvance: w + (f.spacing ?? 1), data: {}, kerning: {},
      u0: (frame.cutX + x) / tw, v0: frame.cutY / th, u1: (frame.cutX + x + w) / tw, v1: (frame.cutY + f.height) / th,
    };
  });
  return { data: { retroFont: true, font: key, size: f.height, lineHeight: f.height + lineSpacing, chars }, frame: null, texture: key };
}

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
        for (const [variant, file] of Object.entries(s.files)) {
          const key = variant === '*' ? name : `${name}.${variant}`;
          this.load.spritesheet(key, `${GEN_URL}${file}`, { frameWidth: s.frameWidth, frameHeight: s.frameHeight });
        }
      }
      const fonts = data.fonts ?? (data.font ? { pixel: data.font } : {});
      for (const [name, f] of Object.entries(fonts)) this.load.image(fontImage(name), `${GEN_URL}${f.file}`);
    });
  }

  create() {
    const m = getManifest();
    for (const [name, s] of Object.entries(m.sprites)) {
      for (const variant of Object.keys(s.files)) {
        const key = variant === '*' ? name : `${name}.${variant}`;
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
    // 'pixel': the fixed-width caps font; 'prose': the talk box's mixed-case proportional font
    const fonts = m.fonts ?? (m.font ? { pixel: m.font } : {});
    for (const [name, f] of Object.entries(fonts)) {
      const image = fontImage(name);
      if (f.widths) {
        this.cache.bitmapFont.add(name, parseProportional(this, image, f, 2) as unknown as Phaser.Types.GameObjects.BitmapText.BitmapFontData);
        continue;
      }
      const cfg = {
        image, width: f.width, height: f.height, chars: f.chars,
        charsPerRow: f.chars.length, offset: { x: 0, y: 0 }, spacing: { x: 0, y: 0 }, lineSpacing: 3,
      };
      this.cache.bitmapFont.add(name, Phaser.GameObjects.RetroFont.Parse(this, cfg as unknown as Phaser.Types.GameObjects.BitmapText.RetroFontConfig));
    }
    makePixel(this);
    makeLightTexture(this);
    makeGlowTexture(this);

    this.scene.start('home');
  }
}
