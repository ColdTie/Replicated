// Save layer. CloudStore talks to Supabase (family galaxy, RLS); LocalStore keeps the same shapes in
// localStorage for offline play, screenshots and development (?local).
import type { SupabaseClient } from '@supabase/supabase-js';
import { HOME, KNOWN_STARS } from '../core/home';
import { BACKEND, MIND, PLAYER } from '../core/data';
import { PARTS } from '../core/body';
import TRAVEL from '../data/travel.json';
import { distanceLy, travelMs } from '../world/galaxy';

export interface Profile {
  id: string;
  name: string;
  kid_mode: boolean;
  feature_color: number;
  sort: number;
}

export interface ReplicantSave {
  id: string;
  profile_id: string | null;
  name: string;
  model: string;
  /** Traits schema v1 (see CLAUDE.md): look (body, feature, gear, trail, look), voice, mind (temperament, wants), state (awake, blank, weary, sleptAt, mods, sparks). */
  traits: {
    v?: number;
    awake?: boolean; feature?: number; mods?: string[]; gear?: number; trail?: number; sparks?: number; look?: string; voice?: Voice;
    /** handed over: the replicant whose Spark awakened this one as a player of its own */
    handedBy?: string;
    weary?: number; sleptAt?: number;
    /** born blank: grey, still, no name of its own until its first wake (the becoming) */
    blank?: boolean;
    /** composed from the parts kit (src/data/parts.json) */
    body?: Body;
    temperament?: Temperament;
    wants?: Want[];
    /** 0 empty .. 1 full (src/data/needs.json); rest is 1 - weary. They do not eat or drink. */
    needs?: { company: number; purpose: number };
    /** what the original handed it (gifts), by material */
    inventory?: Record<string, number>;
    tell?: { text: string; at: number };
    /** born with a Spark beside an older copy: it carries that copy's notes and remembers being it (drift.json spark) */
    inherit?: { from: string; name: string; wants?: string[] };
    /** what the vessel's hold carries between worlds (supplies.json signature): set at launch, unloaded on landing */
    cargo?: { material: string; n: number; from: string } | null;
    /** a culture of Cems in the ship's hold (src/entities/Bioworks.ts): taken on launching from a world whose bed is
     * awake ('star:planet', when); on a world without a bed it seeds one. strain: the Biolab's changed strain
     * (bioworks.json strain), which every bed it reaches takes up */
    culture?: { from: string; at: number; strain?: string } | null;
    /** wild Cems from the Cems' world in the hold (src/entities/WildCems.ts): a Biolab changes them into a strain */
    wild?: { from: string; at: number } | null;
    /** the original's mannies (manny.json), one per world ('star:planet'): when it was built, and where it stands
     * while you are elsewhere (no x / y: in its dock) */
    mannies?: Record<string, { at: number; x?: number; y?: number }>;
    /** while you drive a manny: where your own body waits aboard the vessel, a world or a flight that goes on
     * without you (star / planet: where the vessel is, or will land) */
    ship?: { star: string; planet: number; journey?: Journey } | null;
    /** Thales, the first Vessel (src/data/homeworld.json): a fixed character with a mind, never handed over or held */
    thales?: boolean;
    /** held asleep by its maker for a new player (wake or hold at the Replicator); it has no mind until handed over */
    held?: boolean;
    /** a player's Vessel that has not named itself yet: it does at its first wake */
    unnamed?: boolean;
  };
  stats?: Partial<Record<'speed' | 'light' | 'gather', number>>;
  parent_id?: string | null;
  generation?: number;
  status?: 'active' | 'npc' | 'in_transit';
  star_id: string;
  planet_index: number;
  pos_x: number | null;
  pos_y: number | null;
}

export interface NodeState { hits: number; at: number }
/** A built thing on a planet: the Replicator, or something a copy raised (by = its replicant id, tint = palette index, variant = sprite frame). */
export interface StructureSave { type: string; x: number; y: number; at: number; by?: string; tint?: number; variant?: number }
export interface DoorState { open: boolean; taken?: boolean }
/** One copy's wake while nobody played (the mind function's away run): queued on its planet for the game. */
export interface AwayItem { id: string; name: string; at: number; song?: string; actions?: MindAction[]; became?: boolean }

/** A granted request: `count` builds of `type` (a village project) credited to `by`, placed on open ground near
 * `near` ("building:<name>" beside a building's front, "home" for the copy's lot, "square" for the town square), in a
 * ring of radius `ring` px when given; `request` is the requests row it answers. */
export interface Gift { id: string; type: string; by: string; count?: number; near?: string; ring?: number; request?: string; why?: string }

export interface PlanetData {
  /** "EARTH - SOL" and the biome's words, kept for the minds' away wakes */
  label?: string; biome?: string;
  /** what the copies did in their away wakes, until the game takes it (take_mind_queue) */
  awayQueue?: AwayItem[];
  nodes?: Record<string, NodeState>;
  /** Ruin doors by index: opened with a core, reward taken */
  doors?: Record<string, DoorState>;
  /** When the copies' offline gathering was last counted (ms epoch) */
  npcTick?: number;
  structures?: StructureSave[];
  /** The copies' shared building effort not yet spent */
  village?: { work: number };
  /** Beacon worlds: the monolith was lit (its keeper beaten) */
  beacon?: { lit: boolean; at: number; by?: string };
  /** Trees the copies cut down (indexes into the generated props) */
  felled?: number[];
  /** The underground base the copies design and dig (src/world/warren.ts) */
  warren?: WarrenData;
  /** The planet's materials (src/data/supplies.json): stone, soil, wood, scrap; Ember is `embers` */
  supplies?: Record<string, number>;
  /** Surface buildings the copies designed (src/entities/Buildings.ts) */
  buildings?: Building[];
  /** the homeworld's Metanoia structures and Replicator were placed (src/scenes/planet/Homeworld.ts) */
  founded?: boolean;
  /** a Cem bed seeded here from a culture the ship brought (src/entities/Bioworks.ts): when, by whom, from where */
  cembed?: { at: number; by?: string; from?: string; strain?: string };
  /** Layout version of the surface: 2 = the town (src/world/town.ts); missing = the old ring around the base, moved
   * into the town once on load (migrateToTown) */
  layout?: number;
  /** What the original granted a copy (written from outside the game when Steve says yes to a request): placed as
   * builds credited to the copy on the next load, then removed */
  gifts?: Gift[];
  /** Who lives where in the town: copy id -> lot index, building id -> lot index (indexes into the town's lots) */
  town?: { lots: Record<string, number>; civic: Record<string, number> };
  /** What the original saw here last (src/scenes/planet/Homecoming.ts): on the next landing what changed is shown */
  seen?: SeenState;
}

