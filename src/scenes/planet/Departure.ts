import Phaser from 'phaser';
import { sound } from '../../audio/Sound';
import { PALETTE } from '../../core/data';
import { inManny, mannyWorlds, shipFlying, worldKey } from '../../core/mannies';
import { session } from '../../core/session';
import { TRAVEL, distanceLy, fuelFor, travelMs } from '../../world/galaxy';
import type { StarMapData } from '../StarMapScene';
import type { PlanetScene } from '../PlanetScene';
import { DEPTH } from '../PlanetScene';

/**
 * Leaving: the board ring, the star map, the hop in, lift-off, and the way back to a ship in flight.
 * Part of PlanetScene (src/scenes/PlanetScene.ts); `s` is the scene.
 */
export class Departure {
  constructor(readonly s: PlanetScene) {}

  playerOnBoardSpot() {
    const p = this.s.player;
    return Math.abs(p.x - this.s.boardSpot.x) < 13 && Math.abs(p.y - this.s.boardSpot.y) < 9;
  }

  /** Someone has to stay behind: you can launch once this planet has a copy (travel.json needCopy), from the vessel
   * (not from its empty berth while you drive a manny and it waits elsewhere). */
  canLaunch() {
    // (the beginning's trips need nobody left behind: Tutorial.free)
    return !this.s.visit && !this.s.vesselAway && (!TRAVEL.needCopy || this.s.npcs.length > 0 || this.s.tutorial.active);
  }

  /** Mannies on other worlds you could link into from here. */
  private linkable() {
    const s = this.s;
    return mannyWorlds(session.replicant).filter((w) => w.star !== s.planet.star || w.planet !== s.planet.planetIndex);
  }

  /** The board ring glows: something to do there (launch, link, go back to the vessel or the ship). */
  boardReady() {
    return this.canLaunch() || !!this.s.visit || this.s.vesselAway || (!this.s.shot && this.linkable().length > 0);
  }

  tryBoard(): boolean {
    if (this.s.visit) {
      // hologram visit: the vessel takes you back to your ship in flight
      void this.returnToShip();
      return true;
    }
    if (!this.canLaunch() && !this.s.vesselAway && !this.linkable().length) {
      sound.denied();
      this.s.tweens.add({ targets: this.s.vessel, x: this.s.vessel.x + 1, duration: 40, yoyo: true, repeat: 3 });
      // hint without words: a ghost of a copy blinks by the Replicator (or the build pad)
      const ghost = this.s.add.image(this.s.base.x + 24, this.s.base.y + 10, this.s.player.sprite.texture.key, 0).setOrigin(0.5, 1)
        .setTintFill(PALETTE[18]).setAlpha(0).setDepth(6110).setBlendMode(Phaser.BlendModes.ADD);
      this.s.tweens.add({ targets: ghost, alpha: 0.6, duration: 300, yoyo: true, repeat: 3, onComplete: () => ghost.destroy() });
      return true;
    }
    this.s.player.locked = true;
    this.s.player.body.setVelocity(0, 0);
    sound.coreHum();
    const r = session.replicant;
    const data: StarMapData = {
      mode: this.s.vesselAway ? 'link' : 'launch',
      from: this.s.planet.star,
      fromPlanet: this.s.planet.planetIndex,
      embers: this.s.embers,
      lit: this.s.litBeacons,
      blocked: !this.canLaunch(),
      ...(this.s.tutorial.active ? {
        only: this.s.tutorial.allowedKeys(), free: true, gateWhy: this.s.tutorial.gateWhy, guide: this.s.tutorial.guide,
      } : {}),
      mannies: mannyWorlds(r).map((w) => w.key),
      inManny: inManny(r),
      vessel: this.s.vesselAway ? r?.traits.ship ?? null : null,
      journey: this.s.vesselAway && shipFlying(r?.traits.ship) ? r!.traits.ship!.journey : undefined,
      onLaunch: (to, planet) => this.launch(to, planet),
      onLink: (to, planet) => this.s.linker.linkTo(to, planet),
      onVessel: () => this.s.linker.toVessel(),
      onClose: () => { this.s.player.locked = false; this.s.scene.resume(); },
    };
    this.s.scene.pause();
    this.s.scene.launch('starmap', data);
    return true;
  }

