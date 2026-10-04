// The star map: real nearby stars in 3D. Drag to turn it, pinch or scroll to zoom, tap a star to pick it.
// Opened from the vessel (launch mode) or from the ship while flying (look only).
import Phaser from 'phaser';
import { sound } from '../audio/Sound';
import { PALETTE } from '../core/data';
import { isKid, session } from '../core/session';
import type { Journey, ReplicantSummary } from '../net/store';
import { BEACONS, STAR_LIST, distanceLy, formatDuration, fuelFor, starById, travelMs, type Star } from '../world/galaxy';

export interface StarMapData {
  mode: 'launch' | 'view';
  from: string;          // star the ship is at (or flying from)
  embers?: number;       // fuel available (launch mode)
  journey?: Journey;     // the flight in progress (view mode)
  onLaunch?: (to: string) => void;
  onClose?: () => void;
}

const CLASS_COLOR: Record<string, number> = {
  O: 0x9bb0ff, B: 0xaabfff, A: 0xdfe8ff, F: 0xfaf6e8, G: 0xffeaa0, K: 0xffb46a, M: 0xff7a5a,
};

interface Projected { star: Star; sx: number; sy: number; depth: number; r: number }

export class StarMapScene extends Phaser.Scene {
  private d!: StarMapData;
  private g!: Phaser.GameObjects.Graphics;
  private yaw = 0.6;
  private pitch = 0.45;
  private zoom = 1;
  private center = { x: 0, y: 0, z: 0 };
  private selected: Star | null = null;
  private projected: Projected[] = [];
  private labels = new Map<string, Phaser.GameObjects.BitmapText>();
  private info!: Phaser.GameObjects.Container;
  private infoText!: Phaser.GameObjects.BitmapText;
  private launchBtn!: Phaser.GameObjects.Container;
  private dragging = false;
  private lastInputAt = 0;
  private pinchStart = 0;
  private zoomStart = 1;
  private discovered = new Set<string>(['sol']);
  private replicants: ReplicantSummary[] = [];
  private journeys: Journey[] = [];
  private t = 0;

  constructor() { super('starmap'); }

  init(d: StarMapData) {
    this.d = d;
    this.selected = null;
    this.labels = new Map();
    const s = starById(d.from) ?? STAR_LIST[0];
    this.center = { x: s.x, y: s.y, z: s.z };
    this.zoom = 1;
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

    // Info panel bottom left
    this.infoText = this.add.bitmapText(8, 0, 'pixel', '').setTint(PALETTE[20]);
    this.info = this.add.container(8, h - 46, [this.add.rectangle(0, 0, 220, 40, PALETTE[24], 0.75).setOrigin(0).setStrokeStyle(1, PALETTE[23]), this.infoText]);
    this.infoText.setPosition(6, 6);
    this.info.setVisible(false);

    // Launch button bottom right (launch mode)
    const ring = this.add.circle(0, 0, 24, PALETTE[24], 0.7).setStrokeStyle(2, PALETTE[9]);
    const core = this.add.circle(0, 0, 16, PALETTE[9], 0.5);
    const icon = this.add.image(0, 2, 'vessel', 0).setScale(0.75);
    this.launchBtn = this.add.container(w - 40, h - 40, [ring, core, icon]).setSize(56, 56).setVisible(false);
    this.launchBtn.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.launch());
    this.tweens.add({ targets: core, alpha: 0.2, duration: 700, yoyo: true, repeat: -1 });