/** A snapshot of the village as the original last saw it. */
export interface SeenState {
  at: number;
  /** village builds as "type|x|y" */
  builds: string[];
  /** building id -> share raised (1 = built) */
  buildings: Record<string, number>;
  /** dug warren room ids */
  rooms: string[];
  /** copy id -> "name|body" (body: it has chosen one) */
  copies: Record<string, string>;
}

/** One blueprint format for the warren's rooms and the surface buildings: a named footprint someone designed. */
export interface Blueprint {
  id: string; name: string;
  /** tiles: the warren grid for rooms, the planet grid for buildings */
  w: number; h: number;
  /** rooms: tile coords of the top-left; buildings: pixel coords of the foot center */
  x: number; y: number;
  /** replicant id of the designer ('' for the Entrance) */
  by: string; purpose?: string; at: number;
}
/** A room of the warren; link/dir = the room it hangs off and on which side. */
export interface WarrenRoom extends Blueprint {
  kind: string; size: 'small' | 'medium' | 'large';
  dug: boolean; link?: string; dir?: 'north' | 'south' | 'east' | 'west';
  /** improvements the copies made (supplies.json upgrade): 1 flagstones, 2 carved walls, 3 pillars */
  level?: number;
}
/** A surface building (design_building): a shared project that waits for the original's word, then rises. */
export interface Building extends Blueprint {
  material: string; roof: string; door: string; primary: string; secondary: string;
  approved: boolean; vetoed?: boolean; progress: number; built: boolean; helpers: string[];
  cost: Record<string, number>; paid: boolean;
  /** a shared building the village started on its own (buildings.json communal): hall, workshop, lookout */
  kind?: string;
  /** printed by the Cems from a design (src/data/designs.json): which one, when the print began and how long it takes
   * (ms); it rises with the clock, also while nobody plays */
  design?: string; printStart?: number; printMs?: number;
  /** a copy's blueprint the Cems print (where a bed is awake): it rises with the clock from printStart like a design */
  cems?: boolean;
}
/** Something placed in a room (tile coords); a resting station has `for` = the replicant it belongs to. */
export interface WarrenItem { id: string; kind: string; room: string; x: number; y: number; by: string; for?: string; note?: string; at: number; /** palette index the copy chose */ tint?: number; placement?: string }
export interface WarrenData {
  hatch?: { x: number; y: number }; rooms: WarrenRoom[]; items: WarrenItem[];
  /** the hole by the vessel: dug by the first copy (swings so far) */
  entrance?: { dug: boolean; swings: number };
  /** ruin index -> when it was last picked over for scrap (ms epoch) */
  scavenged?: Record<string, number>;
}
export interface PlanetSave {
  star_id: string;
  planet_index: number;
  seed: number;
  embers: number;
  data: PlanetData;
}

/** With fixed-length trips or the cruise on (travel.json), a ship still flying on an older, longer schedule arrives
 * when the same trip would now. */
function capJourney<J extends Journey>(j: J): J {
  if (TRAVEL.fixedSeconds <= 0 && !TRAVEL.cruise.enabled) return j;
  const cap = Date.parse(j.departs_at) + travelMs(distanceLy(j.from_star, j.to_star));
  return Date.parse(j.arrives_at) > cap ? { ...j, arrives_at: new Date(cap).toISOString() } : j;
}

export interface Journey {
  id: string;
  replicant_id: string;
  from_star: string;
  to_star: string;
  from_planet: number;  // planet_index left behind
  to_planet: number;    // planet_index the ship lands on
  departs_at: string; // ISO time
  arrives_at: string;
}

/** Every replicant in the galaxy, for the star map (who is where). */
export interface ReplicantSummary {
  id: string;
  name: string;
  profile_id: string | null;
  status: ReplicantSave['status'];
  star_id: string;
  planet_index: number;
  traits: ReplicantSave['traits'];
}

