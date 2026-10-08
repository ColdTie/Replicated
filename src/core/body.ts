// Bodies in the game: a replicant with traits.body gets a sheet composed from the parts kit at load time (cached
// per spec + visor color, animations registered under the same names as the hand-made sheets); one without keeps
// its hand-made model (tools/sprites/replicant.json and any model drawn for it). Player, Npc and the warren's
// walkers all go through bodyFor().
import Phaser from 'phaser';
import partsJson from '../data/parts.json';
import { featureTex, getManifest } from './assets';
import { PALETTE, PLAYER } from './data';
import type { ReplicantSave } from '../net/store';
import { bodyKey, normalizeSpec, renderBody, type BodySpec, type PartsKit } from './bodyRender';

export const PARTS = partsJson as unknown as PartsKit;
export type { BodySpec };

const RGB = PALETTE.map((c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255] as [number, number, number]);
const anchorsByKey = new Map<string, [number, number][]>();

/** The visor pair [dark, light] for a light index (the saved trait); grey for a blank copy. */
export function visorPair(featureLight: number | undefined): [number, number] {
  const pair = PLAYER.featureColors.find((f) => f[1] === featureLight) as [number, number] | undefined;
  return pair ?? (featureLight !== undefined ? [featureLight, featureLight] : [23, 22]);
}

/** Composes (once) and registers the sheet for this spec; returns its texture key. */
export function ensureBodyTexture(scene: Phaser.Scene, spec: Partial<BodySpec> | undefined, featureLight: number | undefined, blank = false): string {
  const s = normalizeSpec(PARTS, spec, blank);
  const pair = visorPair(featureLight);
  const key = bodyKey(s, pair) + (blank ? '.blank' : '');
  if (scene.textures.exists(key)) return key;
  const r = renderBody(PARTS, s, pair, RGB);
  const canvas = document.createElement('canvas');
  canvas.width = r.width; canvas.height = r.height;
  canvas.getContext('2d')!.putImageData(new ImageData(r.data, r.width, r.height), 0, 0);
  scene.textures.addSpriteSheet(key, canvas as unknown as HTMLImageElement, { frameWidth: PARTS.size[0], frameHeight: PARTS.size[1] });
  anchorsByKey.set(key, r.anchors);
  for (const [name, def] of Object.entries(PARTS.animations)) {
    const ak = `${key}:${name}`;
    if (!scene.anims.exists(ak)) scene.anims.create({ key: ak, frames: scene.anims.generateFrameNumbers(key, { frames: def.frames }), frameRate: def.fps, repeat: def.repeat ?? -1 });
  }
  return key;
}

export interface BodyLook {
  /** texture key with idle/walk/attack/hurt animations */
  key: string;
  /** visor pixel per frame (headgear follows it) */
  anchors: [number, number][];
  headY: number;
  /** the hand-made model this body is drawn from, if it is not composed */
  model: string;
}

/** What to draw for this replicant (composed body if it has one, else its model), in this visor color. */
export function bodyFor(scene: Phaser.Scene, data: ReplicantSave | undefined, featureLight?: number): BodyLook {
  const feature = featureLight ?? data?.traits.feature;
  if (data?.traits.body || data?.traits.blank) {
    const key = ensureBodyTexture(scene, data.traits.body, data.traits.blank ? undefined : feature, !!data.traits.blank);
    return { key, anchors: anchorsByKey.get(key) ?? [], headY: -9, model: 'parts' };
  }
  const modelId = (data?.model && data.model in PLAYER.models ? data.model : PLAYER.model) as keyof typeof PLAYER.models;
  const model = PLAYER.models[modelId];
  const key = featureTex(model.sprite, feature ?? PLAYER.feature[1]);
  return { key, anchors: getManifest().sprites[model.sprite]?.anchors ?? [], headY: model.headY, model: model.sprite };
}

/** Palette index of a named kit color (for trails, flags, murals). */
export function kitColor(name: string | undefined, fallback: number) {
  const v = name ? PARTS.colors[name] : undefined;
  return typeof v === 'number' ? v : fallback;
}
