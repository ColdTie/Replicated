// The Nous Chips (designs.json nouschip, place bed; story/STORY.md Copying, Steve 2026-10-28): the Cems print each one on
// their bed. A finished chip lies glowing on the salt until someone walks onto it; then that Vessel carries it
// (replicants.traits.chips) wherever it goes, until a Replicator spends it on a new Vessel's mind
// (PlanetScene.replicate). Taken, it leaves the world's save (Buildings.take).
import Phaser from 'phaser';
import { sound } from '../audio/Sound';
import { anim } from '../core/assets';
import { PALETTE } from '../core/data';
import { session } from '../core/session';
import { DRIFT } from '../core/drift';
import type { Light } from '../fx/Lighting';
import type { Building } from '../net/store';
import type { PlanetScene } from '../scenes/PlanetScene';

/** how near the chip you must walk to take it (px) */
const TAKE_PX = 12;

export class Chips {
  private shown = new Map<string, { sprite: Phaser.GameObjects.Sprite; glow: Phaser.GameObjects.Image; light: Light }>();

  constructor(private scene: PlanetScene) {}

  /** Finished chips lying on this world's bed. */
  get waiting(): Building[] { return this.scene.buildings?.list.filter((b) => b.design === DRIFT.chip && b.built && !b.vetoed) ?? []; }

  update(time: number) {
    const s = this.scene, list = this.waiting;
    for (const b of list) if (!this.shown.has(b.id)) this.show(b);
    for (const [id, o] of this.shown) if (!list.some((b) => b.id === id)) this.hide(id, o);
    for (const [, o] of this.shown) {
      o.sprite.y = o.sprite.getData('y') + Math.sin(time / 420 + o.sprite.x) * 1.2;
      o.light.intensity = 0.35 + 0.15 * Math.sin(time / 300 + o.sprite.x);
    }
    // walking onto one takes it (never on a visit, where nothing here is ours to change)
    const p = s.player;
    if (!p?.alive || p.locked || s.visit || !session.replicant) return;
    const b = list.find((x) => Math.hypot(p.x - x.x, p.y - (x.y - 2)) < TAKE_PX);
    if (b) this.take(b);
  }

  private show(b: Building) {
    const s = this.scene;
    const sprite = s.add.sprite(b.x, b.y - 4, 'nouschip', 0).setOrigin(0.5, 1).setDepth(100 + b.y).setData('y', b.y - 4);
    sprite.play(anim('nouschip', 'glow'));
    const glow = s.add.image(b.x, b.y - 10, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(PALETTE[18]).setScale(0.35).setAlpha(0.3).setDepth(6100);
    const light = s.lighting.add({ x: b.x, y: b.y - 8, radius: 26, color: PALETTE[18], intensity: 0.4 });
    this.shown.set(b.id, { sprite, glow, light });
  }

  private hide(id: string, o: { sprite: Phaser.GameObjects.Sprite; glow: Phaser.GameObjects.Image; light: Light }) {
    o.sprite.destroy();
    o.glow.destroy();
    this.scene.lighting.remove(o.light);
    this.shown.delete(id);
  }

  /** The chip leaps to whoever took it; their count goes up and is saved on their row. */
  private take(b: Building) {
    const s = this.scene, me = session.replicant!, o = this.shown.get(b.id), p = s.player;
    me.traits.chips = (me.traits.chips ?? 0) + 1;
    s.game.events.emit('chips', me.traits.chips);
    if (session.store && !s.shot) session.store.patchTraits(me.id, { chips: me.traits.chips }).catch((e) => console.warn('chip save failed', e));
    if (o) {
      const fly = s.add.sprite(o.sprite.x, o.sprite.y, 'nouschip', 1).setOrigin(0.5, 1).setDepth(6300);
      s.tweens.add({ targets: fly, x: p.x, y: p.y - 14, scale: 0.4, duration: 380, ease: 'Quad.easeIn', onComplete: () => { fly.destroy(); s.fx.sparks(p.x, p.y - 14, PALETTE[18], 10); } });
      this.hide(b.id, o);
    }
    sound.spark();
    s.buildings.take(b.id);
    s.mindLog.push({ t: s.mindClock, text: `${me.name} took a Nous Chip from the Cems' bed: a mind for the next Vessel` });
  }
}
