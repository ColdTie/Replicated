// Surface buildings the copies design (design_building) and print together (since 2026-10-26 every building is
// printed: a 3D printer stands beside it while it is made, src/entities/Printer.ts, and lays a layer with each blow;
// since 2026-10-27, on a world whose Cem bed is awake, the Cems print a copy's blueprint too once it is paid, and the
// copies tend the bed instead of swinging: one building system);
// and the designs the original picks at the Printworks (src/data/designs.json, 2026-10-27), which the Cems build on
// their own: paid at once, shipped by the ants from the store and the bed (src/entities/Bioworks.ts), rising voxel row
// by voxel row with the clock (also while nobody plays), the newest rows still living Cems. A proposal is placed on a free civic lot
// of the town (src/world/town.ts; else a home lot nobody lives on) and waits for the original's word (journal: approve / veto; after autoApproveMinutes it goes
// ahead anyway). The first copy to join pays its material; every copy that joins adds hammer blows to one shared
// progress, and the building rises row by row (src/world/buildingPaint.ts draws it from its blueprint). Saved in
// planet_states.data.buildings; blueprints share the warren's shape so a building can get an interior later.
import Phaser from 'phaser';
import { sound } from '../audio/Sound';
import { BUILDINGS, PALETTE, SUPPLIES } from '../core/data';
import { blueprintModel, CAT, designModel, designNeeds, designOpen, designPrintMs, paintTexture, worldView } from '../core/designs';
import BIO from '../data/bioworks.json';
import { session } from '../core/session';
import type { Light } from '../fx/Lighting';
import type { Building, MindAction } from '../net/store';
import type { PlanetScene } from '../scenes/PlanetScene';
import { paintBuilding, roofHeight } from '../world/buildingPaint';
import { buildingSpot, lotForBuilding, type Lot } from '../world/town';
import { footprintDepthPx, type Model } from '../world/voxel';
import type { Npc } from './Npc';
import { Printer } from './Printer';

interface Placed {
  b: Building; sprite: Phaser.GameObjects.Image; light?: Light; glow?: Phaser.GameObjects.Image; solid?: Phaser.GameObjects.Zone; height: number; printedRows?: number;
  /** a Cem print: its model, how many voxels the drawing shows, when it was last drawn, its lit windows */
  cem?: { m: Model; cut: number; drawnAt: number; lights: Light[]; glows: Phaser.GameObjects.Image[] };
}
const CARGO_COLORS: Record<string, number> = { salt: 19, iron: 20, quartz: 28, copper: 9, ember: 10, wood: 4, stone: 21, scrap: 22 };

export class Buildings {
  list: Building[];
  private placed = new Map<string, Placed>();
  private workers = new Map<string, Set<Npc>>();
  /** the printer beside each building being made (approved, not yet built) */
  readonly printers = new Map<string, Printer>();
  private nextCommunal = 0;
  private nextTakeOver = 0;

  constructor(private scene: PlanetScene, data: Building[] | undefined) {
    this.list = data ? structuredClone(data) : [];
    // a print whose time ran out while nobody was here stands finished
    let done = false;
    for (const b of this.list) if (this.printed(b) && !b.built && !b.vetoed && this.fraction(b) >= 1) { b.built = true; b.progress = 1; done = true; }
    for (const b of this.list) if (!b.vetoed) this.place(b, false);
    // written with the planet's next flush
    if (done && !scene.visit) scene.pending.buildings = structuredClone(this.list);
  }

  /** Printed by the Cems (a design, or a copy's blueprint they took over): it rises with the clock. */
  printed(b: Building) { return !!(b.design || b.cems); }
  /** The voxel model the Cems print: the design's, or one made from the copy's blueprint. */
  modelOf(b: Building): Model | undefined { return b.design ? designModel(b.design) : b.cems ? blueprintModel(b) : undefined; }