/** What the game tells a copy's mind when it wakes (the mind Edge Function). */
export interface MindContext {
  planet: string;
  biome: string;
  timeOfDay: string;
  weather: string;
  playerName: string;
  playerHere: boolean;
  embers: number;
  structures: Record<string, number>;
  here: string[];
  events: string[];
  /** replicant id -> seconds a letter takes to reach it (light speed) */
  delays: Record<string, number>;
  /** what this copy built, by kind */
  mine: Record<string, number>;
  /** trees standing near the base */
  treesNear: number;
  /** the warren, room by room, in words (src/world/warren.ts describeWarren); empty = nothing dug or planned */
  warren: string[];
  /** room names a copy may name in dig_room / furnish ("Entrance" first) */
  warrenRooms: string[];
  /** this copy has a resting station of its own */
  hasRest: boolean;
  /** no room left in the warren for another dig */
  warrenFull: boolean;
  /** where the copy is right now */
  where: 'surface' | 'warren';
  /** how long since it slept (no resting station: it never does) */
  weariness: 'rested' | 'tired' | 'weary';
  /** what is close to the copy right now, in words */
  around: string[];
  /** every few wakes: look over the notes and keep one line */
  reflect: boolean;
  /** born blank and not yet itself: this wake is the becoming */
  blank: boolean;
  /** the parts kit on offer (names), for the becoming */
  kit: { head: string[]; visor: string[]; torso: string[]; arms: string[]; legs: string[]; back: string[]; accessory: string[]; markings: string[]; headgear: string[]; colors: string[]; visors: string[]; visorLights: number[]; colorIndex: Record<string, number> };
  /** its goals so far, numbered */
  wants: string[];
  /** the planet's materials (ember = the pool) and what things cost */
  supplies: Record<string, number>;
  recipes: Record<string, Record<string, number | boolean>>;
  roomWood: Record<string, number>;
  hasWorkbench: boolean;
  entranceDug: boolean;
  /** what waits on what ("Hearth waits for 2 more wood") */
  shortages: string[];
  /** how it feels: low needs in words, and the mood they add up to */
  needs: string[];
  mood: 'content' | 'low' | 'bleak';
  /** the surface buildings in words, and the building kit */
  buildings: string[];
  buildingKit: { materials: string[]; roofs: string[]; doors: string[]; minFootprint: number[]; maxFootprint: number[]; perTile: Record<string, number> };
  /** gifts from the original it still holds */
  inventory: Record<string, number>;
  /** the original walked up to talk (said: what they just said, maybe nothing): a talk wake answers them */
  talk?: { said: string };
}
export interface Voice { instrument: string; mood: string; tempo: string }
export interface Body { head: string; visor: string; torso: string; arms: string; legs: string; back: string; headgear: number; primary: string; secondary: string; accent: string; accessory?: string; markings?: string }
export interface Temperament { pace: 'slow' | 'steady' | 'quick'; sociability: 'solitary' | 'friendly' | 'clingy'; work: 'builder' | 'wanderer' | 'balanced'; bedtime: 'early' | 'late' | 'even'; risk: 'careful' | 'bold' }
export interface Want { text: string; category: 'build' | 'explore' | 'tend' | 'make art' | 'care for others' | 'learn'; done: boolean; at: number }
export interface MindAction {
  type: 'note' | 'mail' | 'request' | 'rename' | 'look' | 'melody' | 'demolish' | 'cut' | 'dig' | 'furnish' | 'become' | 'wants' | 'building' | 'tell' | 'propose';
  body?: string; to?: string; toId?: string; delay?: number; kind?: string; detail?: string; name?: string; was?: string;
  /** dig: size, beside (room name), direction, purpose; furnish: room, item, forId (resting station owner) */
  size?: string; beside?: string; direction?: string; purpose?: string; room?: string; item?: string; forId?: string;
  /** become: the traits the copy chose for itself (merged over its row); wants: its goals */
  traits?: ReplicantSave['traits']; wants?: Want[];
  /** furnish: where in the room (wall, corner, center, beside) and the kit color it chose */
  placement?: string; color?: string;
  /** building: the blueprint */
  width?: number; height?: number; material?: string; roof?: string; door?: string; primary?: string; secondary?: string;
  /** melody: the voice chosen and the tune (scale degrees) */
  instrument?: string; mood?: string; tempo?: string; notes?: string;
  /** dig / furnish from an away wake: already on the saved warren (the mind function placed it), only tell of it; failed = it found no place */
  applied?: boolean; failed?: boolean;
  /** tell: when it was said (body = what the copy would tell the original) */
  at?: number;
}
/** reason 'budget': the day's budget for the minds is spent (mind.json budget); nobody wakes until tomorrow. */
export interface MindResult { skipped?: boolean; reason?: string; song?: string; actions?: MindAction[]; received?: { from: string; body: string }[]; error?: string }
export interface Note { replicant_id: string; body: string; created_at: string }
export interface Letter { id: string; from_replicant: string | null; to_replicant: string | null; body: string; sent_at: string; arrives_at: string; read_at?: string | null }
/** A copy's ask. kind 'change' is a proposal to change the game (migration 0012): detail its title, body "Why: ...",
 * "Area: ..." and the change itself; the maker answers in reply; 'vetoed' is the original's no. */
export interface Request { id?: string; replicant_id: string; kind: string; detail: string; status: string; created_at: string; body?: string; reply?: string | null; done_at?: string | null }
export interface Journal { notes: Note[]; mail: Letter[]; requests: Request[] }

/** The minds' heartbeat (migration 0014): failuresSinceOk counts the wakes in a row that failed since the last good one. */
export interface MindHealth { lastOkAt: string | null; failuresSinceOk: number; lastError: string | null; firstFailureAt: string | null }

export interface GameStore {
  readonly mode: 'cloud' | 'local';
  /** Wake a copy's mind (null when minds are not available). */
  mindTick(replicantId: string, ctx: MindContext): Promise<MindResult | null>;
  /** The notes, letters and requests of these replicants, newest first. */
  journal(ids: string[]): Promise<Journal>;
  listProfiles(): Promise<Profile[]>;
  createProfile(p: Omit<Profile, 'id'>): Promise<Profile>;
  /** The profile's active replicant, created on first play. */
  loadReplicant(profile: Profile): Promise<ReplicantSave>;
  saveReplicant(r: ReplicantSave): Promise<void>;
  /** Merges only these traits keys (and the position) into a copy's row, so a game opened earlier never undoes a
   * body, voice or name chosen since (migration 0009). */
  patchTraits(id: string, traits: Partial<ReplicantSave['traits']>, pos?: { x: number; y: number }): Promise<void>;
  loadPlanet(star: string, planetIndex: number, seed: number): Promise<PlanetSave>;
  /** Copies (NPC replicants) living on a planet. */
  listNpcs(star: string, planetIndex: number): Promise<ReplicantSave[]>;
  createReplicant(r: Omit<ReplicantSave, 'id'>): Promise<ReplicantSave>;
  /** Launch: records the journey and marks the replicant in transit. */
  startJourney(r: ReplicantSave, toStar: string, toPlanet: number, arrivesAt: Date): Promise<Journey>;
  /** The replicant's current journey, if it is in transit. */
  activeJourney(r: ReplicantSave): Promise<Journey | null>;
  /** Arrival: the replicant is now at the new star, and the family has discovered it. */
  completeJourney(r: ReplicantSave, j: Journey): Promise<void>;
  /** A star reached (a vessel landed there, with or without anyone aboard). */
  discover(star: string, by: string): Promise<void>;
  /** All journeys still flying (any family member), for the star map. */
  openJourneys(): Promise<Journey[]>;
  listReplicants(): Promise<ReplicantSummary[]>;
  discoveredStars(): Promise<string[]>;
  /** Stars whose beacon the family has lit. */
  litBeacons(): Promise<string[]>;
  /** Worlds the galaxy has a save for, the most recently changed first (the planet menu's RECENT). */
  visitedPlanets(): Promise<{ star: string; planet: number }[]>;
  /** A letter from one replicant to another (the original talking to a copy): arrives at once on the same star. */
  sendMessage(from: ReplicantSave, toId: string, body: string): Promise<void>;
  /** Takes (returns and clears) what the copies here did in their away wakes (migration 0010). */
  takeMindQueue(star: string, planetIndex: number): Promise<AwayItem[]>;
  /** The original says no to a copy's proposal to change the game, before the maker builds it. */
  vetoRequest(id: string): Promise<void>;
  /** What the minds have cost today in USD (migration 0013), or null where minds cost nothing (this device). */
  mindSpend(): Promise<number | null>;
  /** A Spark birth: the newest `limit` notes of one copy become the other's, with their dates. Returns how many. */
  inheritNotes(fromId: string, toId: string, limit: number): Promise<number>;
  /** Letters to this replicant that arrived after `since` (ISO), oldest first, at most `limit`. */
  lettersTo(id: string, since: string, limit: number): Promise<Letter[]>;
  /** How the minds are doing (migration 0014), or null where there are no real minds (this device) or it cannot be read. */
  mindHealth(): Promise<MindHealth | null>;
  /**
   * The handoff: a held Vessel is given to a new person. A new profile is made in its name and visor color and the
   * Vessel becomes that profile's (one row update); it wakes and names itself the first time it is played.
   */
  awaken(copy: ReplicantSave, giver: ReplicantSave): Promise<Profile>;
  /** A player's Vessel names itself (its first wake): the profile and the row take the name. */
  renameSelf(r: ReplicantSave, name: string): Promise<void>;
  /** Atomic: adds emberDelta to the shared pool, merges node states, replaces structures if given. */
  applyPlanetDelta(star: string, planetIndex: number, emberDelta: number, data: PlanetData): Promise<PlanetSave | null>;
  signOut(): Promise<void>;
}

