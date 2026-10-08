// Composes a replicant body sheet (16x20, 14 frames) from the parts kit (src/data/parts.json) and a copy's
// choices. Pure: no Phaser, no JSON imports, so tools/body-preview.mjs can run it in Node and the game can
// turn the pixels into a texture (src/core/body.ts). Draw order: back piece, legs, torso, arms, head, visor,
// then a 1px dark outline around the figure; the visor pixel of each frame is reported for headgear.

export interface BodySpec {
  head: string; visor: string; torso: string; arms: string; legs: string; back: string;
  /** gear.json frame (0 = nothing) */
  headgear: number;
  /** named colors from parts.json colors */
  primary: string; secondary: string; accent: string;
  /** something carried or worn in front (satchel, sash, lantern...) and marks on the body; 'none' when absent */
  accessory?: string; markings?: string;
}

type RGB = [number, number, number];
interface Pose { bob: number; dx: number; arms: string; legs: string; back: string; hurt?: boolean }
export interface PartsKit {
  size: [number, number];
  animations: Record<string, { fps: number; frames: number[]; repeat?: number }>;
  poses: Pose[];
  colors: Record<string, number>;
  defaults: BodySpec;
  blank: BodySpec;
  head: { anchor: [number, number]; variants: Record<string, string[]> };
  visor: { variants: Record<string, string[]> };
  torso: { anchor: [number, number]; variants: Record<string, string[]> };
  arms: { shoulders: [number, number][]; poses: Record<string, [number, number][]>; variants: Record<string, { width: number; hand: number; color: string }> };
  legs: { hips: [number, number][]; poses: Record<string, [number, number][]>; variants: Record<string, { kind: string; width?: number; color?: string; stretch?: number; anchor?: [number, number]; rows?: string[]; roll?: boolean; float?: boolean }> };
  back: { variants: Record<string, { anchor: [number, number]; poses: Record<string, string[]> }> };
  accessory?: { variants: Record<string, { anchor?: [number, number]; hand?: boolean; offset?: [number, number]; rows: string[] }> };
  markings?: { variants: Record<string, [number, number, string][]> };
  /** grid chars with a fixed palette color */
  fixed?: Record<string, number>;
}

export interface RenderedBody {
  width: number; height: number; frames: number;
  data: Uint8ClampedArray<ArrayBuffer>;
  /** visor pixel (dark) per frame, for headgear placement */
  anchors: [number, number][];
}

const OUTLINE = 25;

/** A spec with every field valid for this kit (unknown picks fall back to the kit's defaults). */
export function normalizeSpec(kit: PartsKit, spec: Partial<BodySpec> | undefined, blank = false): BodySpec {
  const base = blank ? kit.blank : kit.defaults;
  const pick = (v: string | undefined, options: Record<string, unknown>, d: string) => (v && v in options ? v : d);
  const color = (v: string | undefined, d: string) => (v && !v.startsWith('_') && typeof kit.colors[v] === 'number' ? v : d);
  return {
    head: pick(spec?.head, kit.head.variants, base.head),
    visor: pick(spec?.visor, kit.visor.variants, base.visor),
    torso: pick(spec?.torso, kit.torso.variants, base.torso),
    arms: pick(spec?.arms, kit.arms.variants, base.arms),
    legs: pick(spec?.legs, kit.legs.variants, base.legs),
    back: pick(spec?.back, kit.back.variants, base.back),
    headgear: Math.max(0, Math.min(6, Math.floor(Number(spec?.headgear ?? base.headgear) || 0))),
    primary: color(spec?.primary, base.primary),
    secondary: color(spec?.secondary, base.secondary),
    accent: color(spec?.accent, base.accent),
    accessory: pick(spec?.accessory, kit.accessory?.variants ?? {}, base.accessory ?? 'none'),
    markings: pick(spec?.markings, kit.markings?.variants ?? {}, base.markings ?? 'none'),
  };
}

/** A short stable key for a spec + visor color (texture cache). */
export function bodyKey(spec: BodySpec, feature: [number, number]) {
  return `body:${spec.head}.${spec.visor}.${spec.torso}.${spec.arms}.${spec.legs}.${spec.back}.${spec.accessory ?? 'none'}.${spec.markings ?? 'none'}.${spec.primary}.${spec.secondary}.${spec.accent}.f${feature[0]}-${feature[1]}`;
}