  async returnToShip() {
    const r = session.replicant, st = session.store;
    const j = r && st ? await st.activeJourney(r).catch(() => null) : null;
    this.s.cameras.main.fadeOut(400, 24, 20, 37);
    this.s.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      if (j) this.s.scene.start('travel', { journey: j });
      else this.s.scene.start('planet', {});
    });
  }

  /** Fuel paid, the replicant hops in, the vessel lifts off, then the flight begins. */
  launch(to: string, toPlanet: number) {
    this.s.scene.resume();
    // a word still open in the talk box (Thales' at the beginning) does not fly along
    if (this.s.talker.talk) this.s.talker.closeTalk();
    const ly = distanceLy(this.s.planet.star, to);
    const fuel = this.s.tutorial.free(to, toPlanet) ? 0 : fuelFor(ly);
    this.s.launching = true;
    // driving this world's manny: it steps back into its dock and you board in your own body
    const r = session.replicant;
    if (r && inManny(r)) {
      const key = worldKey(this.s.planet.star, this.s.planet.planetIndex);
      if (r.traits.mannies?.[key]) r.traits.mannies = { ...r.traits.mannies, [key]: { at: r.traits.mannies[key].at } };
      r.traits.ship = null;
    }
    this.s.hands.stow();
    this.s.trade.loadHold();
    this.s.trade.loadCulture();
    this.s.trade.loadGoods(to, toPlanet);
    this.s.homecoming.remember();
    this.s.embers -= fuel;
    this.s.pending.embers -= fuel;
    this.s.game.events.emit('embers', this.s.embers);
    void this.s.saver.flushPlanet();
    const pl = this.s.player, v = this.s.vessel;
    pl.locked = true;
    // hop into the vessel
    const hop = { t: 0 };
    const sx = pl.x, sy = pl.y, ex = v.x, ey = v.y - 8;
    this.s.tweens.add({
      targets: hop, t: 1, duration: 360,
      onUpdate: () => { pl.setPosition(sx + (ex - sx) * hop.t, sy + (ey - sy) * hop.t); pl.sprite.y -= Math.sin(hop.t * Math.PI) * 12; },
      onComplete: () => { pl.hide(); this.liftOff(to, toPlanet, ly); },
    });
  }

  liftOff(to: string, toPlanet: number, ly: number) {
    const v = this.s.vessel;
    const thrust = this.s.add.particles(0, 0, 'px', {
      lifespan: { min: 200, max: 500 }, speedY: { min: 60, max: 140 }, speedX: { min: -20, max: 20 },
      scale: { start: 1.6, end: 0 }, tint: [PALETTE[10], PALETTE[9], PALETTE[11]], blendMode: Phaser.BlendModes.ADD, frequency: 8,
    }).setDepth(DEPTH.fx);
    const light = this.s.lighting.add({ x: v.x, y: v.y, radius: 70, color: PALETTE[9], intensity: 1 });
    sound.launch();
    this.s.shake(900, 0.004);
    for (let i = 0; i < 8; i++) this.s.fx.dust(v.x - 20 + i * 6, v.y, 5);
    this.s.cameras.main.stopFollow();
    this.s.tweens.add({
      targets: v, y: v.y - 320, duration: 2600, ease: 'Quad.easeIn', delay: 500,
      onUpdate: () => { thrust.setPosition(v.x, v.y - 4); light.x = v.x; light.y = v.y; this.s.cameras.main.centerOn(v.x, Math.max(v.y + 40, this.s.boardSpot.y - 200)); },
    });
    this.s.time.delayedCall(2400, () => this.s.cameras.main.fadeOut(700, 24, 20, 37));
    const arrivesAt = new Date(Date.now() + travelMs(ly));
    const r = session.replicant, st = session.store;
    const journeyP = r && st && !this.s.shot
      ? st.startJourney(r, to, toPlanet, arrivesAt)
      : Promise.resolve({
        id: 'local', replicant_id: r?.id ?? '', from_star: this.s.planet.star, to_star: to, from_planet: this.s.planet.planetIndex, to_planet: toPlanet,
        departs_at: new Date().toISOString(), arrives_at: arrivesAt.toISOString(),
      });
    this.s.time.delayedCall(3200, () => {
      journeyP.then((journey) => this.s.scene.start('travel', { journey, depart: true }))
        .catch((e) => {
          console.warn('launch failed', e);
          this.s.scene.start('planet', {}); // back on the ground; nothing was saved
        });
    });
  }

  // --- replication ---
}
