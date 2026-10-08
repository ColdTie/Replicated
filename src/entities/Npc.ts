// A copy left behind to run the planet. It wanders the base, mines nearby crystals, carries Embers back to the
// Replicator, and greets you when you come close. Its drift (visor, headgear, trail) tells it apart at a glance.
import Phaser from 'phaser';
import { sound, type Instrument, type Mood, type Tempo } from '../audio/Sound';
import { anim } from '../core/assets';
import { bodyFor, ensureBodyTexture, kitColor } from '../core/body';
import { MIND, NEEDS, PALETTE, PLAYER, VILLAGE, WARREN } from '../core/data';
import { DRIFT, stat } from '../core/drift';
import { session } from '../core/session';
import type { Light } from '../fx/Lighting';
import type { ReplicantSave } from '../net/store';
import type { PlanetScene } from '../scenes/PlanetScene';
import { Gear } from './Gear';
import type { BuildJob } from './Village';
import type { BelowTask } from './Warren';
import type { WarrenRoom } from '../net/store';
import { squash, type Player } from './Player';

type State = 'idle' | 'walk' | 'mine' | 'carry' | 'greet' | 'born' | 'hammer' | 'chore' | 'below' | 'blank';
/** Something a copy decided to do with its hands: walk there, swing a few times, then it happens. */
interface Chore { x: number; y: number; swings: number; swing: () => void; done: () => void }
type Pt = { x: number; y: number };

export class Npc {
  readonly sprite: Phaser.GameObjects.Sprite;
  private shadow: Phaser.GameObjects.Image;
  private gear: Gear;
  private light: Light;
  private carried?: Phaser.GameObjects.Image;
  private key: string;
  trailColor: number;
  x: number; y: number;
  state: State = 'idle';
  private target: Pt | null = null;
  private until = 0;
  private nextTrip: number;
  private nextGreet = 0;
  private nextSparkle = 0;
  private swings = 0;
  private mineAt: Pt | null = null;
  private job: BuildJob | null = null;
  private chore: Chore | null = null;
  /** heading for the hatch to go down and do this */
  private descent: { task: BelowTask; room?: WarrenRoom } | null = null;
  private nextBuild: number;
  /** hop height, added on top of the walking position */
  z = 0;
  /** 0 rested .. 1 weary: climbs while awake, cleared by a sleep in a resting station */
  weary = 0;
  /** company and purpose: 0 empty .. 1 full (src/data/needs.json); rest is 1 - weary. They do not eat or drink. */
  needs: { company: number; purpose: number };
  private nextNeedsSave = 0;
  private nextYawn = 0;
  /** the night level at which this copy turns in: its chosen bedtime, else early birds and night owls from its id */
  private seedNight: number;
  get temper() { return this.data.traits.temperament; }
  get nightFrom() {
    const b = this.temper?.bedtime;
    return b === 'early' ? 0.4 : b === 'late' ? 0.8 : b === 'even' ? 0.6 : this.seedNight;
  }
  /** walking pace from its temperament */
  get pace() { const p = this.temper?.pace; return p === 'slow' ? 0.85 : p === 'quick' ? 1.15 : 1; }

  constructor(private scene: PlanetScene, readonly data: ReplicantSave, x: number, y: number) {
    this.x = x; this.y = y;
    const look = bodyFor(scene, data);
    this.key = look.key;
    this.trailColor = data.traits.blank ? PALETTE[21] : PALETTE[data.traits.trail ?? kitColor(data.traits.body?.accent, 10)];
    this.shadow = scene.add.image(x, y, 'shadow').setAlpha(0.45).setTint(PALETTE[25]).setDepth(50);
    this.sprite = scene.add.sprite(x, y, this.key).setOrigin(0.5, 1).play(anim(this.key, 'idle'));
    this.sprite.anims.setProgress(Math.random());
    this.gear = new Gear(scene, this.sprite, look.model, data.traits.blank ? 0 : data.traits.gear ?? 0, this.trailColor, look.anchors);
    // a small warm light: copies are "ours", like the base
    this.light = scene.lighting.add({ x, y, radius: 34 * stat(data, 'light'), color: 0xffe2b8, intensity: 0.75 });
    this.nextTrip = scene.time.now + DRIFT.tripMs * (0.5 + Math.random()) / stat(data, 'gather');
    // copies get to work soon after you arrive, one after another
    this.nextBuild = scene.time.now + 3500 + Math.random() * 5000;
    const [lo, hi] = WARREN.rest.nightFrom;
    this.seedNight = lo + ((this.voiceSeed >>> 8) % 100) / 100 * (hi - lo);
    // how tired it is carries over; a copy that slept while you were away comes back rested (Warren checks the bed)
    this.weary = data.traits.weary ?? Math.min(0.6, ((this.voiceSeed >>> 16) % 100) / 160);
    const saved = data.traits.needs as { company?: number; purpose?: number } | undefined;
    this.needs = { company: saved?.company ?? 0.7, purpose: saved?.purpose ?? 0.7 };
    this.sync();
    if (data.traits.blank) this.setBlank();
  }

