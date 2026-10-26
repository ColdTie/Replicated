import Phaser from 'phaser';
import { sound } from '../../audio/Sound';
import { PALETTE } from '../../core/data';
import { inManny, shipFlying, worldKey } from '../../core/mannies';
import { session } from '../../core/session';
import type { PlanetScene } from '../PlanetScene';
import { DEPTH } from '../PlanetScene';
import { squash } from '../../entities/Player';

type Next = { scene: 'planet' | 'travel'; data: object };

/**
 * Linking (manny.json): from this world into a manny on another (the star map's LINK), or back to your own body aboard
 * the vessel, and the arrival when you wake in a body. Part of PlanetScene (src/scenes/PlanetScene.ts); `s` is the scene.
 */
export class Link {
  constructor(readonly s: PlanetScene) {}

  /** Into that world's manny. The body you leave stays: a manny powers down where it stands, your own body boards
   * the vessel here and waits (traits.ship). */
  linkTo(star: string, planet: number) {
    const s = this.s, r = session.replicant;
    const target = r?.traits.mannies?.[worldKey(star, planet)];
    s.scene.resume();
    if (!r || !target || s.launching) { sound.denied(); s.player.locked = false; return; }
    const here = worldKey(s.planet.star, s.planet.planetIndex), driving = inManny(r);
    const at = { x: Math.round(s.player.x), y: Math.round(s.player.y) };
    this.leave(driving, async () => {
      if (driving) r.traits.mannies = { ...r.traits.mannies, [here]: { at: Date.now(), ...r.traits.mannies?.[here], ...at } };
      else r.traits.ship = { star: s.planet.star, planet: s.planet.planetIndex };
      r.status = 'active'; r.star_id = star; r.planet_index = planet;
      r.pos_x = target.x ?? null; r.pos_y = target.y ?? null;
      return { scene: 'planet', data: { link: 'manny' } };
    });
  }

  /** Back into your own body, aboard the vessel: on the world it waits on, or out in space if it is still flying. */
  toVessel() {
    const s = this.s, r = session.replicant, ship = r?.traits.ship;
    s.scene.resume();
    if (!r || !ship || s.launching) { s.player.locked = false; return; }
    const here = worldKey(s.planet.star, s.planet.planetIndex);
    const at = { x: Math.round(s.player.x), y: Math.round(s.player.y) };
    this.leave(true, async () => {
      if (r.traits.mannies?.[here]) r.traits.mannies = { ...r.traits.mannies, [here]: { ...r.traits.mannies[here], ...at } };
      r.traits.ship = null;
      if (ship.journey && shipFlying(ship)) {
        r.status = 'in_transit'; r.star_id = ship.journey.from_star; r.planet_index = ship.journey.from_planet;
        return { scene: 'travel', data: { journey: ship.journey } };
      }
      // a flight that landed without you: that star is reached
      if (ship.journey) await session.store?.discover(ship.journey.to_star, r.id).catch((e) => console.warn('discover failed', e));
      r.status = 'active'; r.star_id = ship.star; r.planet_index = ship.planet; r.pos_x = null; r.pos_y = null;
      return { scene: 'planet', data: { link: 'vessel' } };
    });
  }

  /** The body you leave goes still (a manny powers down; your own body hops into the vessel) and a beam takes you. */
  private leave(driving: boolean, next: () => Promise<Next>) {
    const s = this.s, pl = s.player;
    s.launching = true;
    pl.locked = true;
    pl.body.setVelocity(0, 0);
    s.hands.stow();
    s.homecoming.remember();
    void s.saver.flushPlanet();
    const go = (x: number, y: number) => {
      this.beam(x, y, false);
      s.time.delayedCall(650, async () => {
        const r = session.replicant!;
        const to = await next();
        try { await session.store?.saveReplicant(r); } catch (e) { console.warn('link save failed', e); }
        s.cameras.main.fadeOut(450, 24, 20, 37);
        s.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => s.scene.start(to.scene, to.data));
      });
    };
    if (driving) {
      // the manny goes dark where it stands
      pl.light.active = false;
      pl.sprite.setTint(0x8a8aa6);
      go(pl.x, pl.y);
      return;
    }
    const v = s.vessel, sx = pl.x, sy = pl.y, ex = v.x, ey = v.y - 8;
    const hop = { t: 0 };
    s.tweens.add({
      targets: hop, t: 1, duration: 360,
      onUpdate: () => { pl.setPosition(sx + (ex - sx) * hop.t, sy + (ey - sy) * hop.t); pl.sprite.y -= Math.sin(hop.t * Math.PI) * 12; },
      onComplete: () => { pl.hide(); go(v.x, v.y - 4); },
    });
  }

  /** A thin beam of the player's color between the sky and a body: arriving (down) or leaving (up). */
  beam(x: number, y: number, down: boolean) {
    const s = this.s, color = s.player.featureColor;
    sound.link(down);
    const top = s.cameras.main.worldView.y - 20;
    const ray = s.add.rectangle(x, y - 10, 3, y - 10 - top, color).setOrigin(0.5, 1).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.fx).setAlpha(0.9);
    const core = s.add.rectangle(x, y - 10, 1, y - 10 - top, 0xffffff).setOrigin(0.5, 1).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.fx);
    const light = s.lighting.add({ x, y: y - 8, radius: 60, color, intensity: 1 });
    if (down) { ray.setScale(1, 0); core.setScale(1, 0); s.tweens.add({ targets: [ray, core], scaleY: 1, duration: 220, ease: 'Quad.easeIn' }); }
    s.tweens.add({ targets: [ray, core], scaleX: 0, alpha: 0, delay: 380, duration: 420, ease: 'Quad.easeIn', onComplete: () => { ray.destroy(); core.destroy(); } });
    s.tweens.add({ targets: light, intensity: 0, delay: 300, duration: 600, onComplete: () => s.lighting.remove(light) });
    s.fx.sparks(x, y - 8, color, 10);
  }

  /** Waking in a body you linked into: dark, a beam comes down, the visor flickers on. Into your own body aboard the
   * vessel, the beam finds the vessel and you hop out of it. */
  playLinkIn(kind: 'manny' | 'vessel') {
    const s = this.s, pl = s.player;
    pl.locked = true;
    s.cameras.main.fadeIn(600, 24, 20, 37);
    if (kind === 'vessel') {
      pl.hide();
      s.cameras.main.centerOn(s.vessel.x, s.vessel.y);
      s.time.delayedCall(450, () => this.beam(s.vessel.x, s.vessel.y - 4, true));
      s.time.delayedCall(1100, () => s.hopOut());
      return;
    }
    pl.light.active = false;
    pl.sprite.setTint(0x404060);
    s.time.delayedCall(450, () => this.beam(pl.x, pl.y, true));
    for (const [t, on] of [[700, 0], [840, 1], [960, 0], [1100, 1]] as const) {
      s.time.delayedCall(t, () => { pl.light.active = !!on; if (on) pl.sprite.clearTint(); else pl.sprite.setTint(0x404060); });
    }
    s.time.delayedCall(1150, () => {
      squash(s, pl.sprite, 0.75, 1.25, 140);
      s.fx.sparks(pl.x, pl.y - 8, PALETTE[29], 8);
      s.game.events.emit('titlecard', s.planet.name, s.planet.subtitle);
      s.homecoming.run(() => { pl.locked = false; s.saver.markAwake(); });
    });
  }
}