/** What a held Vessel's row becomes when it is given to a new person: no longer held, not yet awake or named. */
const HANDED = (giver: ReplicantSave): Partial<ReplicantSave['traits']> => ({ held: false, awake: false, unnamed: true, handedBy: giver.id });

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

function newReplicant(profile: Profile): Omit<ReplicantSave, 'id'> {
  // a player's first replicant is composed from the kit's defaults in the profile's visor color
  return {
    profile_id: profile.id,
    name: profile.name,
    model: PLAYER.model,
    traits: { v: 1, awake: false, unnamed: true, feature: profile.feature_color, body: { ...PARTS.defaults } },
    star_id: HOME.star,
    planet_index: HOME.planet,
    pos_x: null,
    pos_y: null,
  };
}

// ---------------------------------------------------------------- local

interface LocalDb {
  profiles: Profile[];
  replicants: ReplicantSave[];
  planets: Record<string, PlanetSave>;
  journeys: Journey[];
  discovered: string[];
  notes: Note[];
  mail: Letter[];
  requests: Request[];
}

export class LocalStore implements GameStore {
  readonly mode = 'local' as const;
  private key = 'replicated.local.v1';
  private db: LocalDb;

  constructor(private persist = true) {
    let db: LocalDb | null = null;
    try { db = persist ? JSON.parse(localStorage.getItem(this.key) ?? 'null') : null; } catch { db = null; }
    this.db = { profiles: [], replicants: [], planets: {}, journeys: [], discovered: [...KNOWN_STARS], notes: [], mail: [], requests: [], ...(db ?? {}) };
  }

