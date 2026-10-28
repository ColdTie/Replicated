// The star map: real nearby stars in 3D. Drag to turn it, pinch or scroll to zoom, tap a star to pick it, tap it
// again to see its planets turning around it and pick one. Opened from the vessel (launch mode) or from the ship
// while flying (look only).
import Phaser from 'phaser';
import { HOME, KNOWN_STARS } from '../core/home';
import { sound } from '../audio/Sound';
import { PALETTE, SUPPLIES } from '../core/data';
import { isKid, session } from '../core/session';
import { Globe } from '../fx/Globe';
import type { Journey, ReplicantSummary } from '../net/store';
import { BEACONS, STAR_LIST, defaultPlanetIndex, distanceLy, formatDuration, fuelFor, planetFor, starById, travelMs, type Star } from '../world/galaxy';
import { systemFor, type SystemPlanet } from '../world/system';
import { shipFlying } from '../core/mannies';
import { PlanetMenu, type PlanetEntry } from '../ui/planetMenu';
import { onPress } from '../input/Controls';

export interface StarMapData {
  /** launch: at the vessel; view: from the ship in flight; link: at the empty berth while the vessel is elsewhere */
  mode: 'launch' | 'view' | 'link';
  from: string;          // star the ship is at (or flying from)
  fromPlanet?: number;   // planet the ship is at
  embers?: number;       // fuel available (launch mode)
  journey?: Journey;     // the flight in progress (view mode)
  lit?: string[];        // beacon stars the family has lit
  /** launching is not possible from here yet (someone has to stay behind: travel.json needCopy) */
  blocked?: boolean;
  /** worlds with your manny ('star:planet', manny.json), and whether you drive one right now */
  mannies?: string[];
  inManny?: boolean;
  /** where your vessel waits while you drive a manny (link mode) */
  vessel?: { star: string; planet: number; journey?: Journey } | null;
  /** the beginning (src/scenes/planet/Tutorial.ts): the only worlds a launch may go to ('star:planet'), those trips
   * free of fuel, why the others wait, and the world the step wants you to fly to (ringed in Thales' gold) */
  only?: string[];
  free?: boolean;
  gateWhy?: string;
  guide?: { star: string; planet: number } | null;
  onLaunch?: (to: string, planet: number) => void;
  onLink?: (to: string, planet: number) => void;
  onVessel?: () => void;
  onClose?: () => void;
}

const CLASS_COLOR: Record<string, number> = {
  O: 0x9bb0ff, B: 0xaabfff, A: 0xdfe8ff, F: 0xfaf6e8, G: 0xffeaa0, K: 0xffb46a, M: 0xff7a5a,
};
const KIND_WORDS: Record<SystemPlanet['kind'], string> = { rock: 'ROCKY WORLD', super: 'SUPER-EARTH', neptune: 'ICE GIANT', giant: 'GAS GIANT' };
const TEMP_COLOR: Record<SystemPlanet['temp'], number> = { hot: PALETTE[8], warm: PALETTE[12], cold: PALETTE[17] };
const TEMP_WORDS: Record<SystemPlanet['temp'], string> = { hot: 'HOT', warm: 'TEMPERATE', cold: 'COLD' };
const SIGNATURE = SUPPLIES.signature as { byWorld: Record<string, string>; names: Record<string, string> };
/** how far (game px) a tap may land from a star or a planet and still pick it */
const TAP_STAR = 24, TAP_PLANET = 22;

interface Projected { star: Star; sx: number; sy: number; depth: number; r: number }
interface SysItem { sp: SystemPlanet; img: Phaser.GameObjects.Image; label: Phaser.GameObjects.BitmapText; globe: Globe; x: number; y: number; angle: number; rx: number; ry: number }

export class StarMapScene extends Phaser.Scene {
  private d!: StarMapData;
  private g!: Phaser.GameObjects.Graphics;
  private yaw = 0.6;
  private pitch = 0.45;
  private zoom = 1;
  private center = { x: 0, y: 0, z: 0 };
  selected: Star | null = null;
  projected: Projected[] = [];
  private labels = new Map<string, Phaser.GameObjects.BitmapText>();
  private info!: Phaser.GameObjects.Container;
  private infoText!: Phaser.GameObjects.BitmapText;
  private title!: Phaser.GameObjects.BitmapText;
  private launchBtn!: Phaser.GameObjects.Container;
  private linkBtn!: Phaser.GameObjects.Container;
  private vesselBtn!: Phaser.GameObjects.Container;
  private backBtn!: Phaser.GameObjects.Container;
  private dragging = false;
  private lastInputAt = 0;
  private pinchStart = 0;
  private zoomStart = 1;
  private discovered = new Set<string>(KNOWN_STARS);
  private replicants: ReplicantSummary[] = [];
  private journeys: Journey[] = [];
  private t = 0;
  // system view
  private view: 'galaxy' | 'system' = 'galaxy';
  private sysStar: Star | null = null;
  private sysItems: SysItem[] = [];
  private selPlanet: SystemPlanet | null = null;
  private nextGlobeAt = 0;
  /** your visor color: the mannies and the LINK button wear it */
  private visor = PALETTE[10];
  /** the planet menu beside the map (src/ui/planetMenu.ts), and the room the map makes for it (game px) */
  private menu?: PlanetMenu;
  private offX = 0;
  private visited: { star: string; planet: number }[] = [];

  constructor() { super('starmap'); }

  init(d: StarMapData) {
    this.d = d;
    this.selected = null;
    this.selPlanet = null;
    this.sysStar = null;
    this.sysItems = [];
    this.view = 'galaxy';
    this.labels = new Map();
    const s = starById(d.from) ?? STAR_LIST[0];
    this.center = { x: s.x, y: s.y, z: s.z };
    this.zoom = 1;
    this.visor = PALETTE[session.replicant?.traits.feature ?? session.profile?.feature_color ?? 10] ?? PALETTE[10];
  }

