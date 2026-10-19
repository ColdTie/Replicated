// Helpers the planet scene and its parts share (src/scenes/planet/).
import { MIND, PLAYER } from '../../core/data';
import { PARTS } from '../../core/body';
import type { InputFrame } from '../../input/Controls';
import type { Npc } from '../../entities/Npc';
import type { Exchange } from '../../ui/talk';
import type { Journal, MindContext, MindHealth } from '../../net/store';

export const GEAR_NAMES = ['nothing', 'antennae', 'halo', 'horns', 'sprout', 'dish', 'crown', 'lit antennae'];

/** The parts kit as lists of names, for a blank copy's becoming (the mind picks from these). */
export function kitLists(): MindContext['kit'] {
  const names = (o: Record<string, unknown>) => Object.keys(o).filter((k) => !k.startsWith('_'));
  const colorIndex: Record<string, number> = {};
  for (const k of names(PARTS.colors)) colorIndex[k] = PARTS.colors[k];
  const colorName = (i: number) => names(PARTS.colors).find((k) => PARTS.colors[k] === i) ?? `color ${i}`;
  return {
    head: names(PARTS.head.variants), visor: names(PARTS.visor.variants), torso: names(PARTS.torso.variants), arms: names(PARTS.arms.variants),
    legs: names(PARTS.legs.variants), back: names(PARTS.back.variants), accessory: names(PARTS.accessory?.variants ?? {}), markings: names(PARTS.markings?.variants ?? {}), headgear: GEAR_NAMES, colors: names(PARTS.colors),
    visors: PLAYER.featureColors.map((f) => colorName(f[1])), visorLights: PLAYER.featureColors.map((f) => f[1]), colorIndex,
  };
}

/** An open talk with a copy: what it has loaded, what you said, what it is working on. */
export interface TalkSession {
  npc: Npc;
  /** your hp when it opened: a hit ends the talk */
  hp: number;
  name: string;
  journal: Journal | null;
  exchanges: Exchange[];
  /** a fresh word is being asked of its mind (requestTalk) */
  composing: boolean;
  /** what it told you since the box opened (requestTalk's answer, or traits.tell from a 'tell' event) */
  fresh: { text: string; at: number } | null;
  /** what it had to tell you when the box opened (kept when a reply's answer replaces traits.tell) */
  opening: { text: string; at: number } | null;
  /** close() of the reply input while it is open */
  reply: (() => void) | null;
}
/** A frame with nothing pressed: what the player gets while the talk box has the buttons. */
export const NO_INPUT: InputFrame = { x: 0, y: 0, attack: false, dash: false, interact: false, back: false, forward: false, cancel: false, reply: false };

/** The mind function answers a talk wake at most this often per copy (TALK_GAP_SECONDS there, plus a margin). */
export const TALK_GAP_MS = 16_000;

/** A world's name as prose shows it: "ALPHA CENTAURI B II" -> "Alpha Centauri B II", "tau-ceti" -> "Tau Ceti". */
export function placeName(s: string) {
  return s.replace(/-/g, ' ').split(' ').map((w) => (/^[IVX]+$/.test(w) || w.length <= 1 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())).join(' ');
}

/** The journal's warning when the latest wakes all failed (mind.json health), or undefined while the minds are well. */
export function quietMinds(h: MindHealth | null): { since: string; error: string } | undefined {
  if (!h || h.failuresSinceOk < MIND.health.quietAfter || !h.firstFailureAt) return undefined;
  const at = new Date(h.firstFailureAt);
  const time = at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const since = at.toDateString() === new Date().toDateString() ? time : `${at.toLocaleDateString([], { weekday: 'long' })} ${time}`;
  return { since, error: (h.lastError ?? 'no answer').slice(0, 140) };
}