  /** No model on this device: a canned mind that still keeps notes and writes letters, so the game can be played
   * and tested offline. */
  async mindTick(replicantId: string, ctx: MindContext) {
    const me = this.db.replicants.find((r) => r.id === replicantId);
    if (!me) return null;
    const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
    const actions: MindAction[] = [];
    const now = Date.now();
    const tell = (text: string) => { me.traits.tell = { text, at: now }; actions.push({ type: 'tell', body: text, at: now }); };
    if (ctx.talk) {
      // the original walked up to talk: a moment to gather its words, then an answer (and nothing else)
      await new Promise((r) => setTimeout(r, 900));
      tell(ctx.talk.said ? pick(MIND.canned.answers) : pick(MIND.canned.tells));
      const received = this.db.mail.filter((m) => m.to_replicant === me.id && !m.read_at && Date.parse(m.arrives_at) <= now);
      for (const m of received) m.read_at = new Date(now).toISOString();
      this.flush();
      return { song: '', actions, received: [] };
    }
    if (ctx.blank) {
      // the becoming, canned: a body from the kit, a voice, a temperament, a couple of wants and a name
      const k = ctx.kit;
      const names = ['Ash', 'Wren', 'Pip', 'Moth', 'Ferro', 'Lark', 'Rime', 'Quill', 'Sable', 'Tin', 'Vale', 'Nock'];
      const traits: ReplicantSave['traits'] = {
        ...me.traits, blank: false,
        body: { head: pick(k.head), visor: pick(k.visor), torso: pick(k.torso), arms: pick(k.arms), legs: pick(k.legs), back: pick(k.back), accessory: pick(k.accessory), markings: pick(k.markings), headgear: Math.floor(Math.random() * k.headgear.length), primary: pick(k.colors), secondary: pick(k.colors), accent: pick(k.colors) },
        voice: { instrument: pick(['hum', 'bell', 'flute', 'glass', 'pluck', 'horn', 'chime']), mood: pick(['bright', 'soft', 'sad', 'dreamy', 'ancient']), tempo: pick(['slow', 'walking', 'quick']) },
        temperament: { pace: pick(['slow', 'steady', 'quick']), sociability: pick(['solitary', 'friendly', 'clingy']), work: pick(['builder', 'wanderer', 'balanced']), bedtime: pick(['early', 'late', 'even']), risk: pick(['careful', 'bold']) },
        wants: [{ text: pick(['A room of my own under the stone.', 'To see the far side of the island.', 'A garden that glows at night.']), category: pick(['build', 'explore', 'tend']), done: false, at: now }],
      };
      const vi = Math.floor(Math.random() * ctx.kit.visorLights.length);
      traits.feature = ctx.kit.visorLights[vi];
      traits.trail = ctx.kit.colorIndex[traits.body!.accent] ?? 10;
      traits.gear = traits.body!.headgear;
      const name = names.find((n) => !this.db.replicants.some((r) => r.name.toLowerCase() === n.toLowerCase())) ?? pick(names);
      me.traits = traits; me.name = name;
      actions.push({ type: 'become', traits, name });
      this.flush();
      return { song: 'I am here. I have chosen.', actions, received: [] };
    }
    if (Math.random() < 0.5) {
      const body = pick(MIND.canned.notes);
      this.db.notes.unshift({ replicant_id: me.id, body, created_at: new Date(now).toISOString() });
      actions.push({ type: 'note', body });
    }
    const others = this.db.replicants.filter((r) => r.id !== me.id);
    if (others.length && Math.random() < 0.5) {
      const to = pick(others);
      const delay = ctx.delays[to.id] ?? 0;
      const body = pick(MIND.canned.letters);
      this.db.mail.unshift({ id: uuid(), from_replicant: me.id, to_replicant: to.id, body, sent_at: new Date(now).toISOString(), arrives_at: new Date(now + delay * 1000).toISOString(), read_at: null });
      actions.push({ type: 'mail', to: to.name, toId: to.id, body, delay });
    }
    if (Math.random() < 0.4) {
      const tunes = ['0 2 4 7_ - 4 2 0__', '0 0 3 5__ 3 0 -2__', '4 2 0 - 4 2 0 - 7 5 4__', '0 1 2 3 4 5__ 4 3 2 1 0__'];
      const voice = { instrument: pick(['hum', 'bell', 'flute', 'glass', 'pluck', 'horn', 'chime']), mood: pick(['bright', 'soft', 'sad', 'dreamy', 'ancient']), tempo: pick(['slow', 'walking', 'quick']) };
      me.traits.voice = voice;
      actions.push({ type: 'melody', ...voice, notes: pick(tunes) });
    }
    if (ctx.treesNear > 0 && Math.random() < 0.25) actions.push({ type: 'cut' });
    else if (Object.keys(ctx.mine).length && Math.random() < 0.2) actions.push({ type: 'demolish', kind: 'any' });
    // the warren: dig a room now and then, and make sure of a resting station once something is dug
    const rooms = ctx.warrenRooms;
    if (!ctx.warrenFull && Math.random() < (rooms.length < 3 ? 0.6 : 0.2)) {
      const kinds = ['hall', 'rest', 'workshop', 'archive', 'garden', 'gallery'];
      const names: Record<string, string[]> = { hall: ['Hearth', 'Commons'], rest: ['Quiet', 'Dormitory'], workshop: ['Forge', 'Bench'], archive: ['Archive', 'Memory'], garden: ['Grove', 'Spore Garden'], gallery: ['Gallery', 'Long Wall'] };
      const kind = pick(kinds);
      actions.push({ type: 'dig', kind, name: pick(names[kind]), size: pick(['small', 'medium', 'medium', 'large']), beside: pick(rooms), direction: pick(['north', 'south', 'east', 'west']), purpose: 'A place of our own under the ground.' });
    } else if (!ctx.buildings.length && Math.random() < 0.5) {
      actions.push({ type: 'building', name: pick(['Watchtower', 'Lookout', 'Hall', 'Store']), purpose: 'A place above ground for all of us.', width: 3, height: 2, material: pick(['wood', 'stone']), roof: pick(['peaked', 'flat', 'dome']), door: 'south', primary: pick(['sand', 'silver', 'rust']), secondary: pick(['slate', 'plum', 'pine']) });
    } else if (rooms.length > 1 && Math.random() < 0.55) {
      const item = !ctx.hasRest ? 'rest' : pick(['lamp', 'bench', 'shelf', 'workbench', 'planter', 'mural', 'crate', 'rest']);
      actions.push({ type: 'furnish', room: pick(rooms.slice(1)), item, forId: item === 'rest' ? me.id : undefined, placement: pick(['', 'wall', 'corner', 'center']), color: pick(['', 'cyan', 'gold', 'moss', 'plum']) });
    }
    tell(pick(MIND.canned.tells));
    const received = this.db.mail.filter((m) => m.to_replicant === me.id && !m.read_at && Date.parse(m.arrives_at) <= now);
    for (const m of received) m.read_at = new Date(now).toISOString();
    this.flush();
    const nameOf = (id: string | null) => this.db.replicants.find((r) => r.id === id)?.name ?? 'someone';
    return { song: pick(MIND.canned.songs), actions, received: received.map((m) => ({ from: nameOf(m.from_replicant), body: m.body })) };
  }

  async sendMessage(from: ReplicantSave, toId: string, body: string) {
    this.db.mail.unshift({ id: uuid(), from_replicant: from.id, to_replicant: toId, body: body.slice(0, 500), sent_at: new Date().toISOString(), arrives_at: new Date().toISOString(), read_at: null });
    this.flush();
  }

  async journal(ids: string[]) {
    const has = (id: string | null) => !!id && ids.includes(id);
    return {
      notes: this.db.notes.filter((n) => has(n.replicant_id)),
      mail: this.db.mail.filter((m) => has(m.from_replicant) || has(m.to_replicant)),
      requests: this.db.requests.filter((r) => has(r.replicant_id)),
    };
  }

  private flush() {
    if (!this.persist) return;
    try { localStorage.setItem(this.key, JSON.stringify(this.db)); } catch { /* storage full or blocked */ }
  }

  async listProfiles() { return [...this.db.profiles].sort((a, b) => a.sort - b.sort); }

  async createProfile(p: Omit<Profile, 'id'>) {
    const profile = { ...p, id: uuid() };
    this.db.profiles.push(profile);
    this.flush();
    return profile;
  }

  async loadReplicant(profile: Profile) {
    let r = this.db.replicants.find((x) => x.profile_id === profile.id);
    if (!r) {
      r = { id: uuid(), ...newReplicant(profile) };
      this.db.replicants.push(r);
      this.flush();
    }
    return { ...r, traits: { ...r.traits } };
  }

  async startJourney(r: ReplicantSave, toStar: string, toPlanet: number, arrivesAt: Date) {
    const j: Journey = {
      id: uuid(), replicant_id: r.id, from_star: r.star_id, to_star: toStar, from_planet: r.planet_index, to_planet: toPlanet,
      departs_at: new Date().toISOString(), arrives_at: arrivesAt.toISOString(),
    };
    this.db.journeys.push(j);
    r.status = 'in_transit';
    await this.saveReplicant(r);
    return { ...j };
  }