  /** How far along a building is, 0..1: a Cem print by the clock, the others by their blows. */
  fraction(b: Building) {
    if (b.built) return 1;
    if (this.printed(b)) return Math.max(0, Math.min(1, (Date.now() - (b.printStart ?? Date.now())) / Math.max(1, b.printMs ?? 1)));
    return Math.min(1, b.progress / this.swingsFor(b));
  }

  get swingsFor() { return (b: Building) => b.w * b.h * BUILDINGS.swingsPerTile; }

  private texture(b: Building) {
    const key = `bld:${b.id}`;
    if (this.printed(b)) {
      const m = this.modelOf(b);
      if (m) return paintTexture(this.scene, key, worldView(m, b.built ? undefined : Math.floor(m.volume * this.fraction(b)), b.built ? 0 : BIO.alive * m.w));
    }
    if (this.scene.textures.exists(key)) return key;
    const g = paintBuilding(b);
    const ct = this.scene.textures.createCanvas(key, g.width, g.height)!;
    ct.getContext().putImageData(new ImageData(g.data, g.width, g.height), 0, 0);
    ct.refresh();
    return key;
  }

  /** Puts a blueprint in the world: a ghost footprint while it waits, the building rising as it is worked on. */
  private place(b: Building, animate: boolean) {
    const m = this.modelOf(b);
    if (m) { this.placeCem(b, m, animate); return; }
    const key = this.texture(b);
    const h = b.h * 12 + roofHeight(b) + 2;
    const sprite = this.scene.add.image(b.x, b.y + 2, key).setOrigin(0.5, 1).setDepth(100 + b.y);
    const p: Placed = { b, sprite, height: h };
    this.placed.set(b.id, p);
    this.refresh(p, animate);
    this.printerFor(b);
  }

  /** A printer beside an approved building that is not built yet (Thales' founded work keeps its own after). */
  private printerFor(b: Building) {
    if (b.vetoed || this.printers.has(b.id) || (b.built && b.by !== 'thales') || (!b.approved && !b.built)) return;
    if (b.built && !this.scene.homeworld.here) return;
    this.printers.set(b.id, new Printer(this.scene, b));
  }

  update(time: number, dt: number) {
    for (const p of this.printers.values()) p.update(time, dt);
    if (time > this.nextTakeOver) { this.nextTakeOver = time + 1500; this.cemsTakeOver(); }
    // the Cems' prints rise with the clock: redraw a print when a few more voxels are laid
    for (const p of this.placed.values()) {
      const c = p.cem;
      if (!c || p.b.built || time < c.drawnAt + 180) continue;
      const cut = Math.floor(c.m.volume * this.fraction(p.b));
      if (cut >= c.m.volume) { this.complete(p.b); continue; }
      if (cut - c.cut < Math.max(2, c.m.w / 2)) continue;
      const row = Math.floor(cut / c.m.w) !== Math.floor(c.cut / c.m.w);
      c.cut = cut; c.drawnAt = time;
      this.drawCem(p);
      if (row) {
        this.printers.get(p.b.id)?.pulse();
        // a few of the newest Cems shine as they settle
        const v = c.m.order[Math.max(0, cut - 1)], img = this.lastDraw.get(p.b.id);
        if (img) {
          const q = img.toImage((v % c.m.w) + 0.5, Math.floor(v / c.m.w) % c.m.d, Math.floor(v / (c.m.w * c.m.d)) + 1);
          this.scene.fx.sparks(p.sprite.x - p.sprite.displayOriginX + q.x, p.sprite.y - p.sprite.displayOriginY + q.y, PALETTE[12], 2);
        }
      }
    }
  }

  private lastDraw = new Map<string, ReturnType<typeof worldView>>();