  /** rest, company and purpose averaged, lifted a little by the warren's murals. */
  get mood() {
    const n = this.needs;
    const base = (1 - this.weary + n.company + n.purpose) / 3;
    return Math.min(1, base + Math.min(NEEDS.muralMoodMax, this.scene.warren.muralCount * NEEDS.muralMood));
  }
  get moodWord(): 'content' | 'low' | 'bleak' { const m = this.mood; return m > 0.6 ? 'content' : m > 0.35 ? 'low' : 'bleak'; }
  /** Which needs are low, in words ("lonely (company 20%)"). */
  lowNeeds(): string[] {
    const out: string[] = [];
    const n = this.needs, pct = (v: number) => `${Math.round(v * 100)}%`;
    if (this.weary > 0.8) out.push(`weary (rest ${pct(1 - this.weary)})`);
    if (n.company < NEEDS.lowBelow) out.push(`lonely (company ${pct(n.company)})`);
    if (n.purpose < NEEDS.lowBelow) out.push(`aimless (purpose ${pct(n.purpose)})`);
    return out;
  }

  /** Finished something: purpose fills (more for a want met). */
  onWorked(want = false) {
    this.needs.purpose = Math.min(1, this.needs.purpose + (want ? NEEDS.purposeOnWant : NEEDS.purposeOnWork));
  }

  /** Needs change with time, here or while nobody was here (hours). */
  advanceNeeds(hours: number) {
    const n = this.needs, d = NEEDS.decayHours;
    n.purpose = Math.max(0, n.purpose - hours / d.purpose);
    const soc = this.temper?.sociability;
    // on load the copies' away-time is counted before the original exists: no player yet means nobody near
    const p = this.scene.player as Player | undefined;
    const near = (!this.scene.visit && !!p?.alive && Math.hypot(p.x - this.x, p.y - this.y) < NEEDS.companyNearPx)
      || this.scene.npcs.some((o) => o !== this && !o.below && Math.hypot(o.x - this.x, o.y - this.y) < NEEDS.companyNearPx * 0.7);
    const rate = soc === 'solitary' ? 0.5 : soc === 'clingy' ? 1.5 : 1;
    n.company = near && hours < 0.01 ? Math.min(1, n.company + (hours * NEEDS.companyGainPerHour) / rate) : Math.max(0, n.company - (hours * rate) / d.company);
  }

  /** Writes needs and weariness to its row now and then (not for screenshot copies). */
  private saveNeeds(time: number, force = false) {
    if (!force && time < this.nextNeedsSave) return;
    this.nextNeedsSave = time + 180_000;
    const st = session.store;
    if (!st || this.scene.shot || this.data.id.startsWith('fake') || this.data.id === 'pending') return;
    this.data.traits.needs = { ...this.needs };
    this.data.traits.weary = Math.round(this.weary * 100) / 100;
    st.patchTraits(this.data.id, { needs: this.data.traits.needs, weary: this.data.traits.weary }, this.below ? undefined : { x: this.x, y: this.y }).catch(() => undefined);
  }

  /** Born blank: grey, dim and still by the Replicator until its first wake makes it itself. */
  get blank() { return this.state === 'blank'; }
  private setBlank() {
    this.state = 'blank';
    this.sprite.setTint(0x7a7f96);
    this.light.intensity = 0.25;
    this.light.active = true;
  }

