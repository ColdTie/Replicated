// The Vessel Printer (story/STORY.md Copying, Steve 2026-10-28; src/data/vesselprinter.json): the last of the Cems'
// designs, printed on the homeworld once the Supercomputer stands, and from then on where new Vessels are made, in place
// of the Replicator. Standing at its pod's door (a ring fills) or pressing attack there opens WAKE or HOLD
// (PlanetScene.tryReplicate); once its maker is scanned the pod prints the body by itself, by the clock and also while
// nobody plays (planet_states.data.vesselPrint), the newest rows still the Cems' green, and the new Vessel steps out of
// the door (PlanetScene.bornAt). A Vessel costs what it always has (drift.json cost).
import Phaser from 'phaser';
import { sound } from '../audio/Sound';
import { bodyFor } from '../core/body';
import { PALETTE } from '../core/data';
import { session } from '../core/session';
import VP from '../data/vesselprinter.json';
import type { Light } from '../fx/Lighting';
import type { Building, PlanetSave, ReplicantSave, VesselPrint } from '../net/store';
import type { PlanetScene } from '../scenes/PlanetScene';

/** the rows at the top of the forming body that are still living Cems */
const ALIVE_ROWS = 3;

export class VesselPrinter {
  /** the Vessel in the pod, or null */
  state: VesselPrint | null;
  /** how long a Vessel takes in the pod (ms; playtests shorten it) */
  printMs = VP.printMs;
  private dwell = 0;
  private mustLeave = false;
  private ring?: Phaser.GameObjects.Graphics;
  private spot?: Phaser.GameObjects.Ellipse;
  private spotLight?: Light;
  private podLight?: Light;
  private forming?: { body: Phaser.GameObjects.Image; sheen: Phaser.GameObjects.Image; cems: Phaser.GameObjects.Image; line: Phaser.GameObjects.Rectangle; glow: Phaser.GameObjects.Image; rows: number };

  constructor(private scene: PlanetScene, save: PlanetSave | null) {
    this.state = save?.data.vesselPrint ?? null;
  }

  /** The Vessel Printer standing finished on this world, if any. */
  get building(): Building | undefined { return this.scene.buildings?.list.find((b) => b.design === VP.design && b.built && !b.vetoed); }

  /** Where you stand to make a Vessel: before the pod's door. */
  get door() { const b = this.building; return b ? { x: b.x, y: b.y + VP.door.standDy } : null; }

  /** A Vessel is in the pod. */
  get busy() { return !!this.state; }

  /** How far the Vessel in the pod is printed, 0..1. */
  get fraction() { const st = this.state; return st ? Math.max(0, Math.min(1, (Date.now() - st.start) / Math.max(1, st.ms))) : 0; }

  /** Standing in the pod's doorway (in front of the middle of the printer's front). */
  playerAtDoor() {
    const b = this.building, p = this.scene.player;
    return !!b && !!p && Math.abs(p.x - b.x) < VP.door.halfW && p.y > b.y - VP.door.behind && p.y < b.y + VP.door.front;
  }

  /** The pod's floor and crown in the world, as the printer is drawn now. */
  pod() {
    const b = this.building, bl = this.scene.buildings;
    if (!b) return null;
    const [fx, fy, fz] = VP.pod.floor, [cx, cy, cz] = VP.pod.crown;
    const floor = bl.modelPoint(b.id, fx, fy, fz), crown = bl.modelPoint(b.id, cx, cy, cz);
    return floor && crown ? { floor, crown } : null;
  }

  /** Where WAKE or HOLD hangs: over the middle of the gantry, clear of the pod. */
  choiceAt() {
    const b = this.building;
    if (!b) return null;
    const [x, y, z] = VP.gantryTop, top = this.scene.buildings.modelPoint(b.id, x, y, z);
    return { x: b.x, y: (top?.y ?? b.y - 60) - VP.choiceDy };
  }