  async activeJourney(r: ReplicantSave) {
    if (r.status !== 'in_transit') return null;
    const j = this.db.journeys.filter((x) => x.replicant_id === r.id).sort((a, b) => b.departs_at.localeCompare(a.departs_at))[0];
    return j ? capJourney({ ...j }) : null;
  }

  async completeJourney(r: ReplicantSave, j: Journey) {
    r.status = 'active';
    r.star_id = j.to_star;
    r.planet_index = j.to_planet;
    r.pos_x = null; r.pos_y = null;
    await this.saveReplicant(r);
    await this.discover(j.to_star);
  }

  async discover(star: string) {
    if (!this.db.discovered.includes(star)) this.db.discovered.push(star);
    this.flush();
  }

  async openJourneys() {
    const flying = new Set(this.db.replicants.filter((r) => r.status === 'in_transit').map((r) => r.id));
    return this.db.journeys.filter((j) => flying.has(j.replicant_id)).map((j) => capJourney({ ...j }));
  }

  async listReplicants() {
    return this.db.replicants.map((r) => ({ id: r.id, name: r.name, profile_id: r.profile_id, status: r.status ?? 'active', star_id: r.star_id, planet_index: r.planet_index, traits: { ...r.traits } }));
  }

  async discoveredStars() { return [...this.db.discovered]; }
  async litBeacons() { return Object.values(this.db.planets).filter((p) => p.data.beacon?.lit).map((p) => p.star_id); }

  async visitedPlanets() { return Object.values(this.db.planets).reverse().map((p) => ({ star: p.star_id, planet: p.planet_index })); }

  async listNpcs(star: string, planetIndex: number) {
    return this.db.replicants.filter((r) => r.status === 'npc' && r.star_id === star && r.planet_index === planetIndex)
      .map((r) => structuredClone(r));
  }

  async createReplicant(r: Omit<ReplicantSave, 'id'>) {
    const row = { ...structuredClone(r), id: uuid() };
    this.db.replicants.push(row);
    this.flush();
    return structuredClone(row);
  }

  async patchTraits(id: string, traits: Partial<ReplicantSave['traits']>, pos?: { x: number; y: number }) {
    const r = this.db.replicants.find((x) => x.id === id);
    if (!r) return;
    r.traits = { ...r.traits, ...traits };
    if (pos) { r.pos_x = Math.round(pos.x); r.pos_y = Math.round(pos.y); }
    this.flush();
  }

  async saveReplicant(r: ReplicantSave) {
    const i = this.db.replicants.findIndex((x) => x.id === r.id);
    if (i >= 0) this.db.replicants[i] = { ...r };
    else this.db.replicants.push({ ...r });
    this.flush();
  }

  async loadPlanet(star: string, planetIndex: number, seed: number) {
    const k = `${star}:${planetIndex}`;
    this.db.planets[k] ??= { star_id: star, planet_index: planetIndex, seed, embers: 0, data: {} };
    return structuredClone(this.db.planets[k]);
  }

  async applyPlanetDelta(star: string, planetIndex: number, emberDelta: number, data: PlanetData) {
    const k = `${star}:${planetIndex}`;
    const cur = this.db.planets[k];
    if (!cur) return null;
    cur.embers = Math.max(0, cur.embers + emberDelta);
    if (data.nodes) cur.data.nodes = { ...(cur.data.nodes ?? {}), ...data.nodes };
    if (data.doors) cur.data.doors = { ...(cur.data.doors ?? {}), ...data.doors };
    // every other top-level key replaces the stored value (same as the apply_planet_delta RPC)
    for (const [k, v] of Object.entries(data)) if (k !== 'nodes' && k !== 'doors' && v !== undefined) (cur.data as Record<string, unknown>)[k] = v;
    this.flush();
    return structuredClone(cur);
  }

  async mindSpend() { return null; }

  async inheritNotes(fromId: string, toId: string, limit: number) {
    const mine = this.db.notes.filter((n) => n.replicant_id === fromId).slice(0, limit);
    this.db.notes.push(...mine.map((n) => ({ ...n, replicant_id: toId })));
    this.db.notes.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    this.flush();
    return mine.length;
  }

  async lettersTo(id: string, since: string, limit: number) {
    const now = Date.now(), from = Date.parse(since);
    return this.db.mail.filter((m) => m.to_replicant === id && Date.parse(m.arrives_at) > from && Date.parse(m.arrives_at) <= now)
      .sort((a, b) => Date.parse(a.arrives_at) - Date.parse(b.arrives_at)).slice(0, limit).map((m) => ({ ...m }));
  }
  async mindHealth() { return null; }

  async vetoRequest(id: string) {
    const r = this.db.requests.find((x) => x.id === id && x.status === 'open');
    if (r) { r.status = 'vetoed'; r.done_at = new Date().toISOString(); this.flush(); }
  }

  async takeMindQueue(star: string, planetIndex: number) {
    const cur = this.db.planets[`${star}:${planetIndex}`];
    const q = cur?.data.awayQueue ?? [];
    if (cur?.data.awayQueue) { delete cur.data.awayQueue; this.flush(); }
    return structuredClone(q);
  }

  async awaken(copy: ReplicantSave, giver: ReplicantSave) {
    const profile = await this.createProfile({ name: copy.name, kid_mode: false, feature_color: copy.traits.feature ?? 10, sort: this.db.profiles.length });
    const r = this.db.replicants.find((x) => x.id === copy.id);
    if (r) { r.status = 'active'; r.profile_id = profile.id; r.traits = { ...r.traits, ...HANDED(giver) }; }
    this.flush();
    return profile;
  }

  async renameSelf(r: ReplicantSave, name: string) {
    const row = this.db.replicants.find((x) => x.id === r.id);
    if (row) { row.name = name; row.traits = { ...row.traits, unnamed: false }; }
    const p = this.db.profiles.find((x) => x.id === r.profile_id);
    if (p) p.name = name;
    this.flush();
  }

  async signOut() { /* nothing to sign out of */ }
}

// ---------------------------------------------------------------- cloud

