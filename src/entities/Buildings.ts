// Surface buildings the copies design (design_building) and raise together. A proposal is placed on clear ground
// around the base and waits for the original's word (journal: approve / veto; after autoApproveMinutes it goes
// ahead anyway). The first copy to join pays its material; every copy that joins adds hammer blows to one shared
// progress, and the building rises row by row (src/world/buildingPaint.ts draws it from its blueprint). Saved in
// planet_states.data.buildings; blueprints share the warren's shape so a building can get an interior later.
import Phaser from 'phaser';
import { sound } from '../audio/Sound';
import { BUILDINGS, PALETTE } from '../core/data';
import { session } from '../core/session';
import type { Light } from '../fx/Lighting';
import type { Building, MindAction } from '../net/store';
import type { PlanetScene } from '../scenes/PlanetScene';
import { paintBuilding, roofHeight } from '../world/buildingPaint';
import type { Npc } from './Npc';

interface Placed { b: Building; sprite: Phaser.GameObjects.Image; light?: Light; glow?: Phaser.GameObjects.Image; solid?: Phaser.GameObjects.Zone; height: number }

export class Buildings {
  list: Building[];
  private placed = new Map<string, Placed>();
  private workers = new Map<string, Set<Npc>>();
  private nextCommunal = 0;

  constructor(private scene: PlanetScene, data: Building[] | undefined) {
    this.list = data ? structuredClone(data) : [];
    for (const b of this.list) if (!b.vetoed) this.place(b, false);
  }

  get swingsFor() { return (b: Building) => b.w * b.h * BUILDINGS.swingsPerTile; }

  private texture(b: Building) {
    const key = `bld:${b.id}`;
    if (this.scene.textures.exists(key)) return key;
    const g = paintBuilding(b);
    const ct = this.scene.textures.createCanvas(key, g.width, g.height)!;
    ct.getContext().putImageData(new ImageData(g.data, g.width, g.height), 0, 0);
    ct.refresh();
    return key;
  }

  /** Puts a blueprint in the world: a ghost footprint while it waits, the building rising as it is worked on. */
  private place(b: Building, animate: boolean) {
    const key = this.texture(b);
    const h = b.h * 12 + roofHeight(b) + 2;
    const sprite = this.scene.add.image(b.x, b.y + 2, key).setOrigin(0.5, 1).setDepth(100 + b.y);
    const p: Placed = { b, sprite, height: h };
    this.placed.set(b.id, p);
    this.refresh(p, animate);
  }