  /** A Cem print or a finished design: its drawing, anchored by the middle of its front at its foot. */
  private placeCem(b: Building, m: Model, animate: boolean) {
    const s = this.scene;
    const cut = b.built ? m.volume : Math.floor(m.volume * this.fraction(b));
    const r = worldView(m, b.built ? undefined : cut, b.built ? 0 : BIO.alive * m.w);
    this.lastDraw.set(b.id, r);
    const key = paintTexture(s, `bld:${b.id}`, r);
    const foot = r.toImage(m.w / 2, 0, 0);
    const sprite = s.add.image(b.x, b.y + 2, key).setOrigin(foot.x / r.width, foot.y / r.height).setDepth(100 + b.y);
    const p: Placed = { b, sprite, height: r.height, cem: { m, cut, drawnAt: 0, lights: [], glows: [] } };
    this.placed.set(b.id, p);
    if (!b.built) {
      if (!this.printers.has(b.id)) this.printers.set(b.id, new Printer(s, b, true));
      const cargo = Object.keys(b.cost).map((k) => PALETTE[CARGO_COLORS[k] ?? 20]);
      s.bioworks?.startFlow(b.id, { x: b.x, y: b.y + 4 }, cargo, Date.now() - (b.printStart ?? 0) < 3000);
    } else this.finishCem(p, animate);
  }

  /** Redraws a print at its current cut. */
  private drawCem(p: Placed) {
    const c = p.cem!;
    const r = worldView(c.m, p.b.built ? undefined : c.cut, p.b.built ? 0 : BIO.alive * c.m.w);
    this.lastDraw.set(p.b.id, r);
    paintTexture(this.scene, `bld:${p.b.id}`, r);
    p.sprite.setTexture(`bld:${p.b.id}`);
  }