  /**
   * The becoming: the copy chose its body, voice, temperament, wants and name. The parts snap on in a white flash,
   * the visor flickers through the colors and lights in its own, and it moves for the first time.
   */
  become(traits: ReplicantSave['traits'], name?: string) {
    Object.assign(this.data.traits, traits, { blank: false, v: 1 });
    if (name) this.data.name = name;
    const sc = this.scene, s = this.sprite;
    const look = bodyFor(sc, this.data);
    this.trailColor = PALETTE[this.data.traits.trail ?? kitColor(this.data.traits.body?.accent, 10)];
    this.state = 'born';
    s.clearTint();
    s.setTintFill(0xffffff);
    sound.birth();
    sc.fx.sparks(this.x, this.y - 10, this.trailColor, 16);
    sc.time.delayedCall(140, () => {
      this.key = look.key;
      s.setTexture(look.key, 0);
      s.clearTint();
      squash(sc, s, 1.3, 0.75, 140);
      this.gear.setAnchors(look.anchors);
      this.gear.setFrame(this.data.traits.gear ?? 0, this.trailColor);
      this.light.intensity = 0.75;
      // the visor flickers through every color and settles on its own
      const keys = this.data.traits.body ? PLAYER.featureColors.map((f) => ensureBodyTexture(sc, this.data.traits.body, f[1])) : [look.key];
      let i = 0;
      const flick = sc.time.addEvent({
        delay: 70, repeat: 8,
        callback: () => {
          i++;
          s.setTexture(i > 8 ? look.key : keys[i % keys.length], 0);
          if (i > 8) { s.play(anim(look.key, 'idle')); flick.remove(); this.state = 'greet'; this.until = sc.time.now + 1200; this.hop(); sc.fx.sparks(this.x, this.y - 12, PALETTE[this.data.traits.feature ?? 10], 10); }
        },
      });
    });
  }

  get weariness(): 'rested' | 'tired' | 'weary' { return this.weary < 0.35 ? 'rested' : this.weary < 0.8 ? 'tired' : 'weary'; }

  /** Building-up effect when the Replicator makes this copy. Calls done() when it can walk. */
  playBirth(done: () => void) {
    this.state = 'born';
    const s = this.sprite;
    const h = s.height;
    const line = this.scene.add.rectangle(s.x, s.y, 16, 1, this.trailColor).setBlendMode(Phaser.BlendModes.ADD).setDepth(6150);
    const shown = { rows: 0 };
    this.gear.image.setAlpha(0);
    s.setTintFill(0xffffff);
    this.scene.tweens.add({
      targets: shown, rows: h, duration: 1400, ease: 'Linear',
      onUpdate: () => {
        const r = Math.floor(shown.rows);
        s.setCrop(0, h - r, s.width, r);
        line.setPosition(s.x, s.y - r);
        if (Math.random() < 0.4) this.scene.fx.sparks(s.x + (Math.random() - 0.5) * 12, s.y - r, this.trailColor, 1);
      },
      onComplete: () => {
        line.destroy();
        s.setCrop();
        s.clearTint();
        squash(this.scene, s, 1.3, 0.75, 140);
        this.scene.fx.sparks(s.x, s.y - 10, this.trailColor, 18);
        this.gear.image.setAlpha(1);
        if (this.data.traits.blank) { s.play(anim(this.key, 'idle')); this.setBlank(); done(); return; }
        // the visor flickers through colors and settles on its own drift color (copies born before session 9)
        const keys = PLAYER.featureColors.map((f) => bodyFor(this.scene, { ...this.data, traits: { ...this.data.traits, feature: f[1] } }).key);
        let i = 0;
        const flick = this.scene.time.addEvent({
          delay: 70, repeat: 8,
          callback: () => {
            i++;
            const k = i > 8 ? this.key : keys[i % keys.length];
            s.setTexture(k, s.frame.name);
            if (i > 8) { s.play(anim(this.key, 'idle')); flick.remove(); this.state = 'greet'; this.until = this.scene.time.now + 900; this.hop(); done(); }
          },
        });
      },
    });
  }

  private hop() {
    this.scene.tweens.add({ targets: this, z: 6, duration: 140, yoyo: true, ease: 'Quad.easeOut' });
    squash(this.scene, this.sprite, 0.8, 1.2, 120);
  }

  /** Down in the warren (digging or asleep): nothing of the copy is on the surface. */
  get below() { return this.state === 'below'; }