export function renderBody(kit: PartsKit, spec: BodySpec, feature: [number, number], palette: RGB[]): RenderedBody {
  const [W, H] = kit.size;
  const n = kit.poses.length;
  const width = W * n;
  const data = new Uint8ClampedArray(width * H * 4);
  const anchors: [number, number][] = [];
  const colorOf: Record<string, number> = {
    ...(kit.fixed ?? {}),
    b: kit.colors[spec.primary], B: kit.colors[spec.secondary], c: kit.colors[spec.accent], k: 23,
    V: feature[0], v: feature[1], W: 19,
  };

  kit.poses.forEach((pose, fi) => {
    const ox = fi * W;
    const solid = new Uint8Array(W * H);           // 1 where a body pixel is
    const body = new Uint8Array(W * H);            // 1 where something other than the back piece is
    let drawingBack = true;
    const bodyOver = (x: number, y: number) => !!body[y * W + x];
    const put = (x: number, y: number, ch: string, hurt = false) => {
      if (ch === '.' || ch === ' ') return;
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      let c = ch;
      if (hurt && (c === 'v' || c === 'W')) c = 'V';
      const idx = colorOf[c];
      if (idx === undefined) return;
      const [r, g, b] = palette[idx];
      const i = ((y * width) + ox + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
      solid[y * W + x] = 1;
      if (!drawingBack) body[y * W + x] = 1;
    };
    const grid = (rows: string[], ax: number, ay: number, hurt = false) => {
      rows.forEach((row, ry) => { for (let rx = 0; rx < row.length; rx++) put(ax + rx, ay + ry, row[rx], hurt); });
    };
    const line = (x0: number, y0: number, x1: number, y1: number, w: number, ch: string) => {
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let s = 0; s <= steps; s++) {
        const x = Math.round(x0 + ((x1 - x0) * s) / steps), y = Math.round(y0 + ((y1 - y0) * s) / steps);
        for (let k = 0; k < w; k++) put(x + k, y, ch);
      }
    };
    const dx = pose.dx, bob = pose.bob;

    // back piece (behind everything), moves with the upper body
    const back = kit.back.variants[spec.back];
    if (back) {
      const rows = back.poses[pose.back] ?? back.poses.still ?? [];
      grid(rows, back.anchor[0] + dx, back.anchor[1] + bob);
    }
    // what the back piece covers, so markings stay on the body itself
    const backOnly = Uint8Array.from(solid);
    drawingBack = false;

    // legs: lines from hip to foot, or a block (treads roll, hover floats)
    const legs = kit.legs.variants[spec.legs];
    if (legs?.kind === 'legs') {
      const lp = kit.legs.poses[pose.legs] ?? kit.legs.poses.stand;
      kit.legs.hips.forEach(([hx, hy], li) => {
        const [fx, fy] = lp[li];
        const stretch = legs.stretch ?? 0;
        const w = legs.width ?? 1;
        line(hx + dx, hy, hx + dx + fx, hy + fy + stretch, w, legs.color ?? 'B');
        // foot
        for (let k = -1; k < w + 1; k++) put(hx + dx + fx + k, hy + fy + stretch, 'k');
      });
    } else if (legs?.kind === 'block' && legs.rows && legs.anchor) {
      const rows = legs.roll ? legs.rows.map((r, ri) => (ri === 1 || ri === 2 ? rotate(r, fi % 2) : r)) : legs.rows;
      const lift = legs.float ? (fi % 4 < 2 ? 0 : -1) : 0;
      grid(rows, legs.anchor[0] + dx, legs.anchor[1] + lift);
    }

    // torso
    const torso = kit.torso.variants[spec.torso];
    if (torso) grid(torso, kit.torso.anchor[0] + dx, kit.torso.anchor[1] + bob);

    // arms: a line from shoulder to hand, a hand pixel block at the end
    const arms = kit.arms.variants[spec.arms];
    if (arms && arms.width > 0) {
      const ap = kit.arms.poses[pose.arms] ?? kit.arms.poses.hang;
      kit.arms.shoulders.forEach(([sx, sy], ai) => {
        const [hx, hy] = ap[ai];
        line(sx + dx, sy + bob, sx + dx + hx, sy + bob + hy, arms.width, arms.color);
        for (let ky = 0; ky < arms.hand; ky++) for (let kx = 0; kx < arms.hand; kx++) put(sx + dx + hx + kx, sy + bob + hy + ky, 'k');
      });
    }

    // something carried or worn in front: at an anchor, or at the right hand of this pose
    const acc = kit.accessory?.variants[spec.accessory ?? 'none'];
    if (acc?.rows.length) {
      if (acc.hand && arms && arms.width > 0) {
        const ap = kit.arms.poses[pose.arms] ?? kit.arms.poses.hang;
        const [sx, sy] = kit.arms.shoulders[1], [hx, hy] = ap[1], [ox, oy] = acc.offset ?? [0, 0];
        grid(acc.rows, sx + dx + hx + ox, sy + bob + hy + oy);
      } else if (acc.anchor) grid(acc.rows, acc.anchor[0] + dx, acc.anchor[1] + bob);
    }

    // head and visor
    const head = kit.head.variants[spec.head];
    if (head) grid(head, kit.head.anchor[0] + dx, kit.head.anchor[1] + bob);
    const visor = kit.visor.variants[spec.visor];
    let anchor: [number, number] = [Math.floor(W / 2), 5 + bob];
    if (visor) {
      grid(visor, kit.head.anchor[0] + dx, kit.head.anchor[1] + bob, !!pose.hurt);
      outer: for (let ry = 0; ry < visor.length; ry++) for (let rx = 0; rx < visor[ry].length; rx++) {
        if (visor[ry][rx] === 'V') { anchor = [kit.head.anchor[0] + dx + rx, kit.head.anchor[1] + bob + ry]; break outer; }
      }
    }
    anchors.push(anchor);

    // markings: only where there is body
    for (const [mx, my, ch] of kit.markings?.variants[spec.markings ?? 'none'] ?? []) {
      const x = mx + dx, y = my + bob;
      if (x >= 0 && y >= 0 && x < W && y < H && solid[y * W + x] && !(backOnly[y * W + x] && !bodyOver(x, y))) put(x, y, ch);
    }

    // outline: every empty pixel touching the figure
    const [or, og, ob] = palette[OUTLINE];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (solid[y * W + x]) continue;
      const near = (x > 0 && solid[y * W + x - 1]) || (x < W - 1 && solid[y * W + x + 1]) || (y > 0 && solid[(y - 1) * W + x]) || (y < H - 1 && solid[(y + 1) * W + x]);
      if (!near) continue;
      const i = ((y * width) + ox + x) * 4;
      data[i] = or; data[i + 1] = og; data[i + 2] = ob; data[i + 3] = 255;
    }
  });
  return { width, height: H, frames: n, data, anchors };
}

function rotate(row: string, by: number) {
  return row.slice(by) + row.slice(0, by);
}