  /** A finished design: solid, its windows lit (a light where its glowing voxels show), the ground under it walkable around. */
  private finishCem(p: Placed, animate: boolean) {
    const s = this.scene, c = p.cem!, b = p.b;
    if (c.cut < c.m.volume) { c.cut = c.m.volume; this.drawCem(p); }
    const depth = footprintDepthPx(c.m, CAT.view.pitch, CAT.view.ppv);
    if (!p.solid) p.solid = s.addSolid(b.x, b.y - depth / 2, c.m.w * CAT.view.ppv * 0.9, Math.max(8, depth * 0.85));
    const r = this.lastDraw.get(b.id);
    if (r && !c.lights.length && r.lit.length) {
      // the lit pixels in up to three groups, left to right
      const groups = [0, 1, 2].map((k) => r.lit.filter((q) => Math.floor((q.x / r.width) * 3) === k)).filter((g) => g.length > 2);
      for (const g of groups) {
        const x = g.reduce((a, q) => a + q.x, 0) / g.length, y = g.reduce((a, q) => a + q.y, 0) / g.length;
        const wx = p.sprite.x - p.sprite.displayOriginX + x, wy = p.sprite.y - p.sprite.displayOriginY + y;
        const l = s.lighting.add({ x: wx, y: wy, radius: 20 + Math.min(30, g.length / 2), color: PALETTE[10], intensity: animate ? 0 : 0.6, flicker: 0.08 });
        const glow = s.add.image(wx, wy, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(PALETTE[10]).setAlpha(animate ? 0 : 0.12).setScale(0.4).setDepth(6100);
        if (animate) { s.tweens.add({ targets: l, intensity: 0.6, duration: 900 }); s.tweens.add({ targets: glow, alpha: 0.12, duration: 900 }); }
        c.lights.push(l); c.glows.push(glow);
      }
    }
    if (animate) { s.fx.dust(b.x - c.m.w * 2, b.y + 2, 6); s.fx.dust(b.x + c.m.w * 2, b.y + 2, 6); s.fx.sparks(b.x, b.y - 10, PALETTE[12], 12); sound.cemDone({ x: b.x, y: b.y }); }
  }

  /**
   * One building system: where the Cems are awake, a copy's approved blueprint is theirs to print once it is paid
   * (its material in the store). Whatever the copies had raised by hand is kept: the print goes on from there.
   */
  cemsTakeOver() {
    if (!this.scene.bioworks?.awake || this.scene.visit) return;
    for (const b of this.list) {
      if (b.vetoed || b.built || this.printed(b) || !b.approved || !b.paid || b.by === 'thales') continue;
      const old = this.placed.get(b.id);
      if (old) { old.sprite.destroy(); if (old.light) this.scene.lighting.remove(old.light); old.glow?.destroy(); old.solid?.destroy(); this.placed.delete(b.id); }
      this.printers.get(b.id)?.fold(); this.printers.delete(b.id);
      this.workers.delete(b.id);
      b.cems = true;
      const m = blueprintModel(b);
      b.printMs = Math.round(designPrintMs(m, this.builtOf('nursery')) * (this.scene.bioworks?.speed ?? 1));
      b.printStart = Date.now() - Math.min(0.95, b.progress / this.swingsFor(b)) * b.printMs;
      this.place(b, false);
      this.save();
      this.scene.mindLog.push({ t: this.scene.mindClock, text: `the Cems took up ${b.name} (${this.scene.npcs.find((n) => n.data.id === b.by)?.data.name ?? 'a copy'}'s design) and print it now; the copies tend their bed` });
    }
  }

  // ------------------------------------------------------------ the designs (the original's choice, built by the Cems)

  /** Designs standing finished on this world (id -> how many). */
  designsBuilt() {
    const out = new Map<string, number>();
    for (const b of this.list) if (b.design && b.built && !b.vetoed) out.set(b.design, (out.get(b.design) ?? 0) + 1);
    return out;
  }
  private builtOf(id: string) { return this.designsBuilt().get(id) ?? 0; }
  /** Every House lifts every Vessel's mood a little (designs.json gives). */
  get homeMood() { return Math.min(CAT.gives.houseMoodMax, this.builtOf('house') * CAT.gives.houseMood); }
  /** Every Storehouse holds more of each material. */
  get storeBonus() { return this.builtOf('storehouse') * CAT.gives.storehouseCap; }
  /** Cem prints under way. */
  get printing() { return this.list.filter((b) => b.design && !b.built && !b.vetoed); }
  /** How long a design takes to print here now (ms): every Nursery makes the Cems quicker, and so does the strain. */
  printMsFor(id: string) { const m = designModel(id); return m ? Math.round(designPrintMs(m, this.builtOf('nursery')) * (this.scene.bioworks?.speed ?? 1)) : 0; }

  /** The lot a new print goes on: the free one nearest the square (-1: none). */
  private printLot(): number {
    const s = this.scene, town = s.map.town, st = s.townState;
    const used = new Set([...Object.values(st.lots), ...Object.values(st.civic)]);
    const sq = town.square, cx = (sq.x + sq.w / 2) * 16, cy = (sq.y + sq.h / 2) * 16;
    const mid = (l: Lot) => ({ x: (l.rect.x + l.rect.w / 2) * 16, y: (l.rect.y + l.rect.h / 2) * 16 });
    const free = town.lots.filter((l) => !used.has(l.index)).sort((a, b) => Math.hypot(mid(a).x - cx, mid(a).y - cy) - Math.hypot(mid(b).x - cx, mid(b).y - cy));
    return free[0]?.index ?? -1;
  }

  /** A street lamp spot nobody has used (a lamp a copy raised, or another design standing there), nearest the square. */
  private freePost(): { x: number; y: number } | null {
    const s = this.scene, town = s.map.town, sq = town.square, cx = (sq.x + sq.w / 2) * 16, cy = (sq.y + sq.h / 2) * 16;
    const taken = [...(s.village?.structures ?? []), ...this.list.filter((b) => !b.vetoed)].map((q) => ({ x: q.x, y: q.y }));
    return town.posts.filter((p) => taken.every((q) => Math.hypot(q.x - p.x, q.y - p.y) > 10) && s.isWalkable(p.x, p.y))
      .sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))[0] ?? null;
  }

  /** Why a design cannot be printed right now (words for the menu), or null when it can. */
  whyNot(id: string): string | null {
    const m = designModel(id);
    if (!m) return 'UNKNOWN DESIGN';
    const built = new Set(this.designsBuilt().keys());
    if (!designOpen(id, built)) return `NEEDS ${designNeeds(id, built).join(' AND ')}`;
    if (!this.scene.bioworks?.awake) return 'THE CEMS ARE ASLEEP';
    if (this.printing.length >= BIO.maxPrints) return 'THE CEMS ARE BUSY';
    if (m.def.place === 'post' ? !this.freePost() : this.printLot() < 0) return 'NO ROOM IN THE TOWN';
    const short = Object.entries(m.cost).find(([k, n]) => (k === 'ember' ? this.scene.embers : Math.floor(this.scene.supplies[k] ?? 0)) < n);
    if (short) return `NEED MORE ${short[0].toUpperCase()}`;
    return null;
  }

  /** The original picks a design: paid at once, placed on the lot nearest the square, the ants start carrying. */
  print(id: string): Building | null {
    const m = designModel(id), s = this.scene, me = session.replicant;
    if (!m || this.whyNot(id)) return null;
    const post = m.def.place === 'post';
    const lotIndex = post ? -1 : this.printLot();
    const spot = post ? this.freePost()! : buildingSpot(s.map.town.lots[lotIndex]);
    s.warren.pay(m.cost);
    const depth = footprintDepthPx(m, CAT.view.pitch, CAT.view.ppv);
    const b: Building = {
      id: `d${Date.now().toString(36)}${this.list.length}`, name: m.def.name, purpose: m.def.about, w: Math.ceil(m.w / 4), h: Math.max(1, Math.round(depth / 8)),
      x: spot.x, y: spot.y, by: me?.id ?? '', material: 'lignin', roof: 'flat', door: 'south', primary: 'umber', secondary: 'moss',
      approved: true, progress: 0, built: false, helpers: me ? [me.id] : [], cost: { ...m.cost }, paid: true, at: Date.now(),
      design: id, printStart: Date.now(), printMs: this.printMsFor(id),
    };
    this.list.push(b);
    if (lotIndex >= 0) { s.townState.civic[b.id] = lotIndex; s.markTown(); }
    this.place(b, false);
    this.save();
    s.mindLog.push({ t: s.mindClock, text: `${me?.name ?? 'the original'} chose a design for the Cems: a ${b.name} (${m.tier.toLowerCase()}, ${Object.entries(m.cost).map(([k, n]) => `${n} ${k}`).join(', ')}); the ants carry its supplies and the Cems build it` });
    return b;
  }

  /** A design standing finished at once, free (screenshots and playtests stage the later designs with it). */
  standNow(id: string): Building | null {
    const m = designModel(id), s = this.scene;
    const lotIndex = this.printLot();
    if (!m || lotIndex < 0) return null;
    const spot = buildingSpot(s.map.town.lots[lotIndex]);
    const depth = footprintDepthPx(m, CAT.view.pitch, CAT.view.ppv);
    const b: Building = {
      id: `d${Date.now().toString(36)}${this.list.length}`, name: m.def.name, purpose: m.def.about, w: Math.ceil(m.w / 4), h: Math.max(1, Math.round(depth / 8)),
      x: spot.x, y: spot.y, by: session.replicant?.id ?? '', material: 'lignin', roof: 'flat', door: 'south', primary: 'umber', secondary: 'moss',
      approved: true, progress: 1, built: true, helpers: [], cost: {}, paid: true, at: Date.now(), design: id, printStart: Date.now(), printMs: 1,
    };
    this.list.push(b);
    s.townState.civic[b.id] = lotIndex; s.markTown();
    this.place(b, false);
    this.save();
    return b;
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
      if (!animate && p.printedRows !== undefined && rows > p.printedRows) this.layer(p, rows);
      p.printedRows = rows;
      this.printers.get(b.id)?.pulse();
      this.scene.events.emit('building-blow', b);
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
      if (animate) { this.scene.fx.dust(b.x - b.w * 6, b.y + 2, 6); this.scene.fx.dust(b.x + b.w * 6, b.y + 2, 6); sound.build({ x: b.x, y: b.y }); }
    }
  }

  /** A fresh layer: a bright line where the print reached, cooling from white through the printer's warm light. */
  private layer(p: Placed, rows: number) {
    const s = this.scene, y = p.b.y + 2 - rows, w = p.b.w * 16;
    const line = s.add.rectangle(p.b.x, y, w, 1, 0xffffff).setBlendMode(Phaser.BlendModes.ADD).setDepth(6100).setAlpha(0.9);
    s.tweens.add({ targets: line, alpha: 0, duration: 700, onUpdate: (tw) => line.setFillStyle(tw.progress < 0.3 ? 0xffffff : PALETTE[11]), onComplete: () => line.destroy() });
  }

  /** A free lot for a building: a civic lot of the town, else a home lot nobody lives on (-1: the town is full). */
  private findLot() {
    return lotForBuilding(this.scene.map.town, this.scene.townState);
  }

  /** design_building: the copy's blueprint, placed; null when nothing fits. */
  propose(npc: Npc, a: MindAction, kind?: string): Building | null {
    const [minW, minH] = BUILDINGS.minFootprint, [maxW, maxH] = BUILDINGS.maxFootprint;
    const w = Math.max(minW, Math.min(maxW, Math.round(Number(a.width) || 3))), h = Math.max(minH, Math.min(maxH, Math.round(Number(a.height) || 2)));
    const material = a.material && a.material in BUILDINGS.materials ? a.material : 'wood';
    const lotIndex = this.findLot();
    if (lotIndex < 0) return null;
    const spot = buildingSpot(this.scene.map.town.lots[lotIndex]);
    const cost: Record<string, number> = { [material]: Math.ceil(w * h * (BUILDINGS.materials as Record<string, { perTile: number }>)[material].perTile) };
    const b: Building = {
      id: `b${Date.now().toString(36)}${this.list.length}`, name: (a.name ?? 'Shelter').replace(/[^A-Za-z' -]/g, '').trim().slice(0, 18) || 'Shelter',
      purpose: (a.purpose ?? '').slice(0, 140), w, h, x: spot.x, y: spot.y, by: npc.data.id,
      material, roof: BUILDINGS.roofs.includes(a.roof ?? '') ? a.roof! : 'peaked', door: BUILDINGS.doors.includes(a.door ?? '') ? a.door! : 'south',
      primary: a.primary ?? 'silver', secondary: a.secondary ?? 'slate',
      approved: !!kind, progress: 0, built: false, helpers: [], cost, paid: false, at: Date.now(), ...(kind ? { kind } : {}),
    };
    this.list.push(b);
    this.scene.townState.civic[b.id] = lotIndex;
    this.scene.markTown();
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
    this.printerFor(b);
    this.save();
    this.scene.mindLog.push({ t: this.scene.mindClock, text: `${session.replicant?.name ?? 'the original'} approved ${b.name}` });
  }

  veto(id: string) {
    const b = this.list.find((x) => x.id === id);
    if (!b || b.built) return;
    b.vetoed = true;
    // its lot is free again
    delete this.scene.townState.civic[b.id];
    this.scene.markTown();
    const p = this.placed.get(id);
    if (p) { p.sprite.destroy(); p.light && this.scene.lighting.remove(p.light); p.glow?.destroy(); p.solid?.destroy(); this.placed.delete(id); }
    this.printers.get(id)?.fold(); this.printers.delete(id);
    this.save();
    this.scene.mindLog.push({ t: this.scene.mindClock, text: `${session.replicant?.name ?? 'the original'} vetoed ${b.name}` });
  }

  /** Finished at once, quietly (screenshots and playtests stage a world with it). */
  finishNow(id: string) {
    const b = this.list.find((x) => x.id === id);
    if (!b || b.built) return;
    b.built = true;
    b.progress = this.printed(b) ? 1 : this.swingsFor(b);
    const p = this.placed.get(id);
    if (p?.cem) this.finishCem(p, false); else if (p) this.refresh(p, false);
    const pr = this.printers.get(id);
    if (pr) { pr.finish(); if (b.by !== 'thales') { pr.fold(); this.printers.delete(id); } }
    this.scene.bioworks?.stopFlow(id);
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
    // a print under way: the copies tend the Cems' bed for it (up to tend.perPrint at a time)
    if (this.scene.bioworks?.awake) {
      const tend = this.printing.concat(this.list.filter((b) => b.cems && !b.built && !b.vetoed))
        .find((b) => (this.workers.get(b.id)?.size ?? 0) < BIO.tend.perPrint);
      if (tend) return tend;
    }
    for (const b of this.list) {
      if (b.vetoed || b.built || this.printed(b)) continue;
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

  /** The copy walks to the footprint and hammers; every blow is shared progress. (A Cem print: it tends their bed.) */
  work(npc: Npc, b: Building) {
    if (this.printed(b)) return this.tend(npc, b);
    const total = this.swingsFor(b);
    const side = npc.x < b.x ? -1 : 1;
    const set = this.workers.get(b.id) ?? new Set<Npc>();
    set.add(npc); this.workers.set(b.id, set);
    if (!b.helpers.includes(npc.data.id)) b.helpers.push(npc.data.id);
    const pr = this.printers.get(b.id);
    return npc.startChore({
      x: pr ? pr.x + (npc.x < pr.x ? -12 : 12) : b.x + side * (b.w * 8 + 6), y: pr ? pr.y + 4 : b.y + 6, swings: Math.max(1, Math.min(14, total - b.progress)),
      swing: () => {
        // (the Cems may have taken it up since this copy set out)
        if (b.built || this.printed(b)) return;
        b.progress++;
        const p = this.placed.get(b.id);
        if (p) this.refresh(p, false);
        this.scene.fx.sparks(b.x + (Math.random() - 0.5) * b.w * 12, b.y - 4 - Math.random() * 10, PALETTE[10], 3);
        sound.hit(false, { x: b.x, y: b.y });
        if (b.progress >= total) this.complete(b, npc);
      },
      done: () => { set.delete(npc); this.save(); },
    });
  }

  /**
   * Tending the Cems' bed for a print: the copy kneels at the salt's rim and works it; every stroke (bioworks.json
   * tend.ms) brings the print that much nearer, and the Cems near its hands brighten.
   */
  private tend(npc: Npc, b: Building) {
    const bw = this.scene.bioworks;
    const spot = bw?.tendSpot(npc.x, npc.y);
    if (!bw || !spot) return false;
    const set = this.workers.get(b.id) ?? new Set<Npc>();
    set.add(npc); this.workers.set(b.id, set);
    if (!b.helpers.includes(npc.data.id)) b.helpers.push(npc.data.id);
    return npc.startChore({
      x: spot.x, y: spot.y, swings: BIO.tend.strokes,
      swing: () => {
        if (b.built) return;
        b.printStart = (b.printStart ?? Date.now()) - BIO.tend.ms;
        bw.tended(spot.x, spot.y);
      },
      done: () => { set.delete(npc); this.save(); },
    });
  }

  /** Approved buildings not yet paid for whose cost includes this material: where a carried load is wanted. */
  waitingFor(material: string) {
    return this.list.filter((b) => !b.vetoed && !b.built && b.approved && !b.paid && material in b.cost);
  }

  /** The approved building waiting for this material whose walls or printer you stand at, if any. */
  feedAt(x: number, y: number, r: number, material: string): Building | undefined {
    return this.waitingFor(material).find((b) => (Math.abs(x - b.x) < b.w * 8 + r && y > b.y - b.h * 8 - r && y < b.y + r)
      || (this.printers.has(b.id) && Math.hypot(x - this.printers.get(b.id)!.x, y - this.printers.get(b.id)!.y) < r + 10));
  }

  /** The material a copy's own building is waiting for, if any (shown over its head when the original comes near). */
  needOf(id: string): string | null {
    const b = this.list.find((x) => x.by === id && !x.vetoed && !x.built && x.approved && !x.paid);
    if (!b) return null;
    return Object.keys(b.cost).find((m) => Math.floor(this.scene.supplies[m] ?? 0) < b.cost[m]) ?? null;
  }

  /** The original brought material: pay the building now if the store covers it. */
  fund(b: Building) {
    if (b.paid || this.scene.warren.shortage(b.cost)) return;
    this.scene.warren.pay(b.cost);
    b.paid = true;
    this.save();
    this.scene.mindLog.push({ t: this.scene.mindClock, text: `${b.name} has all it needs now and can be raised` });
  }

  /** The original swings at a building being raised: a blow worth hands.swingWorth of a copy's. True when it struck one. */
  playerSwing(hx: number, hy: number, radius: number) {
    const b = this.list.find((x) => !x.vetoed && !x.built && x.approved && x.paid && !this.printed(x)
      && Math.abs(hx - x.x) < x.w * 8 + radius && hy > x.y - x.h * 8 - radius - 10 && hy < x.y + radius);
    if (!b) return false;
    const me = session.replicant;
    if (me && !b.helpers.includes(me.id)) b.helpers.push(me.id);
    b.progress = Math.min(this.swingsFor(b), b.progress + SUPPLIES.hands.swingWorth);
    const p = this.placed.get(b.id);
    if (p) this.refresh(p, false);
    this.scene.fx.sparks(hx, hy - 4, PALETTE[10], 4);
    sound.hit();
    // the copies at work there keep time with you
    for (const n of this.workers.get(b.id) ?? []) if (Math.random() < 0.3) n.thank();
    if (b.progress >= this.swingsFor(b)) this.complete(b);
    else if (Math.random() < 0.2) this.save();
    return true;
  }

  private complete(b: Building, npc?: Npc) {
    b.built = true;
    const p = this.placed.get(b.id);
    if (p?.cem) { b.progress = 1; this.finishCem(p, true); this.scene.bioworks?.stopFlow(b.id); }
    else if (p) this.refresh(p, true);
    // its printer powers down; a village printer folds away (the Metanoia's stay by their work)
    const pr = this.printers.get(b.id);
    if (pr) {
      pr.finish();
      if (b.by !== 'thales') this.scene.time.delayedCall(2600, () => { pr.fold(); this.printers.delete(b.id); });
    }
    this.scene.events.emit('building-done', b);
    this.save();
    const helpers = b.helpers.map((id) => this.scene.npcs.find((n) => n.data.id === id)?.data.name ?? (id === session.replicant?.id ? session.replicant.name : 'someone'));
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
      if (b.vetoed || b.built || !b.approved || !b.paid || this.printed(b) || left <= 0) continue;
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
      if (b.design) return `- ${b.name} (a design the Cems built for ${nameOf(b.by)}): ${b.built ? 'built' : `the Cems are building it, ${Math.round(this.fraction(b) * 100)}%`} "${b.purpose ?? ''}"`;
      if (b.cems) return `- ${b.name} (${b.w}x${b.h}, ${b.roof} roof, ${nameOf(b.by)}'s design, printed by the Cems): ${b.built ? 'built' : `the Cems are printing it, ${Math.round(this.fraction(b) * 100)}%, the copies tend their bed`}${b.purpose ? ` "${b.purpose}"` : ''}`;
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