  update(time: number, dt: number) {
    if (this.state === 'born' || this.state === 'blank') { this.sync(); return; }
    if (this.state === 'below') return;
    const p = this.scene.player;
    const dp = Math.hypot(p.x - this.x, p.y - this.y);

    // say hello when you come close: turn, hop, chirp (a solitary copy waits for you to come closer)
    const soc = this.temper?.sociability;
    const greetAt = soc === 'solitary' ? 18 : soc === 'clingy' ? 44 : 30;
    if (dp < greetAt && time > this.nextGreet && p.alive && this.state !== 'mine') {
      this.nextGreet = time + (soc === 'solitary' ? 34_000 : soc === 'clingy' ? 11_000 : 20_000);
      this.state = 'greet';
      this.until = time + 900;
      this.sprite.setFlipX(p.x < this.x);
      this.hop();
      sound.pet();
    }

    switch (this.state) {
      case 'greet':
        if (time > this.until) this.state = 'idle';
        break;
      case 'idle':
        if (time > this.until) this.think(time);
        break;
      case 'walk':
      case 'carry':
        if (this.target && this.walkTo(this.target, dt)) {
          if (this.state === 'carry') this.deliver(time);
          else if (this.mineAt) { this.state = 'mine'; this.swings = 0; this.until = time; }
          else if (this.chore) { this.state = 'chore'; this.swings = 0; this.until = time; }
          else if (this.descent) { const d = this.descent; this.descent = null; this.scene.warren.enter(this, d.task, d.room); return; }
          else if (this.job) { this.state = 'hammer'; this.swings = 0; this.until = time; this.scene.village.showGhost(this.job, 0); }
          else { this.state = 'idle'; this.until = time + 800 + Math.random() * 2500; }
        } else if (!this.target) {
          if (this.job) { this.scene.village.release(this.job); this.job = null; this.nextBuild = time + 5000; }
          if (this.descent) { this.scene.warren.release(this); this.descent = null; }
          this.chore = null;
          this.state = 'idle';
        }
        break;
      case 'chore':
        if (time > this.until) {
          const c = this.chore;
          if (!c) { this.state = 'idle'; break; }
          if (this.swings >= c.swings) {
            this.chore = null;
            c.done();
            this.onWorked();
            this.hop();
            this.state = 'idle';
            this.until = time + 1500;
            break;
          }
          this.swings++;
          this.until = time + VILLAGE.hammerMs;
          this.sprite.play(anim(this.key, 'attack'), true);
          this.sprite.setFlipX(c.x < this.x);
          c.swing();
        }
        break;
      case 'hammer':
        if (time > this.until) {
          const job = this.job!;
          if (this.swings >= VILLAGE.hammerSwings) {
            this.scene.village.complete(job);
            this.onWorked();
            this.job = null;
            if (dp < 220) sound.build();
            this.hop();
            this.state = 'idle';
            this.until = time + 1500;
            this.nextBuild = time + 4000 + Math.random() * 6000;
            break;
          }
          this.swings++;
          this.until = time + VILLAGE.hammerMs;
          this.sprite.play(anim(this.key, 'attack'), true);
          this.sprite.setFlipX(job.x < this.x);
          this.scene.fx.sparks(job.x + (Math.random() - 0.5) * 8, job.y - 6 - Math.random() * 10, job.tint !== undefined ? PALETTE[job.tint] : PALETTE[10], 3);
          this.scene.village.showGhost(job, this.swings / VILLAGE.hammerSwings);
          if (dp < 160) sound.hit();
        }
        break;
      case 'mine':
        if (time > this.until) {
          if (this.swings++ >= 3) { this.pickUp(); break; }
          this.until = time + 450;
          this.sprite.play(anim(this.key, 'attack'), true);
          this.sprite.setFlipX(this.mineAt!.x < this.x);
          this.scene.fx.sparks(this.mineAt!.x, this.mineAt!.y - 6, PALETTE[10], 3);
          if (dp < 160) sound.crystal();
        }
        break;
    }

    // weariness builds while awake (lamps in the warren slow it); needs tick; the light shows the mood
    const lampBonus = Math.min(NEEDS.lampWakeMax, this.scene.warren.lampCount * NEEDS.lampWakeBonus);
    this.weary = Math.min(1, this.weary + ((1 - lampBonus) * dt) / (WARREN.rest.wearyAfterMinutes * 60_000));
    this.advanceNeeds(dt / 3_600_000);
    this.saveNeeds(time);
    const [lo, hi] = NEEDS.moodLight;
    this.light.intensity = 0.75 * (lo + (hi - lo) * this.mood) * (1 - 0.3 * this.weary);
    if (this.weary > 0.7 && time > this.nextYawn && (this.state === 'idle' || this.state === 'walk')) {
      this.nextYawn = time + 9000 + Math.random() * 12000;
      squash(this.scene, this.sprite, 0.9, 1.12, 260);
      const puff = this.scene.add.image(this.x + (this.sprite.flipX ? -5 : 5), this.y - 16, 'px').setTint(PALETTE[21]).setAlpha(0.5).setDepth(6090);
      this.scene.tweens.add({ targets: puff, y: puff.y - 8, alpha: 0, scale: 2, duration: 900, onComplete: () => puff.destroy() });
    }
    const moving = this.state === 'walk' || this.state === 'carry';
    const working = this.state === 'mine' || this.state === 'hammer';
    if (!working || time > this.until - 300) {
      const want = anim(this.key, moving ? 'walk' : 'idle');
      if (this.sprite.anims.currentAnim?.key !== want && !working) this.sprite.play(want);
    }
    // trail: little sparkles in the copy's own color when it walks
    if (moving && time > this.nextSparkle) {
      this.nextSparkle = time + 160;
      this.scene.fx.sparks(this.x, this.y, this.trailColor, 1);
    }
    this.sync();
  }

