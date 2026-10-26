import Phaser from 'phaser';
import { sound } from '../../audio/Sound';
import { PALETTE, SUPPLIES } from '../../core/data';
import { session } from '../../core/session';
import type { Npc } from '../../entities/Npc';
import { Cell } from '../../world/planetGen';
import type { PlanetScene } from '../PlanetScene';

const H = SUPPLIES.hands;
const MATERIALS = SUPPLIES.materials as Record<string, { icon: number; color: number }>;
type Tree = PlanetScene['trees'][number];

/**
 * The original's own hands in the village: felling a tree, breaking stone off rock; the load rides above the head
 * and is handed over by walking into a building that waits for it, the hatch or a copy;
 * swings at a building being raised count with the copies' blows. Tunables: src/data/supplies.json hands.
 * Part of PlanetScene (src/scenes/PlanetScene.ts); `s` is the scene.
 */
export class Hands {
  constructor(readonly s: PlanetScene) {}

  /** what rides above the head */
  load: { material: string; n: number } | null = null;
  private stack: Phaser.GameObjects.Image[] = [];
  /** chips on a tree or a rock tile, healed after hitsForgetMs */
  private chips = new Map<string, { hits: number; at: number }>();
  /** rock tiles stone was taken from, and when */
  private rockTaken = new Map<number, number>();
  private needIcons = new Map<Npc, Phaser.GameObjects.Image>();

  /** A new planet (the scene object is reused): nothing carried over. */
  reset() {
    this.load = null;
    this.stack = [];
    this.chips.clear();
    this.rockTaken.clear();
    this.needIcons.clear();
  }

  /** A swing landed at (hx, hy). True when it struck something of the village's (the hit pause sells it). */
  swing(hx: number, hy: number, radius: number): boolean {
    const s = this.s;
    if (s.visit) return false;
    if (s.buildings.playerSwing(hx, hy, radius)) return true;
    for (const t of s.trees) {
      if (!t.alive || Math.hypot(t.x - hx, t.y - 6 - hy) > radius + 6) continue;
      this.chipTree(t);
      return true;
    }
    return this.chipRock(hx, hy);
  }

  private chip(key: string, need: number) {
    const now = this.s.time.now;
    const c = this.chips.get(key);
    const hits = c && now - c.at < H.hitsForgetMs ? c.hits + 1 : 1;
    if (hits >= need) { this.chips.delete(key); return true; }
    this.chips.set(key, { hits, at: now });
    return false;
  }

  private chipTree(t: Tree) {
    const s = this.s;
    s.fx.sparks(t.x + (Math.random() - 0.5) * 6, t.y - 10 - Math.random() * 8, PALETTE[s.planet.accent[1]], 3);
    sound.hit();
    s.tweens.add({ targets: t.sprite, angle: { from: -3, to: 3 }, duration: 60, yoyo: true, repeat: 1 });
    if (!this.chip(`t${t.index}`, H.treeHits)) return;
    this.fell(t, s.player.x);
    s.time.delayedCall(900, () => this.take('wood', SUPPLIES.treeWood, { x: t.x, y: t.y - 6 }));
    s.mindLog.push({ t: s.mindClock, text: `${session.replicant?.name ?? 'the original'} cut down a tree` });
  }

  /** A tree comes down away from `fromX` and is gone for good (planet_states.data.felled). Copies use it too. */
  fell(t: Tree, fromX: number) {
    const s = this.s;
    if (!t.alive) return;
    t.alive = false;
    t.zone.destroy();
    const dir = fromX < t.x ? 1 : -1;
    s.tweens.add({ targets: t.sprite, angle: 84 * dir, duration: 700, ease: 'Quad.easeIn', onComplete: () => {
      s.fx.dust(t.x + dir * 12, t.y, 10);
      if (Math.hypot(s.player.x - t.x, s.player.y - t.y) < 220) sound.stomp();
      s.tweens.add({ targets: t.sprite, alpha: 0, duration: 1200, delay: 600, onComplete: () => t.sprite.destroy() });
    } });
    s.pending.felled = [...new Set([...(session.planet?.data.felled ?? []), ...(s.pending.felled ?? []), t.index])];
  }