    // Input: drag to rotate, tap to select, pinch / wheel to zoom
    let downAt = { x: 0, y: 0, t: 0 };
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.lastInputAt = this.time.now;
      if (this.pinching()) { this.pinchStart = this.pinchDistance(); this.zoomStart = this.zoom; return; }
      downAt = { x: p.x, y: p.y, t: this.time.now };
      this.dragging = true;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      this.lastInputAt = this.time.now;
      if (this.pinching()) {
        const d = this.pinchDistance();
        if (this.pinchStart > 0) this.zoom = Phaser.Math.Clamp(this.zoomStart * d / this.pinchStart, 0.35, 4);
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
      this.zoom = Phaser.Math.Clamp(this.zoom * (dy > 0 ? 0.9 : 1.1), 0.35, 4);
      this.lastInputAt = this.time.now;
    });
    this.input.keyboard?.on('keydown-ESC', () => this.close());

    // Who is where, what has been found, who is flying (best effort; the map works without it)
    const st = session.store;
    if (st) {
      st.discoveredStars().then((s) => s.forEach((id) => this.discovered.add(id))).catch(() => undefined);
      st.listReplicants().then((r) => (this.replicants = r)).catch(() => undefined);
      st.openJourneys().then((j) => {
        const latest = new Map<string, Journey>();
        for (const x of j) if (!latest.has(x.replicant_id) || latest.get(x.replicant_id)!.departs_at < x.departs_at) latest.set(x.replicant_id, x);
        this.journeys = [...latest.values()];
      }).catch(() => undefined);
    }
    if (this.d.journey) this.discovered.add(this.d.journey.from_star);

    // Title
    this.add.bitmapText(w / 2, 10, 'pixel', this.d.mode === 'launch' ? 'WHERE TO?' : 'STAR MAP').setOrigin(0.5, 0).setTint(PALETTE[21]);
    sound.coreHum();
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
    return { star: s, sx: w / 2 + x1 * scale * persp, sy: h / 2 - z2 * scale * persp, depth: y2, r: persp };
  }

  private tap(x: number, y: number) {
    const { width: w, height: h } = this.scale;
    if ((x > w - 70 && y > h - 70 && this.launchBtn.visible) || (x > w - 30 && y < 30)) return; // buttons
    let best: Projected | null = null, bd = 18;
    for (const p of this.projected) {
      const d = Math.hypot(p.sx - x, p.sy - y);
      if (d < bd) { bd = d; best = p; }
    }
    if (!best) return;
    this.selected = best.star.id === this.d.from ? null : best.star;
    sound.collect();
    this.updateInfo();
  }

  private canAfford(s: Star) {
    return (this.d.embers ?? 0) >= fuelFor(distanceLy(this.d.from, s.id));
  }

  private updateInfo() {
    const s = this.selected;
    this.info.setVisible(!!s);
    this.launchBtn.setVisible(!!s && this.d.mode === 'launch');
    if (!s) return;
    const ly = distanceLy(this.d.from, s.id);
    const fuel = fuelFor(ly);
    const lines = [s.name + (s.beacon ? '  - BEACON' : '')];
    if (!isKid()) {
      lines.push(`${ly.toFixed(1)} LIGHT YEARS - ${formatDuration(travelMs(ly))}`);
      if (this.d.mode === 'launch') lines.push(`FUEL ${fuel} OF ${this.d.embers ?? 0}`);
    } else {
      lines.push(formatDuration(travelMs(ly)));
    }
    this.infoText.setText(lines.join('\n'));
    const ok = this.d.mode !== 'launch' || this.canAfford(s);
    this.launchBtn.setAlpha(ok ? 1 : 0.35);
    (this.info.list[0] as Phaser.GameObjects.Rectangle).setSize(Math.max(160, this.infoText.width + 14), lines.length * 10 + 8);
    this.info.setY(this.scale.height - (lines.length * 10 + 8) - 6);
  }

  private launch() {
    const s = this.selected;
    if (!s || this.d.mode !== 'launch') return;
    if (!this.canAfford(s)) {
      sound.denied();
      this.tweens.add({ targets: this.launchBtn, x: this.launchBtn.x + 3, duration: 40, yoyo: true, repeat: 3 });
      return;
    }
    const cb = this.d.onLaunch;
    this.scene.stop();
    cb?.(s.id);
  }

  private close() {
    const cb = this.d.onClose;
    this.scene.stop();
    cb?.();
  }

  update(_time: number, dt: number) {
    this.t += dt / 1000;
    if (!this.dragging && this.time.now - this.lastInputAt > 2500) this.yaw += dt * 0.00008;
    const g = this.g;
    g.clear();

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
    if (this.selected && here) {
      const to = this.projected.find((p) => p.star.id === this.selected!.id)!;
      const ok = this.d.mode !== 'launch' || this.canAfford(this.selected);
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

    // Stars
    const settled = new Map<string, number>();
    for (const r of this.replicants) if (r.status !== 'in_transit') settled.set(r.star_id, (settled.get(r.star_id) ?? 0) + 1);
    for (const p of this.projected) {
      const s = p.star;
      const col = CLASS_COLOR[s.cls[0]] ?? 0xffffff;
      const giant = /III/.test(s.cls) || 'OBA'.includes(s.cls[0]);
      const found = this.discovered.has(s.id);
      const r = Math.max(1, (giant ? 2.4 : s.cls[0] === 'M' ? 1.2 : 1.8) * p.r * Math.min(1.6, 0.7 + this.zoom * 0.3));
      g.fillStyle(col, found ? 0.35 : 0.15).fillCircle(p.sx, p.sy, r * 2.4);
      g.fillStyle(col, found ? 1 : 0.6).fillCircle(p.sx, p.sy, r);
      if (s.beacon || BEACONS.includes(s.id)) {
        const pulse = 4 + Math.sin(this.t * 3) * 1.5;
        g.lineStyle(1, PALETTE[11], 0.9);
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
      if (s.id === this.d.from) {
        g.lineStyle(1, PALETTE[18], 0.9).strokeCircle(p.sx, p.sy, r + 7 + Math.sin(this.t * 4));
      }
      if (this.selected?.id === s.id) {
        g.lineStyle(1, PALETTE[19], 1).strokeRect(p.sx - r - 5, p.sy - r - 5, (r + 5) * 2, (r + 5) * 2);
      }
      // labels: home, here, beacons, selected, settled, and everything when zoomed in
      const show = s.id === 'sol' || s.id === this.d.from || s.beacon || this.selected?.id === s.id || people > 0 || this.zoom > 2.2;
      let label = this.labels.get(s.id);
      if (show) {
        if (!label) {
          label = this.add.bitmapText(0, 0, 'pixel', s.id === 'sol' ? 'SOL - HOME' : s.name).setOrigin(0.5, 0);
          this.labels.set(s.id, label);
        }
        label.setPosition(Math.round(p.sx), Math.round(p.sy + r + 5)).setVisible(true)
          .setTint(this.selected?.id === s.id ? PALETTE[19] : s.beacon ? PALETTE[11] : found ? PALETTE[21] : PALETTE[22]);
      } else label?.setVisible(false);
    }
  }
}
