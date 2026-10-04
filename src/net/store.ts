// Save layer. CloudStore talks to Supabase (family galaxy, RLS); LocalStore keeps the same shapes in
// localStorage for offline play, screenshots and development (?local).
import type { SupabaseClient } from '@supabase/supabase-js';
import { BACKEND, PLAYER } from '../core/data';

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
  traits: { awake?: boolean; feature?: number; mods?: string[]; gear?: number; trail?: number };
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
export interface StructureSave { type: string; x: number; y: number; at: number }
export interface DoorState { open: boolean; taken?: boolean }
export interface PlanetData {
  nodes?: Record<string, NodeState>;
  /** Ruin doors by index: opened with a core, reward taken */
  doors?: Record<string, DoorState>;
  /** When the copies' offline gathering was last counted (ms epoch) */
  npcTick?: number;
  structures?: StructureSave[];
}
export interface PlanetSave {
  star_id: string;
  planet_index: number;
  seed: number;
  embers: number;
  data: PlanetData;
}

export interface GameStore {
  readonly mode: 'cloud' | 'local';
  listProfiles(): Promise<Profile[]>;
  createProfile(p: Omit<Profile, 'id'>): Promise<Profile>;
  /** The profile's active replicant, created on first play. */
  loadReplicant(profile: Profile): Promise<ReplicantSave>;
  saveReplicant(r: ReplicantSave): Promise<void>;
  loadPlanet(star: string, planetIndex: number, seed: number): Promise<PlanetSave>;
  /** Copies (NPC replicants) living on a planet. */
  listNpcs(star: string, planetIndex: number): Promise<ReplicantSave[]>;
  createReplicant(r: Omit<ReplicantSave, 'id'>): Promise<ReplicantSave>;
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
}

export class LocalStore implements GameStore {
  readonly mode = 'local' as const;
  private key = 'replicated.local.v1';
  private db: LocalDb;

  constructor(private persist = true) {
    let db: LocalDb | null = null;
    try { db = persist ? JSON.parse(localStorage.getItem(this.key) ?? 'null') : null; } catch { db = null; }
    this.db = db ?? { profiles: [], replicants: [], planets: {} };
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
    if (data.npcTick !== undefined) cur.data.npcTick = data.npcTick;
    if (data.structures) cur.data.structures = data.structures;
    this.flush();
    return structuredClone(cur);
  }

  async signOut() { /* nothing to sign out of */ }
}

// ---------------------------------------------------------------- cloud

const REPLICANT_COLS = 'id,profile_id,parent_id,generation,name,model,traits,stats,status,star_id,planet_index,pos_x,pos_y';

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

  async saveReplicant(r: ReplicantSave) {
    const { error } = await this.sb.from('replicants').update({
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

  async signOut() {
    await this.sb.auth.signOut();
  }
}