  /** The maker's choice is made: the body goes into the pod and prints by itself from now on. */
  start(kind: VesselPrint['kind'], row: ReplicantSave, elder?: string) {
    this.state = { start: Date.now(), ms: this.printMs, kind, row, by: session.replicant?.id ?? '', ...(elder ? { elder } : {}) };
    this.save();
    const pod = this.pod();
    if (pod) { this.scene.fx.sparks(pod.floor.x, pod.floor.y - 4, PALETTE[12], 10); sound.cultureSeed(pod.floor); }
  }

  /** Not enough Ember (or no room for another Vessel): the pod's light stutters and the printer buzzes. */
  hungry() {
    const l = this.podLight ?? this.spotLight;
    if (!l) return;
    this.scene.tweens.add({ targets: l, intensity: 0.05, duration: 60, yoyo: true, repeat: 3 });
  }

  /** The scanner reads the maker: a beam runs down and up over it, and the pod flares. */
  scan(target: Phaser.GameObjects.Sprite, color: number, ms = VP.scanMs) {
    const s = this.scene;
    const beam = s.add.rectangle(target.x, target.y - target.height, 18, 1, color).setBlendMode(Phaser.BlendModes.ADD).setDepth(6150);
    s.tweens.add({ targets: beam, y: target.y, duration: ms / 2, yoyo: true, ease: 'Sine.easeInOut', onComplete: () => beam.destroy() });
    const pod = this.pod();
    if (!pod) return;
    this.podLight ??= s.lighting.add({ x: pod.floor.x, y: (pod.floor.y + pod.crown.y) / 2, radius: 30, color: PALETTE[18], intensity: 0 });
    s.tweens.add({ targets: this.podLight, intensity: 0.9, duration: ms / 2, yoyo: true });
  }

  /** Clears the pod and the door's light (the printer is gone or the scene ends). */
  private clearForming() {
    const f = this.forming;
    if (!f) return;
    for (const o of [f.body, f.sheen, f.cems, f.line, f.glow]) o.destroy();
    this.forming = undefined;
  }

  private save() {
    const s = this.scene;
    if (session.planet) session.planet.data.vesselPrint = this.state;
    if (!s.shot && !s.visit) { s.pending.vesselPrint = this.state; void s.flushPlanet(); }
  }

  update(time: number, dt: number) {
    const b = this.building;
    if (!b) return;
    this.updateSpot(time);
    if (this.state) this.updatePrint(time);
    this.updateDoor(dt);
  }

  /** A faint ring before the door; it glows and pulses while a Vessel can be made. */
  private updateSpot(time: number) {
    const s = this.scene, d = this.door!;
    if (!this.spot) {
      this.spot = s.add.ellipse(d.x, d.y, 20, 8).setDepth(55);
      this.spotLight = s.lighting.add({ x: d.x, y: d.y, radius: 26, color: PALETTE[18], intensity: 0 });
    }
    const can = s.canReplicate(), on = this.playerAtDoor(), pulse = 0.5 + 0.5 * Math.sin(time / 260);
    this.spot.setStrokeStyle(1, can ? PALETTE[18] : PALETTE[22], can ? 0.6 + 0.4 * pulse : 0.35);
    this.spot.setFillStyle(PALETTE[18], can ? (on ? 0.35 : 0.12 * pulse) : 0);
    this.spotLight!.intensity = can ? 0.4 + 0.3 * pulse + (on ? 0.3 : 0) : 0;
  }