  private refresh(p: Placed, animate: boolean) {
    const { b, sprite } = p;
    const total = this.swingsFor(b);
    const frac = b.built ? 1 : Math.min(1, b.progress / total);
    if (!b.approved && !b.built) {
      // a proposal: faint outline of what is to come
      sprite.setAlpha(0.22).setTintFill(PALETTE[2]).setCrop();
    } else if (!b.built) {
      sprite.setAlpha(1).clearTint();
      const rows = Math.max(2, Math.round(p.height * frac));
      sprite.setCrop(0, p.height - rows, sprite.width, rows);
    } else {
      sprite.setAlpha(1).clearTint().setCrop();
      if (!p.solid) p.solid = this.scene.addSolid(b.x, b.y - b.h * 4, b.w * 16, b.h * 8);
      if (!p.light) {
        const l = b.kind === 'lookout' ? { ...BUILDINGS.light, ...BUILDINGS.communal.lookoutLight } : BUILDINGS.light;
        const dx = b.door === 'west' ? -b.w * 8 + 4 : b.door === 'east' ? b.w * 8 - 4 : 0;
        p.light = this.scene.lighting.add({ x: b.x + dx, y: b.y - 6, radius: l.radius, color: PALETTE[l.color], intensity: animate ? 0 : l.intensity, flicker: l.flicker });
        p.glow = this.scene.add.image(b.x + dx, b.y - 6, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(PALETTE[l.color]).setAlpha(animate ? 0 : 0.14).setScale(0.6).setDepth(6100);
        if (animate) { this.scene.tweens.add({ targets: p.light, intensity: l.intensity, duration: 800 }); this.scene.tweens.add({ targets: p.glow, alpha: 0.14, duration: 800 }); }
      }
      if (animate) { this.scene.fx.dust(b.x - b.w * 6, b.y + 2, 6); this.scene.fx.dust(b.x + b.w * 6, b.y + 2, 6); sound.build(); }
    }
  }

  /** A clear footprint in the ring around the base, away from the base's own things. */
  private findSpot(w: number, h: number): { x: number; y: number } | null {
    const base = this.scene.baseCenter;
    const avoid = [base, this.scene.replicatorSpot, this.scene.vesselPos, this.scene.warren.hatch];
    const pw = w * 16 + 10, ph = h * 8 + 10;
    let best: { x: number; y: number; score: number } | null = null;
    for (let i = 0; i < 80; i++) {
      const a = Math.random() * Math.PI * 2, r = BUILDINGS.ringMin + Math.random() * (BUILDINGS.ringMax - BUILDINGS.ringMin);
      const x = Math.round(base.x + Math.cos(a) * r), y = Math.round(base.y + 10 + Math.sin(a) * r * 0.7);
      if (!this.scene.isClear(x, y, pw, ph)) continue;
      if (avoid.some((p) => Math.hypot(p.x - x, p.y - y) < 44 + w * 6)) continue;
      if (this.scene.nodes.some((n) => n.alive && Math.hypot(n.x - x, n.y - y) < 20 + w * 8)) continue;
      if (this.list.some((o) => !o.vetoed && Math.abs(o.x - x) < (o.w + w) * 8 + 8 && Math.abs(o.y - y) < (o.h + h) * 4 + 12)) continue;
      const near = this.list.filter((o) => !o.vetoed).map((o) => Math.hypot(o.x - x, o.y - y));
      const score = (near.length ? -Math.min(...near) : 0) - r * 0.3 + Math.random() * 10;
      if (!best || score > best.score) best = { x, y, score };
    }
    return best;
  }

  /** design_building: the copy's blueprint, placed; null when nothing fits. */
  propose(npc: Npc, a: MindAction, kind?: string): Building | null {
    const [minW, minH] = BUILDINGS.minFootprint, [maxW, maxH] = BUILDINGS.maxFootprint;
    const w = Math.max(minW, Math.min(maxW, Math.round(Number(a.width) || 3))), h = Math.max(minH, Math.min(maxH, Math.round(Number(a.height) || 2)));
    const material = a.material && a.material in BUILDINGS.materials ? a.material : 'wood';
    const spot = this.findSpot(w, h);
    if (!spot) return null;
    const cost: Record<string, number> = { [material]: Math.ceil(w * h * (BUILDINGS.materials as Record<string, { perTile: number }>)[material].perTile) };
    const b: Building = {
      id: `b${Date.now().toString(36)}${this.list.length}`, name: (a.name ?? 'Shelter').replace(/[^A-Za-z' -]/g, '').trim().slice(0, 18) || 'Shelter',
      purpose: (a.purpose ?? '').slice(0, 140), w, h, x: spot.x, y: spot.y, by: npc.data.id,
      material, roof: BUILDINGS.roofs.includes(a.roof ?? '') ? a.roof! : 'peaked', door: BUILDINGS.doors.includes(a.door ?? '') ? a.door! : 'south',
      primary: a.primary ?? 'silver', secondary: a.secondary ?? 'slate',
      approved: !!kind, progress: 0, built: false, helpers: [], cost, paid: false, at: Date.now(), ...(kind ? { kind } : {}),
    };
    this.list.push(b);
    this.place(b, false);
    this.save();
    if (kind) {
      this.scene.mindLog.push({ t: this.scene.mindClock, text: `the store was full, so the copies began raising a ${b.name} for everyone (${Object.entries(cost).map(([m, n]) => `${n} ${m}`).join(', ')}): ${b.purpose}` });
      if (this.scene.canHear()) this.scene.game.events.emit('notice', `THE COPIES BEGIN A ${b.name.toUpperCase()}`);
      return b;
    }
    this.scene.mindLog.push({ t: this.scene.mindClock, text: `${npc.data.name} proposed a building: ${b.name} (${w}x${h} ${material}, ${b.roof} roof), waiting for the original's word` });
    if (this.scene.canHear()) this.scene.game.events.emit('notice', `${npc.data.name.toUpperCase()} PROPOSES ${b.name.toUpperCase()}`);
    return b;
  }

  /** The original's word. */
  approve(id: string) {
    const b = this.list.find((x) => x.id === id);
    if (!b || b.approved) return;
    b.approved = true;
    const p = this.placed.get(id);
    if (p) this.refresh(p, false);
    this.save();
    this.scene.mindLog.push({ t: this.scene.mindClock, text: `${session.replicant?.name ?? 'the original'} approved ${b.name}` });
  }

  veto(id: string) {
    const b = this.list.find((x) => x.id === id);
    if (!b || b.built) return;
    b.vetoed = true;
    const p = this.placed.get(id);
    if (p) { p.sprite.destroy(); p.light && this.scene.lighting.remove(p.light); p.glow?.destroy(); p.solid?.destroy(); this.placed.delete(id); }
    this.save();
    this.scene.mindLog.push({ t: this.scene.mindClock, text: `${session.replicant?.name ?? 'the original'} vetoed ${b.name}` });
  }

  /** A built shared building of this kind (hall, workshop, lookout). */
  has(kind: string) { return this.list.some((b) => b.kind === kind && b.built && !b.vetoed); }

  /** Where lonely copies gather: in front of the Meeting Hall's door. */
  gatheringSpot(): { x: number; y: number } | null {
    const b = this.list.find((x) => x.kind === 'hall' && x.built && !x.vetoed);
    if (!b) return null;
    const dx = b.door === 'west' ? -b.w * 8 - 8 : b.door === 'east' ? b.w * 8 + 8 : 0;
    return { x: b.x + dx, y: b.y + 4 };
  }

  /**
   * A full store wants spending: when a material is near capacity and no shared building is underway, the copies
   * start the next one of the communal list on their own (approved: the original said yes to all they want).
   */
  maybeCommunal(npc: Npc | undefined, force = false) {
    const now = this.scene.warren.clock;
    if (!npc || (!force && now < this.nextCommunal)) return null;
    this.nextCommunal = now + BUILDINGS.communal.checkMs;
    if (this.list.some((b) => b.kind && !b.built && !b.vetoed)) return null;
    const cap = this.scene.warren.cap;
    for (const t of BUILDINGS.communal.kinds) {
      if (this.list.some((b) => b.kind === t.kind && !b.vetoed)) continue;
      const have = Math.floor(this.scene.supplies[t.material] ?? 0);
      const cost = Math.ceil(t.w * t.h * (BUILDINGS.materials as Record<string, { perTile: number }>)[t.material].perTile);
      if (have < cost || have < cap * BUILDINGS.communal.whenFull) continue;
      const b = this.propose(npc, { type: 'building', name: t.name, purpose: t.purpose, width: t.w, height: t.h, material: t.material, roof: t.roof, door: t.door, primary: t.primary, secondary: t.secondary }, t.kind);
      if (b) return b;
    }
    return null;
  }

  /** Something to raise: an approved building that is not built, its material paid (or payable now). */
  pickJob(npc: Npc): Building | null {
    this.maybeCommunal(npc);
    const now = Date.now();
    for (const b of this.list) {
      if (b.vetoed || b.built) continue;
      if (!b.approved && now - b.at > BUILDINGS.autoApproveMinutes * 60_000) { b.approved = true; const p = this.placed.get(b.id); if (p) this.refresh(p, false); this.save(); }
      if (!b.approved) continue;
      if (!b.paid) {
        const short = this.scene.warren.shortage(b.cost);
        if (short) continue;
        this.scene.warren.pay(b.cost);
        b.paid = true;
        this.save();
      }
      if ((this.workers.get(b.id)?.size ?? 0) >= 3) continue;
      return b;
    }
    return null;
  }

  /** What waits on what, for the minds. */
  shortages(): string[] {
    return this.list.filter((b) => !b.vetoed && !b.built && b.approved && !b.paid)
      .map((b) => `${b.name} waits for ${this.scene.warren.shortage(b.cost)}`);
  }

  /** The copy walks to the footprint and hammers; every blow is shared progress. */
  work(npc: Npc, b: Building) {
    const total = this.swingsFor(b);
    const side = npc.x < b.x ? -1 : 1;
    const set = this.workers.get(b.id) ?? new Set<Npc>();
    set.add(npc); this.workers.set(b.id, set);
    if (!b.helpers.includes(npc.data.id)) b.helpers.push(npc.data.id);
    return npc.startChore({
      x: b.x + side * (b.w * 8 + 6), y: b.y + 6, swings: Math.max(1, Math.min(14, total - b.progress)),
      swing: () => {
        if (b.built) return;
        b.progress++;
        const p = this.placed.get(b.id);
        if (p) this.refresh(p, false);
        this.scene.fx.sparks(b.x + (Math.random() - 0.5) * b.w * 12, b.y - 4 - Math.random() * 10, PALETTE[10], 3);
        if (Math.hypot(this.scene.player.x - b.x, this.scene.player.y - b.y) < 180) sound.hit();
        if (b.progress >= total) this.complete(b, npc);
      },
      done: () => { set.delete(npc); this.save(); },
    });
  }

  private complete(b: Building, npc: Npc) {
    b.built = true;
    const p = this.placed.get(b.id);
    if (p) this.refresh(p, true);
    this.save();
    const helpers = b.helpers.map((id) => this.scene.npcs.find((n) => n.data.id === id)?.data.name ?? 'someone');
    this.scene.mindLog.push({ t: this.scene.mindClock, text: `${b.name} is built (${helpers.join(', ')})` });
    if (this.scene.canHear()) this.scene.game.events.emit('notice', `${b.name.toUpperCase()} IS BUILT`);
    for (const n of this.scene.npcs) if (b.helpers.includes(n.data.id)) n.onWorked(n === npc);
  }

  /** Progress won while nobody was here: the copies kept hammering. */
  applyOffline(hours: number) {
    // a full store while nobody was here: they started the next shared building (and pay it at the first swing)
    if (hours > 0.1) { this.maybeCommunal(this.scene.npcs.find((n) => !n.blank), true); this.pickPayable(); }
    const swings = hours * BUILDINGS.offlineSwingsPerCopyHour * this.scene.npcs.length;
    if (swings < 1) return;
    let left = swings;
    for (const b of this.list) {
      if (b.vetoed || b.built || !b.approved || !b.paid || left <= 0) continue;
      const total = this.swingsFor(b);
      const add = Math.min(left, total - b.progress);
      b.progress += add; left -= add;
      if (b.progress >= total) { b.built = true; }
      const p = this.placed.get(b.id);
      if (p) this.refresh(p, false);
    }
    this.save();
  }

  /** Pays every approved, unpaid building the supplies cover (offline: nobody walks over to start it). */
  private pickPayable() {
    for (const b of this.list) {
      if (b.vetoed || b.built || !b.approved || b.paid || this.scene.warren.shortage(b.cost)) continue;
      this.scene.warren.pay(b.cost);
      b.paid = true;
    }
  }

  /** The buildings in words, for the minds and the journal. */
  describe(nameOf: (id: string) => string): string[] {
    return this.list.filter((b) => !b.vetoed).map((b) => {
      const total = this.swingsFor(b);
      const state = b.built ? 'built' : !b.approved ? "waiting for the original's word" : !b.paid ? `waits for ${this.scene.warren.shortage(b.cost)}` : `being raised, ${Math.round((b.progress / total) * 100)}% (${b.helpers.map(nameOf).join(', ') || 'nobody yet'})`;
      return `- ${b.name} (${b.w}x${b.h} ${b.material}, ${b.roof} roof, door ${b.door}, ${nameOf(b.by)}'s design): ${state}${b.purpose ? ` "${b.purpose}"` : ''}`;
    });
  }

  save() {
    this.scene.pending.buildings = structuredClone(this.list);
    void this.scene.flushPlanet();
  }
}