  /** Rock under the swing (or just above it: walls are hit from below). */
  private chipRock(hx: number, hy: number) {
    const s = this.s, m = s.map, T = 16;
    for (const y of [hy, hy - 8]) {
      const tx = Math.floor(hx / T), ty = Math.floor(y / T);
      if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h || m.cells[ty * m.w + tx] !== Cell.Rock) continue;
      const i = ty * m.w + tx, at = { x: tx * T + T / 2, y: ty * T + T - 2 };
      s.fx.sparks(at.x + (Math.random() - 0.5) * 10, hy, PALETTE[21], 4);
      sound.hit();
      if (!this.chip(`r${i}`, H.rockHits)) return true;
      if (Date.now() - (this.rockTaken.get(i) ?? -Infinity) < H.rockCooldownMinutes * 60_000) { sound.denied(); return true; }
      this.rockTaken.set(i, Date.now());
      s.fx.dust(at.x, hy + 2, 6);
      this.take('stone', H.rockYield, { x: at.x, y: hy });
      return true;
    }
    return false;
  }

  /** Something won by hand: onto the load if it fits, the rest flies to the store. */
  take(material: string, n: number, from: { x: number; y: number }) {
    const s = this.s;
    const cap = (H.carry as Record<string, number>)[material] ?? 0;
    let keep = 0;
    if (!this.load || this.load.material === material) keep = Math.min(n, cap - (this.load?.n ?? 0));
    if (keep > 0) {
      this.load = { material, n: (this.load?.n ?? 0) + keep };
      const icon = s.add.image(from.x, from.y, 'supplies', MATERIALS[material]?.icon ?? 0).setDepth(6300);
      s.tweens.add({ targets: icon, x: s.player.x, y: s.player.y - 22, duration: 380, ease: 'Quad.easeIn', onComplete: () => { icon.destroy(); this.restack(); } });
      sound.collect();
    }
    if (n - keep > 0) s.flyMaterial(material, from, s.warren.hatch, n - keep);
  }

  /** The load as a small stack above the head: one icon per two units. */
  private restack() {
    for (const i of this.stack) i.destroy();
    this.stack = [];
    if (!this.load) return;
    const icon = MATERIALS[this.load.material]?.icon ?? 0;
    for (let k = 0; k < Math.ceil(this.load.n / 2); k++) this.stack.push(this.s.add.image(0, 0, 'supplies', icon).setDepth(6290));
  }

  /** Every frame: the stack follows the head; walking into a building, a copy or the hatch hands the load over. */
  update(time: number) {
    const s = this.s, p = s.player;
    this.updateNeeds();
    if (!this.load) return;
    const hidden = !p.alive || p.isHidden;
    const bob = Math.round(Math.sin(time / 140) * (p.body.velocity.lengthSq() > 1 ? 1 : 0));
    this.stack.forEach((img, k) => img.setVisible(!hidden).setPosition(p.x + (k % 2 ? 2 : -1), p.y - 22 - k * 3 + bob));
    if (hidden || p.locked) return;
    const r = H.deliverRange, { material } = this.load;
    const b = s.buildings.waitingFor(material).find((x) => Math.abs(p.x - x.x) < x.w * 8 + r && p.y > x.y - x.h * 8 - r && p.y < x.y + r);
    if (b) { this.handOver(b, `${b.name}`); s.buildings.fund(b); return; }
    const npc = s.npcs.find((n) => !n.blank && !n.below && n.state !== 'born' && n.state !== 'talk' && Math.hypot(n.x - p.x, n.y - p.y) < r + 4);
    if (npc) {
      this.handOver(npc, npc.data.name);
      npc.thank();
      npc.needs.company = Math.min(1, npc.needs.company + H.gift.company);
      npc.needs.purpose = Math.min(1, npc.needs.purpose + H.gift.purpose);
      s.nextWake.set(npc, Math.min(s.nextWake.get(npc) ?? Infinity, s.mindClock + 3000));
      return;
    }
    if (Math.hypot(s.warren.hatch.x - p.x, s.warren.hatch.y - p.y) < r + 6) this.handOver(s.warren.hatch, 'the store');
  }

  private handOver(to: { x: number; y: number }, what: string) {
    const s = this.s, load = this.load!;
    this.load = null;
    this.restack();
    s.flyMaterial(load.material, { x: s.player.x, y: s.player.y - 14 }, to, load.n);
    s.mindLog.push({ t: s.mindClock, text: `${session.replicant?.name ?? 'the original'} carried ${load.n} ${load.material} to ${what}` });
  }

  /** Leaving (launch, closing the page): whatever is carried goes into the store, nothing is lost. */
  stow() {
    if (!this.load) return;
    this.s.warren.add(this.load.material, this.load.n);
    this.load = null;
    this.restack();
  }

  /** A copy whose building waits for a material shows it over its head when you come near. */
  private updateNeeds() {
    const s = this.s, p = s.player;
    for (const n of s.npcs) {
      const want = n.blank || n.below || !p.alive || Math.hypot(n.x - p.x, n.y - p.y) > H.needRange ? null : s.buildings.needOf(n.data.id);
      let icon = this.needIcons.get(n);
      if (!want) { if (icon) { icon.destroy(); this.needIcons.delete(n); } continue; }
      if (!icon) {
        icon = s.add.image(n.x, n.y, 'supplies', MATERIALS[want]?.icon ?? 0).setDepth(6210).setAlpha(0);
        s.tweens.add({ targets: icon, alpha: 0.9, duration: 200 });
        this.needIcons.set(n, icon);
      }
      icon.setFrame(MATERIALS[want]?.icon ?? 0).setPosition(n.x + 9, n.y - 26 + Math.round(Math.sin(s.time.now / 300)));
    }
    for (const [n, icon] of this.needIcons) if (!s.npcs.includes(n)) { icon.destroy(); this.needIcons.delete(n); }
  }
}