  private think(time: number) {
    const base = this.scene.baseCenter;
    // the warren first: a room waiting to be dug, or bed when it is night and there is a bed
    const down = this.scene.warren.pickTask(this, this.scene.env.night);
    if (down?.task === 'entrance') { this.scene.warren.digEntrance(this); return; }
    if (down?.task === 'wood') { if (this.scene.cutTree(this)) return; }
    else if (down?.task === 'scavenge') { this.scene.warren.scavenge(this, down.ruinIndex ?? 0); return; }
    else if (down) {
      this.descent = { task: down.task, room: down.room };
      this.mineAt = null;
      const h = this.scene.warren.hatch;
      this.target = { x: h.x, y: h.y + 2 };
      this.state = 'walk';
      return;
    }
    // a building the others are raising? builders join first; then village work; wanderers often skip both
    const work = this.temper?.work;
    if (time > this.nextBuild && !(work === 'wanderer' && Math.random() < 0.5)) {
      const site = this.scene.buildings.pickJob(this);
      if (site && this.scene.buildings.work(this, site)) { this.nextBuild = time + (work === 'builder' ? 2000 : 6000); return; }
      const job = this.scene.village.requestJob(this);
      if (job) {
        this.job = job;
        this.mineAt = null;
        this.target = { x: job.x + (this.x < job.x ? -13 : 13), y: job.y + 4 };
        this.state = 'walk';
        return;
      }
      this.nextBuild = time + (work === 'builder' ? 4000 : 9000) + Math.random() * 6000;
    }
    // time for a trip: go mine the nearest healthy crystal near the base (bold copies range further)
    const risk = this.temper?.risk;
    const range = risk === 'bold' ? 330 : risk === 'careful' ? 150 : 220;
    if (time > this.nextTrip) {
      this.nextTrip = time + DRIFT.tripMs / stat(this.data, 'gather');
      const node = this.scene.nodes.filter((n) => n.alive && Math.hypot(n.x - base.x, n.y - base.y) < range)
        .sort((a, b) => Math.hypot(a.x - this.x, a.y - this.y) - Math.hypot(b.x - this.x, b.y - this.y))[0];
      if (node) {
        this.mineAt = { x: node.x, y: node.y };
        this.target = { x: node.x + (this.x < node.x ? -12 : 12), y: node.y + 4 };
        this.state = 'walk';
        return;
      }
    }
    this.mineAt = null;
    const a = Math.random() * Math.PI * 2, r = (20 + Math.random() * 70) * (work === 'wanderer' ? 1.9 : 1);
    this.target = { x: base.x + Math.cos(a) * r, y: base.y + 20 + Math.sin(a) * r * 0.6 };
    this.state = 'walk';
  }

