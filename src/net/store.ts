// Save layer. CloudStore talks to Supabase (family galaxy, RLS); LocalStore keeps the same shapes in
// localStorage for offline play, screenshots and development (?local).
import type { SupabaseClient } from '@supabase/supabase-js';
import { BACKEND, MIND, PLAYER } from '../core/data';
import TRAVEL from '../data/travel.json';

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
  traits: { awake?: boolean; feature?: number; mods?: string[]; gear?: number; trail?: number; sparks?: number; look?: string; voice?: Voice };
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
export interface PlanetData {
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
}
export interface PlanetSave {
  star_id: string;
  planet_index: number;
  seed: number;
  embers: number;
  data: PlanetData;
}

/** With fixed-length trips on (travel.json fixedSeconds), ships already flying on the old real-time schedule arrive
 * that many seconds after they left too. */
function capJourney<J extends Journey>(j: J): J {
  if (!(TRAVEL.fixedSeconds > 0)) return j;
  const cap = Date.parse(j.departs_at) + TRAVEL.fixedSeconds * 1000;
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
}
export interface Voice { instrument: string; mood: string; tempo: string }
export interface MindAction {
  type: 'note' | 'mail' | 'request' | 'rename' | 'look' | 'melody' | 'demolish' | 'cut';
  body?: string; to?: string; toId?: string; delay?: number; kind?: string; detail?: string; name?: string;
  /** melody: the voice chosen and the tune (scale degrees) */
  instrument?: string; mood?: string; tempo?: string; notes?: string;
}
export interface MindResult { skipped?: boolean; song?: string; actions?: MindAction[]; received?: { from: string; body: string }[]; error?: string }
export interface Note { replicant_id: string; body: string; created_at: string }
export interface Letter { id: string; from_replicant: string | null; to_replicant: string | null; body: string; sent_at: string; arrives_at: string; read_at?: string | null }
export interface Request { replicant_id: string; kind: string; detail: string; status: string; created_at: string }
export interface Journal { notes: Note[]; mail: Letter[]; requests: Request[] }

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
  /** All journeys still flying (any family member), for the star map. */
  openJourneys(): Promise<Journey[]>;
  listReplicants(): Promise<ReplicantSummary[]>;
  discoveredStars(): Promise<string[]>;
  /** Stars whose beacon the family has lit. */
  litBeacons(): Promise<string[]>;
  /** Atomic: adds emberDelta to the shared pool, merges node states, replaces structures if given. */
  applyPlanetDelta(star: string, planetIndex: number, emberDelta: number, data: PlanetData): Promise<PlanetSave | null>;
  signOut(): Promise<void>;
}

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

function newReplicant(profile: Profile): Omit<ReplicantSave, 'id'> {
  return {
    profile_id: profile.id,
    name: profile.name,
    model: PLAYER.model,
    traits: { awake: false, feature: profile.feature_color },
    star_id: 'sol',
    planet_index: 3,
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
    this.db = { profiles: [], replicants: [], planets: {}, journeys: [], discovered: ['sol'], notes: [], mail: [], requests: [], ...(db ?? {}) };
  }

  /** No model on this device: a canned mind that still keeps notes and writes letters, so the game can be played
   * and tested offline. */
  async mindTick(replicantId: string, ctx: MindContext) {
    const me = this.db.replicants.find((r) => r.id === replicantId);
    if (!me) return null;
    const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
    const actions: MindAction[] = [];
    const now = Date.now();
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
    const received = this.db.mail.filter((m) => m.to_replicant === me.id && !m.read_at && Date.parse(m.arrives_at) <= now);
    for (const m of received) m.read_at = new Date(now).toISOString();
    this.flush();
    const nameOf = (id: string | null) => this.db.replicants.find((r) => r.id === id)?.name ?? 'someone';
    return { song: pick(MIND.canned.songs), actions, received: received.map((m) => ({ from: nameOf(m.from_replicant), body: m.body })) };
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
    if (!this.db.discovered.includes(j.to_star)) this.db.discovered.push(j.to_star);
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
    const { error } = await this.sb.from('discovered_stars')
      .upsert({ galaxy_id: this.galaxyId, star_id: j.to_star, discovered_by: r.id }, { onConflict: 'galaxy_id,star_id', ignoreDuplicates: true });
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
    return ['sol', ...(data as { star_id: string }[]).map((d) => d.star_id)];
  }

  async litBeacons() {
    const { data, error } = await this.sb.from('planet_states').select('star_id').eq('data->beacon->>lit', 'true');
    if (error) throw error;
    return (data as { star_id: string }[]).map((d) => d.star_id);
  }

  async saveReplicant(r: ReplicantSave) {
    const { error } = await this.sb.from('replicants').update({
      status: r.status ?? 'active',
      traits: r.traits, star_id: r.star_id, planet_index: r.planet_index, pos_x: r.pos_x, pos_y: r.pos_y, updated_at: new Date().toISOString(),
    }).eq('id', r.id);
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

  async mindTick(replicantId: string, ctx: MindContext) {
    const { data, error } = await this.sb.functions.invoke('mind', { body: { replicant_id: replicantId, context: ctx } });
    if (error) { console.warn('mind', error); return null; }
    return data as MindResult;
  }

  async journal(ids: string[]) {
    if (!ids.length) return { notes: [], mail: [], requests: [] };
    const list = `(${ids.join(',')})`;
    const [n, m, r] = await Promise.all([
      this.sb.from('notes').select('replicant_id,body,created_at').in('replicant_id', ids).order('created_at', { ascending: false }).limit(60),
      this.sb.from('messages').select('id,from_replicant,to_replicant,body,sent_at,arrives_at,read_at').or(`from_replicant.in.${list},to_replicant.in.${list}`).order('sent_at', { ascending: false }).limit(60),
      this.sb.from('requests').select('replicant_id,kind,detail,status,created_at').in('replicant_id', ids).order('created_at', { ascending: false }).limit(30),
    ]);
    return { notes: (n.data ?? []) as Note[], mail: (m.data ?? []) as Letter[], requests: (r.data ?? []) as Request[] };
  }

  async signOut() {
    await this.sb.auth.signOut();
  }
}