  /**
   * The body rises in the pod row by row: the printed rows in its own colors (a little cold until it wakes), the newest
   * ones the Cems' green, a bright line where the head is. When it is whole the Vessel steps out of the door.
   */
  private updatePrint(time: number) {
    const s = this.scene, st = this.state!, pod = this.pod();
    if (!pod) return;
    if (!this.forming) {
      const key = bodyFor(s, st.row).key, depth = 100 + this.building!.y + 1;
      // the Cems' light in the pod, so the body reads at night too
      const glow = s.add.image(pod.floor.x, pod.floor.y - 10, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(PALETTE[12]).setScale(0.45).setAlpha(0.3).setDepth(depth);
      const body = s.add.image(pod.floor.x, pod.floor.y, key, 0).setOrigin(0.5, 1).setDepth(depth);
      // the fresh print shines a little until it wakes
      const sheen = s.add.image(pod.floor.x, pod.floor.y, key, 0).setOrigin(0.5, 1).setDepth(depth).setTintFill(PALETTE[18]).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.4);
      const cems = s.add.image(pod.floor.x, pod.floor.y, key, 0).setOrigin(0.5, 1).setDepth(depth).setTintFill(PALETTE[12]).setAlpha(0.9);
      const line = s.add.rectangle(pod.floor.x, pod.floor.y, 12, 1, 0xffffff).setBlendMode(Phaser.BlendModes.ADD).setDepth(depth + 1);
      this.forming = { body, sheen, cems, line, glow, rows: -1 };
      this.podLight ??= s.lighting.add({ x: pod.floor.x, y: (pod.floor.y + pod.crown.y) / 2, radius: 30, color: PALETTE[18], intensity: 0 });
    }
    const f = this.forming, h = f.body.height, w = f.body.width;
    const rows = Math.min(h, Math.ceil(h * this.fraction));
    if (rows !== f.rows) {
      const solid = Math.max(0, rows - ALIVE_ROWS);
      f.body.setCrop(0, h - solid, w, solid);
      f.sheen.setCrop(0, h - solid, w, solid);
      f.cems.setCrop(0, h - rows, w, rows - solid);
      f.line.setPosition(pod.floor.x, pod.floor.y - rows);
      if (f.rows >= 0 && rows > f.rows) {
        s.fx.sparks(pod.floor.x + (Math.random() - 0.5) * 8, pod.floor.y - rows, PALETTE[12], 2);
        const p = s.player;
        sound.printLayer(pod.floor.x - p.x, Math.hypot(pod.floor.x - p.x, pod.floor.y - p.y));
      }
      f.rows = rows;
    }
    f.line.setAlpha(0.5 + 0.4 * Math.sin(time / 90));
    f.glow.setAlpha(0.22 + 0.1 * Math.sin(time / 500));
    if (this.podLight) this.podLight.intensity = 0.6 + 0.2 * Math.sin(time / 500);
    // whole: it steps out (never on a visit, where nothing here is ours to change)
    if (this.fraction >= 1 && !s.visit) this.finish();
  }

  /** The Vessel steps out of the door into the world; the pod goes dark. */
  private finish() {
    const st = this.state, d = this.door;
    if (!st || !d) return;
    this.state = null;
    this.save();
    this.clearForming();
    if (this.podLight) this.scene.tweens.add({ targets: this.podLight, intensity: 0, duration: 900 });
    // (already among the copies here: someone else had it step out, only the empty pod was not saved)
    if (this.scene.npcs.some((n) => n.data.id === st.row.id)) return;
    this.scene.bornAt(st.row, d.x, d.y + 2, st.elder);
    this.mustLeave = this.playerAtDoor();
  }

  /** The doorway: standing in it a moment opens WAKE or HOLD (walking past never does; it waits for you to leave first). */
  private updateDoor(dt: number) {
    const s = this.scene, pl = s.player, d = this.door!;
    if (this.mustLeave && !this.playerAtDoor()) this.mustLeave = false;
    const on = !this.mustLeave && !this.state && !s.choice && !s.replicating && !s.visit && !!pl && pl.alive && !pl.locked && !s.stopped && !s.talker.talk && this.playerAtDoor();
    this.dwell = on ? this.dwell + dt : 0;
    this.ring ??= s.add.graphics().setDepth(6150);
    this.ring.clear();
    if (!this.dwell) return;
    const k = Math.min(1, this.dwell / VP.dwellMs);
    this.ring.lineStyle(1, PALETTE[18], 0.4 + 0.5 * k).beginPath().arc(d.x, d.y, 10, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2).strokePath();
    if (k < 1) return;
    this.dwell = 0;
    this.ring.clear();
    this.mustLeave = true;
    s.tryReplicate();
  }

  /** The choice closed: it opens again only once you have stepped out of the doorway. */
  closed() { this.mustLeave = true; }
}