  /** Steps toward a point; true when arrived. Gives up (clears target) when blocked. */
  private walkTo(t: Pt, dt: number) {
    const dx = t.x - this.x, dy = t.y - this.y, d = Math.hypot(dx, dy);
    if (d < 3) return true;
    const speed = PLAYER.speed * 0.55 * stat(this.data, 'speed') * this.pace * (1 - 0.3 * this.weary);
    const nx = this.x + (dx / d) * speed * dt / 1000, ny = this.y + (dy / d) * speed * dt / 1000;
    if (this.scene.isWalkable(nx, ny) && this.scene.surfaceAt(nx, ny) !== 'void') {
      this.x = nx; this.y = ny;
      if (Math.abs(dx) > 1) this.sprite.setFlipX(dx < 0);
    } else if (this.scene.isWalkable(nx, this.y)) this.x = nx;
    else if (this.scene.isWalkable(this.x, ny)) this.y = ny;
    else { this.target = null; this.mineAt = null; }
    return false;
  }

  private pickUp() {
    this.mineAt = null;
    this.carried = this.scene.add.image(this.x, this.y - 22, 'shard').setDepth(6090);
    const r = this.scene.replicatorSpot;
    this.target = { x: r.x + (Math.random() - 0.5) * 20, y: r.y + 14 };
    this.state = 'carry';
  }

  private deliver(time: number) {
    const r = this.scene.replicatorSpot;
    const c = this.carried;
    this.carried = undefined;
    if (c) {
      this.scene.tweens.add({
        targets: c, x: r.x, y: r.y - 12, duration: 300, ease: 'Quad.easeIn',
        onComplete: () => { c.destroy(); this.scene.npcDelivered(this, r.x, r.y - 10); },
      });
    }
    this.state = 'idle';
    this.until = time + 1200;
  }

  /** Go and do something by hand (cut a tree, take a build down). Drops whatever it was doing. */
  startChore(c: Chore) {
    if (this.state === 'born' || this.state === 'below' || this.state === 'blank') return false;
    if (this.job) { this.scene.village.release(this.job); this.job = null; }
    if (this.carried) { this.carried.destroy(); this.carried = undefined; }
    this.mineAt = null;
    this.chore = c;
    this.target = { x: c.x + (this.x < c.x ? -12 : 12), y: c.y + 3 };
    this.state = 'walk';
    return true;
  }

  /** Drops into the hatch: everything on the surface goes until it comes back up. */
  hideBelow() {
    if (this.job) { this.scene.village.release(this.job); this.job = null; }
    if (this.carried) { this.carried.destroy(); this.carried = undefined; }
    this.chore = null; this.mineAt = null; this.target = null; this.descent = null;
    this.bubble?.destroy(); this.bubble = undefined;
    this.sprite.setVisible(false); this.shadow.setVisible(false); this.gear.image.setVisible(false);
    this.light.active = false;
    this.state = 'below';
  }

  /** Climbs out of the hatch. */
  surface(x: number, y: number) {
    this.x = x; this.y = y;
    this.sprite.setVisible(true); this.shadow.setVisible(true); this.gear.image.setVisible(true);
    this.light.active = true;
    this.state = 'idle';
    this.until = this.scene.time.now + 1200;
    this.nextBuild = this.scene.time.now + 3000;
    this.sync();
    this.hop();
  }

  // --- the copy's voice ---

  private bubble?: Phaser.GameObjects.Container;
  private bubbleUntil = 0;

  /** Every copy sounds like itself: a seed from its id. */
  get voiceSeed() {
    let h = 2166136261;
    for (const c of this.data.id) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
    return h;
  }

  /**
   * Say something out loud: the song plays and a bubble floats over the head. Readable only once the player can
   * hear them; before that the words are runes in the copy's trail color. `silent` shows the bubble without the song
   * (the chorus plays its own sound).
   */
  sing(text: string, readable: boolean, opts: { silent?: boolean; harmony?: boolean; notes?: string } = {}) {
    if (this.state === 'below') { this.scene.warren.view?.sing(this, text, readable, opts); return; } // sung down in the warren
    const sc = this.scene;
    const p = sc.player;
    const dp = Math.hypot(p.x - this.x, p.y - this.y);
    const v = this.data.traits.voice;
    const len = opts.silent ? 2 : (dp < 260 ? sound.sing(this.voiceSeed, text, {
      harmony: opts.harmony, pan: Math.max(-0.7, Math.min(0.7, (this.x - p.x) / 200)), notes: opts.notes,
      instrument: v?.instrument as Instrument | undefined, mood: v?.mood as Mood | undefined, tempo: v?.tempo as Tempo | undefined,
    }) : 0);
    if (this.state === 'idle' || this.state === 'walk' || this.state === 'greet') {
      this.state = 'greet';
      this.until = sc.time.now + Math.max(900, len * 1000);
      this.sprite.setFlipX(p.x < this.x);
      this.hop();
    }
    this.bubble?.destroy();
    this.bubble = makeBubble(sc, text, readable, this.trailColor, this.voiceSeed);
    this.bubbleUntil = sc.time.now + MIND.bubbleMs * (readable ? 0.8 + text.length / 90 : 0.7);
    this.sync();
  }