const REPLICANT_COLS = 'id,profile_id,parent_id,generation,name,model,traits,stats,status,star_id,planet_index,pos_x,pos_y';
const JOURNEY_COLS = 'id,replicant_id,from_star,to_star,from_planet,to_planet,departs_at,arrives_at';

let clientPromise: Promise<SupabaseClient> | null = null;

/** Supabase client, loaded on demand so the game boots without waiting for it. */
export function supabase(): Promise<SupabaseClient> {
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(BACKEND.url, BACKEND.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'replicated.auth' },
    }));
  return clientPromise;
}

export async function currentSession() {
  const sb = await supabase();
  const { data } = await sb.auth.getSession();
  return data.session;
}

export async function signIn(email: string, password: string) {
  const sb = await supabase();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/** Returns true when the account needs email confirmation before it can sign in. */
export async function signUp(email: string, password: string) {
  const sb = await supabase();
  const { data, error } = await sb.auth.signUp({
    email, password, options: { emailRedirectTo: location.origin + location.pathname },
  });
  if (error) throw error;
  return !data.session;
}

export class CloudStore implements GameStore {
  readonly mode = 'cloud' as const;

  private constructor(private sb: SupabaseClient, readonly galaxyId: string) {}

  static async open(): Promise<CloudStore> {
    const sb = await supabase();
    const { data, error } = await sb.rpc('ensure_family_galaxy');
    if (error) throw error;
    return new CloudStore(sb, data as string);
  }

  async listProfiles() {
    const { data, error } = await this.sb.from('profiles').select('id,name,kid_mode,feature_color,sort').order('sort').order('created_at');
    if (error) throw error;
    return data as Profile[];
  }

  async createProfile(p: Omit<Profile, 'id'>) {
    const { data, error } = await this.sb.from('profiles').insert({ ...p, galaxy_id: this.galaxyId }).select('id,name,kid_mode,feature_color,sort').single();
    if (error) throw error;
    return data as Profile;
  }

  async loadReplicant(profile: Profile) {
    const cols = REPLICANT_COLS;
    const { data, error } = await this.sb.from('replicants').select(cols).eq('profile_id', profile.id).neq('status', 'npc').order('created_at').limit(1);
    if (error) throw error;
    if (data.length) return data[0] as ReplicantSave;
    const ins = await this.sb.from('replicants').insert({ ...newReplicant(profile), galaxy_id: this.galaxyId }).select(cols).single();
    if (ins.error) throw ins.error;
    return ins.data as ReplicantSave;
  }

  async listNpcs(star: string, planetIndex: number) {
    const { data, error } = await this.sb.from('replicants').select(REPLICANT_COLS)
      .eq('status', 'npc').eq('star_id', star).eq('planet_index', planetIndex).order('created_at');
    if (error) throw error;
    return data as ReplicantSave[];
  }

  async createReplicant(r: Omit<ReplicantSave, 'id'>) {
    const { data, error } = await this.sb.from('replicants').insert({ ...r, galaxy_id: this.galaxyId }).select(REPLICANT_COLS).single();
    if (error) throw error;
    return data as ReplicantSave;
  }

  async startJourney(r: ReplicantSave, toStar: string, toPlanet: number, arrivesAt: Date) {
    const { data, error } = await this.sb.from('journeys').insert({
      galaxy_id: this.galaxyId, replicant_id: r.id, from_star: r.star_id, to_star: toStar, from_planet: r.planet_index, to_planet: toPlanet,
      arrives_at: arrivesAt.toISOString(),
    }).select(JOURNEY_COLS).single();
    if (error) throw error;
    r.status = 'in_transit';
    await this.saveReplicant(r);
    return data as Journey;
  }

  async activeJourney(r: ReplicantSave) {
    if (r.status !== 'in_transit') return null;
    const { data, error } = await this.sb.from('journeys').select(JOURNEY_COLS)
      .eq('replicant_id', r.id).order('departs_at', { ascending: false }).limit(1);
    if (error) throw error;
    const j = data[0] as Journey | undefined;
    return j ? capJourney(j) : null;
  }

  async completeJourney(r: ReplicantSave, j: Journey) {
    r.status = 'active';
    r.star_id = j.to_star;
    r.planet_index = j.to_planet;
    r.pos_x = null; r.pos_y = null;
    await this.saveReplicant(r);
    await this.discover(j.to_star, r.id);
  }

  async discover(star: string, by: string) {
    const { error } = await this.sb.from('discovered_stars')
      .upsert({ galaxy_id: this.galaxyId, star_id: star, discovered_by: by }, { onConflict: 'galaxy_id,star_id', ignoreDuplicates: true });
    if (error) throw error;
  }

  async openJourneys() {
    const { data, error } = await this.sb.from('journeys')
      .select(`${JOURNEY_COLS},replicants!inner(status)`)
      .eq('replicants.status', 'in_transit');
    if (error) throw error;
    return (data as unknown as (Journey & { replicants: unknown })[]).map(({ replicants: _r, ...j }) => capJourney(j));
  }

  async listReplicants() {
    const { data, error } = await this.sb.from('replicants').select('id,name,profile_id,status,star_id,planet_index,traits');
    if (error) throw error;
    return data as ReplicantSummary[];
  }

  async discoveredStars() {
    const { data, error } = await this.sb.from('discovered_stars').select('star_id');
    if (error) throw error;
    return [...KNOWN_STARS, ...(data as { star_id: string }[]).map((d) => d.star_id)];
  }

  async litBeacons() {
    const { data, error } = await this.sb.from('planet_states').select('star_id').eq('data->beacon->>lit', 'true');
    if (error) throw error;
    return (data as { star_id: string }[]).map((d) => d.star_id);
  }

  async visitedPlanets() {
    const { data, error } = await this.sb.from('planet_states').select('star_id,planet_index').order('updated_at', { ascending: false }).limit(24);
    if (error) throw error;
    return (data as { star_id: string; planet_index: number }[]).map((d) => ({ star: d.star_id, planet: d.planet_index }));
  }

  async saveReplicant(r: ReplicantSave) {
    const { error } = await this.sb.from('replicants').update({
      status: r.status ?? 'active',
      traits: r.traits, star_id: r.star_id, planet_index: r.planet_index, pos_x: r.pos_x, pos_y: r.pos_y, updated_at: new Date().toISOString(),
    }).eq('id', r.id);
    if (error) throw error;
  }

  async patchTraits(id: string, traits: Partial<ReplicantSave['traits']>, pos?: { x: number; y: number }) {
    const { error } = await this.sb.rpc('merge_replicant_traits', { p_id: id, p_traits: traits, p_pos_x: pos ? Math.round(pos.x) : null, p_pos_y: pos ? Math.round(pos.y) : null });
    if (error) throw error;
  }

  async loadPlanet(star: string, planetIndex: number, seed: number) {
    const cols = 'star_id,planet_index,seed,embers,data';
    const { data, error } = await this.sb.from('planet_states').select(cols).eq('star_id', star).eq('planet_index', planetIndex).maybeSingle();
    if (error) throw error;
    if (data) return data as PlanetSave;
    const ins = await this.sb.from('planet_states').upsert({ galaxy_id: this.galaxyId, star_id: star, planet_index: planetIndex, seed }).select(cols).single();
    if (ins.error) throw ins.error;
    return ins.data as PlanetSave;
  }

  async applyPlanetDelta(star: string, planetIndex: number, emberDelta: number, data: PlanetData) {
    const { data: row, error } = await this.sb.rpc('apply_planet_delta', {
      p_galaxy: this.galaxyId, p_star: star, p_index: planetIndex, p_embers: emberDelta, p_data: data,
    });
    if (error) throw error;
    return (row as PlanetSave[] | null)?.[0] ?? null;
  }

  async mindSpend() {
    const { data, error } = await this.sb.rpc('mind_spend_today', { p_galaxy: this.galaxyId });
    return error ? null : Number(data ?? 0);
  }

  async inheritNotes(fromId: string, toId: string, limit: number) {
    const { data, error } = await this.sb.from('notes').select('body,created_at').eq('replicant_id', fromId).order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    if (!data?.length) return 0;
    const { error: e } = await this.sb.from('notes').insert(data.map((n) => ({ galaxy_id: this.galaxyId, replicant_id: toId, body: n.body, created_at: n.created_at })));
    if (e) throw e;
    return data.length;
  }

  async lettersTo(id: string, since: string, limit: number) {
    const { data, error } = await this.sb.from('messages').select('id,from_replicant,to_replicant,body,sent_at,arrives_at,read_at')
      .eq('to_replicant', id).gt('arrives_at', since).lte('arrives_at', new Date().toISOString()).order('arrives_at').limit(limit);
    if (error) throw error;
    return (data ?? []) as Letter[];
  }

  async mindHealth() {
    const { data, error } = await this.sb.rpc('mind_health', { p_galaxy: this.galaxyId });
    if (error || !data) return null;
    const d = data as { last_ok_at: string | null; failures_since_ok: number; last_error: string | null; first_failure_at: string | null };
    return { lastOkAt: d.last_ok_at, failuresSinceOk: Number(d.failures_since_ok ?? 0), lastError: d.last_error, firstFailureAt: d.first_failure_at };
  }

  async vetoRequest(id: string) {
    const { error } = await this.sb.from('requests').update({ status: 'vetoed', done_at: new Date().toISOString() }).eq('id', id).eq('status', 'open');
    if (error) throw error;
  }

  async takeMindQueue(star: string, planetIndex: number) {
    const { data, error } = await this.sb.rpc('take_mind_queue', { p_galaxy: this.galaxyId, p_star: star, p_index: planetIndex });
    if (error) throw error;
    return (data ?? []) as AwayItem[];
  }

  async awaken(copy: ReplicantSave, giver: ReplicantSave) {
    const { count } = await this.sb.from('profiles').select('id', { count: 'exact', head: true });
    const profile = await this.createProfile({ name: copy.name, kid_mode: false, feature_color: copy.traits.feature ?? 10, sort: count ?? 9 });
    const { error } = await this.sb.from('replicants').update({ status: 'active', profile_id: profile.id, updated_at: new Date().toISOString() }).eq('id', copy.id);
    if (error) throw error;
    await this.patchTraits(copy.id, HANDED(giver));
    return profile;
  }

  async renameSelf(r: ReplicantSave, name: string) {
    const { error } = await this.sb.from('replicants').update({ name, updated_at: new Date().toISOString() }).eq('id', r.id);
    if (error) throw error;
    await this.patchTraits(r.id, { unnamed: false });
    if (r.profile_id) { const p = await this.sb.from('profiles').update({ name }).eq('id', r.profile_id); if (p.error) throw p.error; }
  }

  async mindTick(replicantId: string, ctx: MindContext) {
    // paused (mind.json paused): no call at all
    if (MIND.paused) return { skipped: true, reason: 'paused' } as MindResult;
    const { data, error } = await this.sb.functions.invoke('mind', { body: { replicant_id: replicantId, context: ctx } });
    if (error) { console.warn('mind', error); return null; }
    return data as MindResult;
  }

  async sendMessage(from: ReplicantSave, toId: string, body: string) {
    const { error } = await this.sb.from('messages').insert({ galaxy_id: this.galaxyId, from_replicant: from.id, to_replicant: toId, body: body.slice(0, 500), arrives_at: new Date().toISOString() });
    if (error) throw error;
  }

  async journal(ids: string[]) {
    if (!ids.length) return { notes: [], mail: [], requests: [] };
    const list = `(${ids.join(',')})`;
    const [n, m, r] = await Promise.all([
      this.sb.from('notes').select('replicant_id,body,created_at').in('replicant_id', ids).order('created_at', { ascending: false }).limit(60),
      this.sb.from('messages').select('id,from_replicant,to_replicant,body,sent_at,arrives_at,read_at').or(`from_replicant.in.${list},to_replicant.in.${list}`).order('sent_at', { ascending: false }).limit(60),
      this.sb.from('requests').select('id,replicant_id,kind,detail,status,created_at,body,reply,done_at').in('replicant_id', ids).order('created_at', { ascending: false }).limit(40),
    ]);
    return { notes: (n.data ?? []) as Note[], mail: (m.data ?? []) as Letter[], requests: (r.data ?? []) as Request[] };
  }

  async signOut() {
    await this.sb.auth.signOut();
  }
}