  /** A little body in your visor color beside a world where a manny of yours waits; a small ship where your vessel does. */
  private drawMarks(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, manny: boolean, vessel: boolean) {
    if (manny) {
      const mx = Math.round(x + r + 3), my = Math.round(y - r - 7);
      g.fillStyle(PALETTE[25], 0.85).fillRect(mx - 1, my - 1, 5, 7);
      g.fillStyle(PALETTE[20], 1).fillRect(mx, my, 3, 5);
      g.fillStyle(this.visor, 1).fillRect(mx, my + 1, 3, 1);
    }
    if (vessel) {
      const vx = Math.round(x - r - 6), vy = Math.round(y - r - 4);
      g.fillStyle(PALETTE[9], 1).fillTriangle(vx, vy - 3, vx + 3, vy + 2, vx - 3, vy + 2);
      g.fillStyle(PALETTE[11], 0.6 + 0.4 * Math.sin(this.t * 5)).fillRect(vx - 1, vy + 2, 2, 2);
    }
  }

  /** The picked star or planet: a soft halo in its own color and four corner brackets that breathe in and out. */
  private drawPick(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, col: number) {
    const k = r + 6 + Math.sin(this.t * 4) * 1.5, l = 4;
    g.fillStyle(col, 0.18).fillCircle(x, y, r + 4);
    g.lineStyle(1, PALETTE[19], 1);
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const cx = x + sx * k, cy = y + sy * k;
      g.lineBetween(cx, cy, cx - sx * l, cy);
      g.lineBetween(cx, cy, cx, cy - sy * l);
    }
  }

  create() {
    const { width: w, height: h } = this.scale;
    this.add.rectangle(0, 0, w, h, PALETTE[25], 0.96).setOrigin(0).setInteractive(); // swallow taps to the world below
    this.g = this.add.graphics();
    this.input.addPointer(1);

    // Close (X) top right
    const close = this.add.container(w - 16, 14);
    const cg = this.add.graphics();
    cg.lineStyle(2, PALETTE[20], 0.9).lineBetween(-5, -5, 5, 5).lineBetween(-5, 5, 5, -5);
    close.add([this.add.circle(0, 0, 10, PALETTE[24], 0.8).setStrokeStyle(1, PALETTE[22]), cg]);
    close.setSize(24, 24).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.close());

    // Back (<) top left: system view -> galaxy
    const bg = this.add.graphics();
    bg.lineStyle(2, PALETTE[20], 0.9).lineBetween(3, -5, -3, 0).lineBetween(-3, 0, 3, 5);
    this.backBtn = this.add.container(16, 14, [this.add.circle(0, 0, 10, PALETTE[24], 0.8).setStrokeStyle(1, PALETTE[22]), bg]).setDepth(5000);
    this.backBtn.setSize(24, 24).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.closeSystem()).setVisible(false);

    // Info panel bottom left (tap it in galaxy view to open the selected star's planets)
    this.infoText = this.add.bitmapText(8, 0, 'pixel', '').setTint(PALETTE[20]);
    const panel = this.add.rectangle(0, 0, 220, 40, PALETTE[24], 0.75).setOrigin(0).setStrokeStyle(1, PALETTE[23]);
    this.info = this.add.container(8, h - 46, [panel, this.infoText]).setDepth(5000);
    this.infoText.setPosition(6, 6);
    this.info.setVisible(false);
    panel.setInteractive({ useHandCursor: true }).on('pointerdown', () => { if (this.view === 'galaxy' && this.selected) this.openSystem(this.selected); });

    // Launch button bottom right (launch mode)
    const ring = this.add.circle(0, 0, 24, PALETTE[24], 0.7).setStrokeStyle(2, PALETTE[9]);
    const core = this.add.circle(0, 0, 16, PALETTE[9], 0.5);
    const icon = this.add.image(0, 2, 'vessel', 0).setScale(0.75);
    const label = (text: string, color: number) => this.add.bitmapText(0, 27, 'pixel', text).setOrigin(0.5, 0).setTint(color);
    this.launchBtn = this.add.container(w - 40, h - 44, [ring, core, icon, label('LAUNCH', PALETTE[9])]).setSize(56, 56).setVisible(false).setDepth(5000);
    this.launchBtn.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.launch());
    this.tweens.add({ targets: core, alpha: 0.2, duration: 700, yoyo: true, repeat: -1 });

    // Link (a manny waits on the picked world): a ring in your visor color around a little body
    const visor = this.visor;
    const lcore = this.add.circle(0, 0, 13, PALETTE[28], 0.45);
    const figure = this.add.graphics();
    figure.fillStyle(PALETTE[20]).fillRect(-3, -8, 6, 5).fillRect(-4, -2, 8, 7).fillRect(-3, 5, 2, 4).fillRect(1, 5, 2, 4);
    figure.fillStyle(visor).fillRect(-2, -7, 4, 2);
    this.linkBtn = this.add.container(w - 100, h - 44, [this.add.circle(0, 0, 20, PALETTE[24], 0.7).setStrokeStyle(2, visor), lcore, figure, label('LINK', visor)])
      .setSize(46, 46).setVisible(false).setDepth(5000);
    this.linkBtn.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.link());
    this.tweens.add({ targets: lcore, alpha: 0.15, duration: 800, yoyo: true, repeat: -1 });

    // Back to your own body aboard the vessel (link mode: you drive a manny and the vessel waits elsewhere)
    this.vesselBtn = this.add.container(w - 40, h - 44, [this.add.circle(0, 0, 24, PALETTE[24], 0.7).setStrokeStyle(2, visor), this.add.circle(0, 0, 16, PALETTE[9], 0.35),
      this.add.image(0, 2, 'vessel', 0).setScale(0.75), label('TO SHIP', visor)])
      .setSize(56, 56).setVisible(this.d.mode === 'link' && !!this.d.vessel).setDepth(5000);
    this.vesselBtn.setInteractive({ useHandCursor: true }).on('pointerdown', () => { const cb = this.d.onVessel; this.scene.stop(); cb?.(); });

    // Input: drag to rotate, tap to select, pinch / wheel to zoom
    let downAt = { x: 0, y: 0, t: 0 };
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.lastInputAt = this.time.now;
      if (this.pinching()) { this.pinchStart = this.pinchDistance(); this.zoomStart = this.zoom; return; }
      downAt = { x: p.x, y: p.y, t: this.time.now };
      this.dragging = this.view === 'galaxy';
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown || this.view !== 'galaxy') return;
      this.lastInputAt = this.time.now;
      if (this.pinching()) {
        const d = this.pinchDistance();
        if (this.pinchStart > 0) this.zoom = Phaser.Math.Clamp(this.zoomStart * d / this.pinchStart, 0.25, 6);
        return;
      }
      if (!this.dragging) return;
      this.yaw += (p.x - p.prevPosition.x) * 0.012;
      this.pitch = Phaser.Math.Clamp(this.pitch + (p.y - p.prevPosition.y) * 0.012, -1.4, 1.4);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      this.dragging = false;
      if (Math.hypot(p.x - downAt.x, p.y - downAt.y) < 6 && this.time.now - downAt.t < 400) this.tap(p.x, p.y);
    });
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      if (this.view !== 'galaxy') return;
      this.zoom = Phaser.Math.Clamp(this.zoom * (dy > 0 ? 0.9 : 1.1), 0.25, 6);
      this.lastInputAt = this.time.now;
    });
    onPress(this, ['ESC'], () => (this.view === 'system' ? this.closeSystem() : this.close()));

    // Who is where, what has been found, who is flying (best effort; the map works without it)
    const st = session.store;
    if (st) {
      st.discoveredStars().then((s) => s.forEach((id) => this.discovered.add(id))).catch(() => undefined);
      // the lattice also shows when the map opens from the ship in flight
      if (!this.d.lit) st.litBeacons().then((l) => { this.d.lit = l; }).catch(() => undefined);
      st.listReplicants().then((r) => (this.replicants = r)).catch(() => undefined);
      st.openJourneys().then((j) => {
        const latest = new Map<string, Journey>();
        for (const x of j) if (!latest.has(x.replicant_id) || latest.get(x.replicant_id)!.departs_at < x.departs_at) latest.set(x.replicant_id, x);
        this.journeys = [...latest.values()];
      }).catch(() => undefined);
    }
    if (this.d.journey) this.discovered.add(this.d.journey.from_star);

    // Title
    this.title = this.add.bitmapText(w / 2, 10, 'pixel', this.titleText()).setOrigin(0.5, 0).setTint(PALETTE[21]).setDepth(5000);
    sound.coreHum();

    // The planet menu: the same worlds as a list beside the map (recent and closest, each with its details)
    this.menu = new PlanetMenu(this.game.canvas, (star, planet) => this.pickFromMenu(star, planet), () => { sound.menuMove(0); this.layout(); });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.menu?.destroy(); this.menu = undefined; });
    this.layout();
    this.fillMenu();
    if (st) st.visitedPlanets().then((v) => { this.visited = v; this.fillMenu(); }).catch(() => undefined);
    this.time.delayedCall(1200, () => this.fillMenu()); // who lives where has loaded by then
    // the beginning wants you somewhere: the map opens picked on it
    const guide = this.d.guide && starById(this.d.guide.star);
    if (guide && this.d.mode === 'launch') { this.selected = guide; this.updateInfo(); this.menu?.select(guide.id); }
  }

  /** Thales' gold ring around the world the beginning wants you to fly to: two arcs turning, breathing. */
  private drawGuide(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number) {
    const k = r + 10 + Math.sin(this.t * 3) * 2, a = this.t * 1.6;
    g.lineStyle(1, PALETTE[11], 0.55 + 0.35 * Math.sin(this.t * 3));
    for (const o of [0, Math.PI]) { g.beginPath(); g.arc(x, y, k, a + o, a + o + 2.1); g.strokePath(); }
    g.fillStyle(PALETTE[11], 0.9).fillRect(Math.round(x + Math.cos(a) * k) - 1, Math.round(y + Math.sin(a) * k) - 1, 2, 2);
  }

  /** The map makes room for the menu: its center and the info panel move right of it. */
  private layout() {
    this.offX = this.menu?.widthIn(this.scale.width) ?? 0;
    this.info?.setX(this.offX + 8);
  }

  /** One world as the menu shows it: its name, star and distance, and its details when opened. */
  private entry(star: string, planet: number): PlanetEntry | null {
    const s = starById(star), sp = systemFor(star).find((p) => p.index === planet), def = planetFor(star, planet);
    if (!s || !sp || !def) return null;
    const here = this.isHere(star, planet), ly = distanceLy(this.d.from, star);
    const people = this.replicants.filter((r) => r.status !== 'in_transit' && r.star_id === star && r.planet_index === planet).map((r) => r.name);
    const husk = this.mannyAt(star, planet) !== null;
    const material = SIGNATURE.byWorld[def.id];
    const details = [
      `STAR ${s.name} - CLASS ${s.cls}`,
      here ? 'YOU ARE HERE' : ly < 0.01 ? `SAME SYSTEM - ${formatDuration(travelMs(ly))}` : `${ly.toFixed(1)} LIGHT YEARS - ${formatDuration(travelMs(ly))}`,
      ...(here ? [] : [this.d.only ? this.fuelLine(star, planet, fuelFor(ly)) : `FUEL ${fuelFor(ly)} EMBER${this.d.mode === 'launch' ? ` (YOU HAVE ${this.d.embers ?? 0})` : ''}`]),
      `${KIND_WORDS[sp.kind]} - ${def.subtitle} - ${TEMP_WORDS[sp.temp]}`,
      sp.hz ? 'IN THE HABITABLE ZONE' : 'OUTSIDE THE HABITABLE ZONE',
      people.length ? `VESSELS: ${people.join(', ').toUpperCase()}` : 'NO VESSELS',
      husk ? 'YOUR HUSK WAITS HERE' : 'NO HUSK OF YOURS',
      material ? `MAKES ${(SIGNATURE.names[material] ?? material).toUpperCase()}` : '',
      sp.real ? 'CONFIRMED BY ASTRONOMERS' : 'UNCHARTED',
    ].filter(Boolean);
    const guide = this.d.guide?.star === star && this.d.guide.planet === planet;
    const mark = here ? 'HERE' : guide ? 'THALES' : people.length ? `${people.length}` : husk ? 'HUSK' : '';
    return { star, planet, name: sp.moon ?? sp.name, sub: here ? `${s.name} - YOU ARE HERE` : `${s.name} - ${ly.toFixed(1)} LY`, details, mark };
  }

  /**
   * RECENT: worlds with a save, newest first (this one leads). CLOSEST: the worlds of the nearest other stars, at most
   * PER_STAR of each (those in the habitable zone first), so the list reaches past one big system; the planets of the
   * star you are at are on the map (tap it), not in this list.
   */
  private fillMenu() {
    if (!this.menu) return;
    const from = this.d.fromPlanet ?? defaultPlanetIndex(this.d.from);
    const seen = new Set<string>();
    const recent: PlanetEntry[] = [];
    for (const v of [{ star: this.d.from, planet: from }, ...this.visited]) {
      const k = `${v.star}:${v.planet}`;
      if (seen.has(k) || recent.length >= 10) continue;
      const e = this.entry(v.star, v.planet);
      if (e) { recent.push(e); seen.add(k); }
    }
    const closest: PlanetEntry[] = [];
    const PER_STAR = 3, MAX = 14;
    for (const s of [...STAR_LIST].sort((a, b) => distanceLy(this.d.from, a.id) - distanceLy(this.d.from, b.id))) {
      if (s.id === this.d.from) continue;
      const worlds = systemFor(s.id).slice().sort((a, b) => Number(b.hz) - Number(a.hz) || a.index - b.index).slice(0, PER_STAR).sort((a, b) => a.index - b.index);
      for (const p of worlds) {
        if (closest.length >= MAX) break;
        const e = this.entry(s.id, p.index);
        if (e) closest.push(e);
      }
      if (closest.length >= MAX) break;
    }
    this.menu.setGroups({ recent, closest });
  }

  /** A row was picked: the map flies into that star's system and picks the planet. */
  pickFromMenu(star: string, planet: number) {
    const s = starById(star);
    if (!s) return;
    if (this.view === 'system' && this.sysStar?.id !== star) this.closeSystem();
    if (this.view === 'galaxy') { this.selected = s; this.center = { x: s.x, y: s.y, z: s.z }; this.openSystem(s); }
    this.selPlanet = systemFor(star).find((p) => p.index === planet) ?? this.selPlanet;
    sound.collect();
    this.updateInfo();
  }

  private titleText() {
    return this.d.mode === 'launch' ? 'WHERE TO?' : this.d.mode === 'link' ? 'YOUR HUSKS' : 'STAR MAP';
  }

  /** The planet of this star where a manny of yours waits (the given one if it has one), or null. */
  private mannyAt(star: string, planet?: number) {
    const keys = this.d.mannies ?? [];
    if (planet !== undefined) return keys.includes(`${star}:${planet}`) ? planet : null;
    const k = keys.find((x) => x.slice(0, x.lastIndexOf(':')) === star);
    return k ? Number(k.slice(k.lastIndexOf(':') + 1)) : null;
  }

  /** Where a link from the current selection would go: a world with your manny that is not this one. */
  private linkTarget(): { star: string; planet: number } | null {
    if (!this.d.onLink) return null;
    const star = this.view === 'system' ? this.sysStar : this.selected;
    if (!star) return null;
    const planet = this.view === 'system' ? (this.selPlanet ? this.mannyAt(star.id, this.selPlanet.index) : null) : this.mannyAt(star.id);
    if (planet === null) return null;
    if (this.d.mode !== 'view' && this.isHere(star.id, planet)) return null;
    return { star: star.id, planet };
  }

  link() {
    const t = this.linkTarget();
    if (!t) return;
    const cb = this.d.onLink;
    this.scene.stop();
    cb?.(t.star, t.planet);
  }

  private pinching() {
    const a = this.input.pointer1, b = this.input.pointer2;
    return a.isDown && b.isDown;
  }

  private pinchDistance() {
    const a = this.input.pointer1, b = this.input.pointer2;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private project(s: Star): Projected {
    const { width: w, height: h } = this.scale;
    const x = s.x - this.center.x, y = s.y - this.center.y, z = s.z - this.center.z;
    // yaw around the z axis (celestial pole), then pitch to tilt the view
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const x1 = x * cy - y * sy, y1 = x * sy + y * cy;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const y2 = y1 * cp - z * sp, z2 = y1 * sp + z * cp;
    const scale = 7 * this.zoom;
    const persp = 60 / (60 + y2 * 0.8);
    return { star: s, sx: (w + this.offX) / 2 + x1 * scale * persp, sy: h / 2 - z2 * scale * persp, depth: y2, r: persp };
  }

  tap(x: number, y: number) {
    const { width: w, height: h } = this.scale;
    if ((x > w - 70 && y > h - 76 && (this.launchBtn.visible || this.vesselBtn.visible)) || (x > w - 126 && x < w - 74 && y > h - 72 && this.linkBtn.visible)
      || (x > w - 30 && y < 30) || (x < 30 && y < 30 && this.backBtn.visible)) return; // buttons
    if (this.info.visible && x < this.info.x + (this.info.list[0] as Phaser.GameObjects.Rectangle).width && y > this.info.y) return;
    if (this.view === 'system') { this.tapPlanet(x, y); return; }
    let best: Projected | null = null, bd = TAP_STAR;
    for (const p of this.projected) {
      const d = Math.hypot(p.sx - x, p.sy - y);
      if (d < bd) { bd = d; best = p; }
    }
    if (!best) return;
    if (this.selected?.id === best.star.id) { this.openSystem(best.star); return; }
    this.selected = best.star;
    sound.collect();
    this.updateInfo();
    this.menu?.select(best.star.id);
  }

  private canAfford(s: Star, planet = defaultPlanetIndex(s.id)) {
    if (this.d.free && this.allowed(s.id, planet)) return true;
    return (this.d.embers ?? 0) >= fuelFor(distanceLy(this.d.from, s.id));
  }

  /** The beginning lets the ship fly only to some worlds (StarMapData only). */
  private allowed(star: string, planet: number) { return !this.d.only || this.d.only.includes(`${star}:${planet}`); }

  /** What a launch there would take, in words: the fuel, or why it cannot go yet. */
  private fuelLine(star: string, planet: number, fuel: number) {
    if (this.d.blocked) return 'A COPY MUST STAY BEHIND FIRST';
    if (!this.allowed(star, planet)) return this.d.gateWhy ?? 'NOT YET';
    if (this.d.free) return 'THALES FILLED THE TANKS';
    return `FUEL ${fuel} OF ${this.d.embers ?? 0}`;
  }

  /** Where a launch from the current selection would go. */
  private destination(): { star: Star; planet: number } | null {
    if (this.view === 'system' && this.sysStar && this.selPlanet) return { star: this.sysStar, planet: this.selPlanet.index };
    if (this.view === 'galaxy' && this.selected) return { star: this.selected, planet: defaultPlanetIndex(this.selected.id) };
    return null;
  }

  private isHere(star: string, planet: number) {
    return star === this.d.from && planet === (this.d.fromPlanet ?? defaultPlanetIndex(this.d.from));
  }

  updateInfo() {
    const dest = this.destination();
    const s = this.view === 'system' ? this.sysStar : this.selected;
    this.info.setVisible(!!s);
    if (!s) { this.launchBtn.setVisible(false); return; }
    const ly = distanceLy(this.d.from, s.id);
    const fuel = fuelFor(ly);
    const lines: string[] = [];
    const planets = systemFor(s.id);
    if (this.view === 'galaxy') {
      lines.push(s.name + (s.beacon ? (this.d.lit?.includes(s.id) ? '  - BEACON LIT' : '  - BEACON') : s.id === this.d.from ? '  - YOU ARE HERE' : ''));
      if (!isKid()) {
        if (s.id !== this.d.from) lines.push(`${ly.toFixed(1)} LIGHT YEARS - ${formatDuration(travelMs(ly))}`);
        const known = planets.some((p) => p.real);
        lines.push(`${planets.length} ${planets.length === 1 ? 'WORLD' : 'WORLDS'}${known ? ' KNOWN TO ASTRONOMERS' : ''}  - TAP FOR PLANETS`);
        if (this.d.mode === 'launch' && s.id !== this.d.from) lines.push(this.fuelLine(s.id, defaultPlanetIndex(s.id), fuel));
        const mp = this.mannyAt(s.id);
        if (mp !== null) lines.push(this.d.mode !== 'view' && this.d.inManny && this.isHere(s.id, mp) ? 'YOU DRIVE YOUR HUSK HERE' : `YOUR HUSK WAITS ON ${planetFor(s.id, mp)?.name ?? 'A WORLD'} - LINK`);
        if (this.d.vessel?.star === s.id) lines.push(shipFlying(this.d.vessel) ? 'YOUR SHIP IS ON ITS WAY HERE' : 'YOUR SHIP WAITS HERE');
      } else {
        lines.push(s.id !== this.d.from ? formatDuration(travelMs(ly)) : 'HOME STAR');
      }
    } else if (this.selPlanet) {
      const p = this.selPlanet;
      lines.push(p.name + (this.isHere(s.id, p.index) ? '  - YOU ARE HERE' : ''));
      if (!isKid()) {
        lines.push(`${KIND_WORDS[p.kind]}${p.moon ? ` - LAND ON ${p.moon}` : ''}${p.hz ? ' - HABITABLE ZONE' : ''}`);
        lines.push(p.real ? 'CONFIRMED BY ASTRONOMERS' : 'UNCHARTED');
        if (!this.isHere(s.id, p.index)) {
          lines.push(ly < 0.01 ? `SAME SYSTEM - ${formatDuration(travelMs(ly))}` : `${ly.toFixed(1)} LIGHT YEARS - ${formatDuration(travelMs(ly))}`);
          if (this.d.mode === 'launch') lines.push(this.fuelLine(s.id, p.index, fuel));
        }
        if (this.mannyAt(s.id, p.index) !== null) lines.push(this.d.mode !== 'view' && this.d.inManny && this.isHere(s.id, p.index) ? 'YOU DRIVE YOUR HUSK HERE' : 'YOUR HUSK WAITS HERE - LINK');
        if (this.d.vessel?.star === s.id && this.d.vessel.planet === p.index) lines.push(shipFlying(this.d.vessel) ? 'YOUR SHIP IS ON ITS WAY HERE' : 'YOUR SHIP WAITS HERE');
      } else if (!this.isHere(s.id, p.index)) lines.push(formatDuration(travelMs(ly)));
    } else {
      lines.push(s.name);
      if (!isKid()) lines.push('TAP A PLANET');
    }
    this.infoText.setText(lines.join('\n'));
    const canGo = !!dest && this.d.mode === 'launch' && !this.isHere(dest.star.id, dest.planet);
    this.launchBtn.setVisible(canGo);
    this.launchBtn.setAlpha(canGo && !this.d.blocked && this.allowed(dest!.star.id, dest!.planet) && this.canAfford(dest!.star, dest!.planet) ? 1 : 0.35);
    this.linkBtn.setVisible(!!this.linkTarget());
    this.linkBtn.setX(this.d.mode === 'view' ? this.scale.width - 40 : this.scale.width - 100);
    (this.info.list[0] as Phaser.GameObjects.Rectangle).setSize(Math.max(160, this.infoText.width + 14), lines.length * 10 + 8);
    this.info.setPosition(this.offX + 8, this.scale.height - (lines.length * 10 + 8) - 6);
  }

  launch() {
    const dest = this.destination();
    if (!dest || this.d.mode !== 'launch') return;
    if (this.isHere(dest.star.id, dest.planet)) { this.openSystem(dest.star); return; }
    if (this.d.blocked || !this.allowed(dest.star.id, dest.planet) || !this.canAfford(dest.star, dest.planet)) {
      sound.denied();
      this.tweens.add({ targets: this.launchBtn, x: this.launchBtn.x + 3, duration: 40, yoyo: true, repeat: 3 });
      return;
    }
    const cb = this.d.onLaunch;
    this.scene.stop();
    cb?.(dest.star.id, dest.planet);
  }

  close() {
    const cb = this.d.onClose;
    this.scene.stop();
    cb?.();
  }

  // ------------------------------------------------------------ system view

  /** Zoom in on one star: its planets turn on their orbits; tap one to pick it. */
  openSystem(star: Star) {
    const { width: w, height: h } = this.scale;
    this.view = 'system';
    this.sysStar = star;
    this.selected = star;
    this.selPlanet = null;
    for (const l of this.labels.values()) l.setVisible(false);
    this.backBtn.setVisible(true);
    this.title.setText(star.name);
    sound.doorOpen();
    const planets = systemFor(star.id);
    const n = planets.length;
    const maxR = Math.min((w - this.offX) * 0.46, h * 0.9);
    planets.forEach((sp, i) => {
      const def = planetFor(star.id, sp.index)!;
      const size = Phaser.Math.Clamp(Math.round(6 + sp.size * 6), 7, 26);
      const key = `sys.${star.id}.${sp.index}`;
      const globe = new Globe(this, key, size, def, { earth: def.id === 'earth', kind: sp.kind, temp: sp.temp });
      const img = this.add.image(0, 0, key).setDepth(1000);
      const label = this.add.bitmapText(0, 0, 'pixel', sp.name).setOrigin(0.5, 0).setTint(sp.real ? PALETTE[20] : PALETTE[22]).setDepth(1001).setAlpha(0.9);
      const rx = n === 1 ? maxR * 0.55 : 34 + (i / (n - 1)) * (maxR - 34);
      this.sysItems.push({ sp, img, label, globe, x: 0, y: 0, angle: (i * 2.4 + 0.7) % (Math.PI * 2), rx, ry: rx * 0.33 });
    });
    // arrive on the planet you are at, if this is your star
    if (star.id === this.d.from) this.selPlanet = planets.find((p) => this.isHere(star.id, p.index)) ?? null;
    this.updateInfo();
  }

  closeSystem() {
    this.view = 'galaxy';
    for (const it of this.sysItems) { it.img.destroy(); it.label.destroy(); this.textures.remove(it.globe.key); }
    this.sysItems = [];
    this.sysStar = null;
    this.selPlanet = null;
    this.backBtn.setVisible(false);
    this.title.setText(this.titleText());
    sound.collect();
    this.updateInfo();
  }

  private tapPlanet(x: number, y: number) {
    let best: SysItem | null = null, bd = TAP_PLANET;
    for (const it of this.sysItems) {
      const d = Math.hypot(it.x - x, it.y - y);
      if (d < bd) { bd = d; best = it; }
    }
    if (!best) return;
    this.selPlanet = best.sp;
    sound.collect();
    this.updateInfo();
    this.menu?.select(best.sp.star, best.sp.index);
  }

  private drawSystem(dt: number) {
    const { width: w, height: h } = this.scale;
    const g = this.g;
    const star = this.sysStar!;
    const cx = (w + this.offX) / 2, cy = h * 0.44;
    const col = CLASS_COLOR[star.cls[0]] ?? 0xffffff;
    const big = /III/.test(star.cls) || 'OBA'.includes(star.cls[0]);
    const sr = big ? 16 : star.cls[0] === 'M' ? 7 : 11;
    // orbits, colored by how warm the world is
    for (const it of this.sysItems) {
      const c = TEMP_COLOR[it.sp.temp];
      g.lineStyle(1, c, this.selPlanet === it.sp ? 0.7 : it.sp.hz ? 0.45 : 0.22);
      g.strokeEllipse(cx, cy, it.rx * 2, it.ry * 2);
    }
    // the star: glow, disc, flicker
    const flick = 1 + Math.sin(this.t * 7) * 0.04 + Math.sin(this.t * 13.7) * 0.03;
    g.fillStyle(col, 0.08).fillCircle(cx, cy, sr * 3.2 * flick);
    g.fillStyle(col, 0.18).fillCircle(cx, cy, sr * 1.9 * flick);
    g.fillStyle(col, 1).fillCircle(cx, cy, sr);
    g.fillStyle(0xffffff, 0.8).fillCircle(cx - sr * 0.3, cy - sr * 0.3, sr * 0.35);
    // planets move; those in front of the star draw over it
    const settled = new Map<string, number>();
    for (const r of this.replicants) if (r.status !== 'in_transit' && r.star_id === star.id) settled.set(String(r.planet_index), (settled.get(String(r.planet_index)) ?? 0) + 1);
    for (const it of this.sysItems) {
      it.angle += dt * 0.00018 * (1 / Math.sqrt(it.rx / 40));
      const front = Math.sin(it.angle);
      it.x = cx + Math.cos(it.angle) * it.rx;
      it.y = cy + front * it.ry;
      const sc = 1 + front * 0.18;
      it.img.setPosition(Math.round(it.x), Math.round(it.y)).setScale(sc).setDepth(front > 0 ? 1100 : 900).setAlpha(front > 0 ? 1 : 0.8);
      const r = (it.img.width / 2) * sc;
      // a giant's moon circles it
      if (it.sp.moon) {
        const ma = this.t * 2.2 + it.sp.index;
        g.fillStyle(PALETTE[20], 1).fillCircle(Math.round(it.x + Math.cos(ma) * (r + 5)), Math.round(it.y + Math.sin(ma) * (r + 5) * 0.4), 1.5);
      }
      const people = settled.get(String(it.sp.index)) ?? 0;
      if (people) {
        g.lineStyle(1, PALETTE[9], 0.9).strokeCircle(it.x, it.y, r + 4);
        for (let i = 0; i < Math.min(6, people); i++) {
          const a = this.t * 0.8 + (i / Math.min(6, people)) * Math.PI * 2;
          g.fillStyle(PALETTE[10], 1).fillRect(Math.round(it.x + Math.cos(a) * (r + 7)), Math.round(it.y + Math.sin(a) * (r + 7)), 1, 1);
        }
      }
      if (this.isHere(star.id, it.sp.index)) g.lineStyle(1, PALETTE[18], 0.9).strokeCircle(it.x, it.y, r + 7 + Math.sin(this.t * 4));
      this.drawMarks(g, it.x, it.y, r, this.mannyAt(star.id, it.sp.index) !== null,
        !!this.d.vessel && !shipFlying(this.d.vessel) && this.d.vessel.star === star.id && this.d.vessel.planet === it.sp.index);
      if (this.selPlanet === it.sp) this.drawPick(g, it.x, it.y, r, TEMP_COLOR[it.sp.temp]);
      if (this.d.guide?.star === star.id && this.d.guide.planet === it.sp.index) this.drawGuide(g, it.x, it.y, r);
      it.label.setPosition(Math.round(it.x), Math.round(it.y + r + 4)).setVisible(this.selPlanet === it.sp || it.sp.real || this.sysItems.length <= 4 || front > 0.3);
    }
    if (this.t > this.nextGlobeAt) {
      this.nextGlobeAt = this.t + 1 / 8;
      for (const it of this.sysItems) it.globe.draw(this.t * 0.04 + it.sp.index * 0.1);
    }
  }

  update(_time: number, dt: number) {
    this.t += dt / 1000;
    const g = this.g;
    g.clear();
    if (this.view === 'system') { this.drawSystem(dt); return; }
    if (!this.dragging && this.time.now - this.lastInputAt > 2500) this.yaw += dt * 0.00008;

    // Reference rings around the current star on its "equator": 5, 10, 20, 40 light years
    for (const r of [5, 10, 20, 40]) {
      g.lineStyle(1, PALETTE[23], r === 10 ? 0.5 : 0.3);
      let first = true;
      for (let i = 0; i <= 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        const p = this.project({ id: '', name: '', cls: 'G', ly: 0, x: this.center.x + Math.cos(a) * r, y: this.center.y + Math.sin(a) * r, z: this.center.z });
        if (first) { g.beginPath(); g.moveTo(p.sx, p.sy); first = false; } else g.lineTo(p.sx, p.sy);
      }
      g.strokePath();
    }

    this.projected = STAR_LIST.map((s) => this.project(s)).sort((a, b) => b.depth - a.depth);
    const here = this.projected.find((p) => p.star.id === this.d.from);

    // Planned route
    if (this.selected && here && this.selected.id !== this.d.from) {
      const to = this.projected.find((p) => p.star.id === this.selected!.id)!;
      const ok = this.d.mode !== 'launch' || (this.allowed(this.selected.id, defaultPlanetIndex(this.selected.id)) && this.canAfford(this.selected));
      g.lineStyle(1, ok ? PALETTE[9] : PALETTE[22], 0.9);
      const n = Math.max(2, Math.floor(Math.hypot(to.sx - here.sx, to.sy - here.sy) / 4));
      for (let i = 0; i < n; i += 2) {
        const a = i / n, b = Math.min(1, (i + 1) / n);
        g.lineBetween(here.sx + (to.sx - here.sx) * a, here.sy + (to.sy - here.sy) * a, here.sx + (to.sx - here.sx) * b, here.sy + (to.sy - here.sy) * b);
      }
    }

    // Ships in flight: line plus a moving dot
    const now = Date.now();
    for (const j of this.journeys.concat(this.d.journey && !this.journeys.some((x) => x.id === this.d.journey!.id) ? [this.d.journey] : [])) {
      const a = this.projected.find((p) => p.star.id === j.from_star), b = this.projected.find((p) => p.star.id === j.to_star);
      if (!a || !b) continue;
      const t0 = Date.parse(j.departs_at), t1 = Date.parse(j.arrives_at);
      const f = Phaser.Math.Clamp((now - t0) / Math.max(1, t1 - t0), 0, 1);
      g.lineStyle(1, PALETTE[18], 0.5).lineBetween(a.sx, a.sy, b.sx, b.sy);
      g.fillStyle(PALETTE[18], 1).fillCircle(a.sx + (b.sx - a.sx) * f, a.sy + (b.sy - a.sy) * f, 2 + Math.sin(this.t * 6));
    }

    // The beacon lattice (beacon.json lattice): each lit beacon joined to the Sun and to the other lit ones; whole and
    // brighter once all four are lit
    const lattice = (this.d.lit ?? []).filter((id) => BEACONS.includes(id));
    if (lattice.length) {
      const sol = this.projected.find((p) => p.star.id === 'sol');
      const pts = lattice.map((id) => this.projected.find((p) => p.star.id === id)).filter((p): p is NonNullable<typeof p> => !!p);
      const whole = lattice.length >= BEACONS.length;
      g.lineStyle(1, whole ? PALETTE[19] : PALETTE[18], (whole ? 0.55 : 0.3) + 0.15 * Math.sin(this.t * 2));
      for (const p of pts) if (sol) g.lineBetween(sol.sx, sol.sy, p.sx, p.sy);
      for (let i = 0; i < pts.length; i++) for (let k = i + 1; k < pts.length; k++) g.lineBetween(pts[i].sx, pts[i].sy, pts[k].sx, pts[k].sy);
    }

    // Stars
    const settled = new Map<string, number>();
    for (const r of this.replicants) if (r.status !== 'in_transit') settled.set(r.star_id, (settled.get(r.star_id) ?? 0) + 1);
    const radii = new Map<string, number>();
    for (const p of this.projected) {
      const s = p.star;
      const col = CLASS_COLOR[s.cls[0]] ?? 0xffffff;
      const giant = /III/.test(s.cls) || 'OBA'.includes(s.cls[0]);
      const found = this.discovered.has(s.id);
      const inRange = this.d.mode !== 'launch' || this.canAfford(s);
      const dim = inRange ? 1 : 0.45;
      const r = Math.max(1, (giant ? 2.4 : s.cls[0] === 'M' ? 1.2 : 1.8) * p.r * Math.min(1.6, 0.7 + this.zoom * 0.3));
      radii.set(s.id, r);
      g.fillStyle(col, (found ? 0.35 : 0.15) * dim).fillCircle(p.sx, p.sy, r * 2.4);
      g.fillStyle(col, (found ? 1 : 0.6) * dim).fillCircle(p.sx, p.sy, r);
      // known planets: a row of pips (green when one sits in the habitable zone)
      if (s.planets && this.zoom > 1.1) {
        const hz = s.planets.some((pl) => pl.hz);
        const n = Math.min(8, s.planets.length);
        g.fillStyle(hz ? PALETTE[12] : PALETTE[21], 0.9 * dim);
        for (let i = 0; i < n; i++) g.fillRect(Math.round(p.sx - n + i * 2), Math.round(p.sy - r - 4), 1, 1);
      }
      if (s.beacon || BEACONS.includes(s.id)) {
        const lit = !!this.d.lit?.includes(s.id);
        const pulse = 4 + Math.sin(this.t * 3) * 1.5;
        if (lit) {
          // a lit beacon: filled white diamond and a beam reaching up
          g.fillStyle(PALETTE[18], 0.25).fillPoints([{ x: p.sx, y: p.sy - pulse - 5 }, { x: p.sx + pulse + 5, y: p.sy }, { x: p.sx, y: p.sy + pulse + 5 }, { x: p.sx - pulse - 5, y: p.sy }], true);
          g.lineStyle(1, PALETTE[19], 0.5 + 0.4 * Math.sin(this.t * 5)).lineBetween(p.sx, p.sy - pulse - 5, p.sx, p.sy - 34 - pulse * 2);
        }
        g.lineStyle(1, lit ? PALETTE[19] : PALETTE[11], 0.9);
        g.strokePoints([{ x: p.sx, y: p.sy - pulse - 3 }, { x: p.sx + pulse + 3, y: p.sy }, { x: p.sx, y: p.sy + pulse + 3 }, { x: p.sx - pulse - 3, y: p.sy }], true);
      }
      const people = settled.get(s.id) ?? 0;
      if (people) {
        g.lineStyle(1, PALETTE[9], 0.9).strokeCircle(p.sx, p.sy, r + 4);
        for (let i = 0; i < Math.min(6, people); i++) {
          const a = this.t * 0.8 + (i / Math.min(6, people)) * Math.PI * 2;
          g.fillStyle(PALETTE[10], 1).fillRect(Math.round(p.sx + Math.cos(a) * (r + 7)), Math.round(p.sy + Math.sin(a) * (r + 7)), 1, 1);
        }
      }
      if (s.id === this.d.from) g.lineStyle(1, PALETTE[18], 0.9).strokeCircle(p.sx, p.sy, r + 7 + Math.sin(this.t * 4));
      this.drawMarks(g, p.sx, p.sy, r, this.mannyAt(s.id) !== null, !!this.d.vessel && !shipFlying(this.d.vessel) && this.d.vessel.star === s.id);
      if (this.selected?.id === s.id) this.drawPick(g, p.sx, p.sy, r, col);
      if (this.d.guide?.star === s.id) this.drawGuide(g, p.sx, p.sy, r);
    }

    // Labels: home, here, beacons, selected and settled always; named stars as you zoom in; never on top of each other
    const priority = (p: Projected) => {
      const s = p.star;
      if (s.id === this.d.from || this.selected?.id === s.id) return 0;
      if (KNOWN_STARS.includes(s.id) || s.beacon || settled.has(s.id)) return 1;
      if (this.discovered.has(s.id)) return 2;
      return 3 + (s.planets ? 0 : 1) + Math.min(1, s.ly / 60);
    };
    const { width: w } = this.scale;
    // the title and the corner buttons are off limits for labels
    const taken: Phaser.Geom.Rectangle[] = [new Phaser.Geom.Rectangle(w / 2 - 50, 0, 100, 22), new Phaser.Geom.Rectangle(w - 34, 0, 34, 30), new Phaser.Geom.Rectangle(0, 0, 34, 30)];
    const sorted = [...this.projected].sort((a, b) => priority(a) - priority(b));
    for (const p of sorted) {
      const s = p.star;
      const pr = priority(p);
      const show = pr < 2 || (pr < 3 && this.zoom > 0.6) || (pr < 4.3 && this.zoom > 1.8) || this.zoom > 3.2;
      let label = this.labels.get(s.id);
      if (!show) { label?.setVisible(false); continue; }
      if (!label) {
        label = this.add.bitmapText(0, 0, 'pixel', s.id === 'sol' ? 'SOL - EARTH' : s.id === HOME.star ? `${s.name} - HOMEWORLD` : s.name).setOrigin(0.5, 0)
          .setDropShadow(1, 1, PALETTE[25], 1);
        this.labels.set(s.id, label);
      }
      const r = radii.get(s.id) ?? 1;
      const rect = new Phaser.Geom.Rectangle(p.sx - label.width / 2 - 3, p.sy + r + 3, label.width + 6, 11);
      if (pr >= 2 && taken.some((t) => Phaser.Geom.Intersects.RectangleToRectangle(t, rect))) { label.setVisible(false); continue; }
      taken.push(rect);
      const found = this.discovered.has(s.id);
      label.setPosition(Math.round(p.sx), Math.round(p.sy + r + (this.selected?.id === s.id ? 9 : 5))).setVisible(true).setDepth(this.selected?.id === s.id ? 10 : 1)
        .setTint(this.selected?.id === s.id ? PALETTE[19] : s.beacon ? (this.d.lit?.includes(s.id) ? PALETTE[18] : PALETTE[11]) : found ? PALETTE[21] : PALETTE[22]);
    }
  }
}