  /** A letter reached this copy: a small glint over its head. */
  receiveLetter() {
    const p = this.scene.player;
    if (Math.hypot(p.x - this.x, p.y - this.y) < 260) sound.letter();
    this.scene.fx.sparks(this.x, this.y - 18, this.trailColor, 6);
  }

  private updateBubble(time: number) {
    if (!this.bubble) return;
    if (time > this.bubbleUntil) {
      const b = this.bubble;
      this.bubble = undefined;
      this.scene.tweens.add({ targets: b, alpha: 0, y: b.y - 4, duration: 400, onComplete: () => b.destroy() });
    }
  }

  sync() {
    const x = Math.round(this.x), y = Math.round(this.y);
    this.sprite.setPosition(x, y + 3 - Math.round(this.z));
    this.sprite.setDepth(100 + y);
    this.shadow.setPosition(x, y + 2);
    this.carried?.setPosition(x, y - 22 + Math.sin(this.scene.time.now / 200));
    this.light.x = x; this.light.y = y - 9;
    this.gear.sync();
    this.bubble?.setPosition(x, y - 24 - Math.round(this.z));
    this.updateBubble(this.scene.time.now);
  }
}

/** A song bubble: readable words in the pixel font, or runes in the singer's color until the replicant can hear. */
export function makeBubble(sc: Phaser.Scene, text: string, readable: boolean, color: number, seed: number) {
  // bubbleScale shrinks the box (padding, width) rather than the font: the 5x7 font drops rows when scaled
  const k = MIND.bubbleScale;
  const items: Phaser.GameObjects.GameObject[] = [];
  let w: number, h: number;
  if (readable) {
    const t = sc.add.bitmapText(0, -3 + Math.round((1 - k) * 4), 'pixel', text.toUpperCase()).setMaxWidth(Math.round(118 * k)).setTint(PALETTE[20]).setOrigin(0.5, 1).setCenterAlign();
    w = t.width + Math.round(8 * k); h = t.height + Math.round(6 * k);
    items.push(t);
  } else {
    const words = text.split(/\s+/).filter(Boolean).length;
    const n = Math.max(2, Math.min(12, words));
    const g = sc.add.graphics();
    g.fillStyle(color, 1);
    let hh = seed;
    for (let i = 0; i < n; i++) {
      hh = (hh * 1103515245 + 12345) >>> 0;
      const rune = RUNES[hh % RUNES.length];
      const ox = -Math.floor((n * 6) / 2) + i * 6;
      rune.forEach((row, ry) => row.split('').forEach((c, rx) => { if (c === '#') g.fillRect(ox + rx, -9 + ry, 1, 1); }));
    }
    w = n * 6 + Math.round(6 * k); h = Math.round(12 * k);
    items.push(g);
  }
  const box = sc.add.rectangle(0, 0, w, h, PALETTE[25], 0.88).setOrigin(0.5, 1).setStrokeStyle(1, color, 0.9);
  const tail = sc.add.rectangle(0, 1, 2, 2, color, 0.9).setOrigin(0.5, 0);
  const bubble = sc.add.container(0, 0, [box, tail, ...items]).setDepth(6200).setAlpha(0);
  sc.tweens.add({ targets: bubble, alpha: 1, duration: 200 });
  return bubble;
}

/** Little 5x5 runes for songs you cannot read yet. */
const RUNES = [
  ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  ['..#..', '.###.', '#.#.#', '..#..', '..#..'],
  ['#####', '....#', '..##.', '.#...', '#####'],
  ['.###.', '#...#', '#...#', '#...#', '.###.'],
  ['#....', '##...', '#.#..', '#..#.', '#...#'],
  ['..#..', '..#..', '#####', '..#..', '..#..'],
  ['#...#', '#...#', '.###.', '..#..', '..#..'],
  ['.#.#.', '#.#.#', '.#.#.', '#.#.#', '.#.#.'],
  ['#####', '#...#', '#...#', '#...#', '#####'],
  ['....#', '...#.', '..#..', '.#...', '#....'],
];
