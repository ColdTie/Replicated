import Phaser from 'phaser';
import { sound } from '../../audio/Sound';
import { BUILDINGS, MIND, PALETTE, SUPPLIES, WARREN } from '../../core/data';
import { closeJournal, journalOpen, openJournal } from '../../ui/journal';
import TALK from '../../data/talk.json';
import { session } from '../../core/session';
import { Npc } from '../../entities/Npc';
import { allRooms, describeWarren, restOf } from '../../world/warren';
import { Spark } from '../../entities/Resources';
import type { AwayItem, MindContext, MindResult, ReplicantSummary } from '../../net/store';
import { distanceLy } from '../../world/galaxy';
import type { PlanetScene } from '../PlanetScene';
import { TALK_GAP_MS, kitLists, quietMinds } from './shared';

/**
 * The copies' minds and the journal: when each wakes, what it knows, what its wake brought, the chorus, and the
 * original's journal actions (talk, give, awaken).
 * Part of PlanetScene (src/scenes/PlanetScene.ts); `s` is the scene.
 */
export class Minds {
  constructor(readonly s: PlanetScene) {}

  // the copies' minds: when each wakes next, what happened since, who exists in the galaxy (for letters)
  nextWake = new Map<Npc, number>();
  lastWake = new Map<Npc, number>();
  wakeCount = new Map<Npc, number>();
  firstWakeAt?: number;
  mindBusy = false;
  /** talks waiting for their turn with a mind (ordinary wakes hold off meanwhile) */
  talkWaiting = 0;
  /** when each copy's mind was last called (the function answers a talk at most every TALK_GAP_MS) */
  lastMindCallAt = new Map<Npc, number>();
  mindLog: { t: number; text: string }[] = [];
  everyone: ReplicantSummary[] = [];
  chorusAt = Infinity;
  /** ms the minds have been running: advanced by this scene, and by the warren while the planet is paused */
  mindClock = 0;
  setupMinds() {
    const params = new URLSearchParams(location.search);
    const kb = this.s.input.keyboard;
    if (kb) {
      kb.addCapture('TAB');
      const toggle = () => void this.toggleJournal();
      kb.on('keydown-TAB', toggle);
      kb.on('keydown-I', toggle);
    }
    const onJournal = () => void this.toggleJournal();
    this.s.game.events.on('journal', onJournal);
    this.s.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.s.game.events.off('journal', onJournal); closeJournal(); });
    if (params.has('chorus')) this.s.time.delayedCall(2500, () => this.chorus(true));
    if (params.has('sing')) this.s.time.delayedCall(1500, () => this.s.npcs[0]?.sing(MIND.canned.songs[0], this.s.canHear()));
    if (this.s.shot || this.s.visit) return;
    const me = session.replicant;
    this.mindLog.push({ t: this.mindClock, text: `${me?.name ?? 'the original'} ${this.s.arrival ? 'landed here in the vessel' : 'is here'}` });
    this.chorusAt = this.mindClock + 30_000 + Math.random() * 40_000;
    session.store?.listReplicants().then((all) => { this.everyone = all; }).catch(() => undefined);
    // kept on the planet for the minds' away wakes; then whatever they did while nobody was here plays out
    this.s.pending.label = this.s.placeLabel;
    this.s.pending.biome = this.s.planet.subtitle ?? this.s.planet.id;
    const st = session.store;
    if (st && this.s.npcs.length) st.takeMindQueue(this.s.planet.star, this.s.planet.planetIndex)
      .then((q) => this.s.time.delayedCall(2500, () => this.replayAway(q))).catch((e) => console.warn('away queue', e));
  }

  /** What the copies did in their away wakes (the mind function, while nobody played), played out now. */
  replayAway(items: AwayItem[]) {
    if (!items?.length || this.s.stopped) return;
    const hear = this.s.canHear();
    let k = 0, proposals = 0;
    for (const it of [...items].sort((a, b) => a.at - b.at)) {
      const npc = this.s.npcs.find((n) => n.data.id === it.id);
      if (!npc) continue;
      const name = npc.data.name;
      const log = (text: string) => this.mindLog.push({ t: this.mindClock, text: `while you were away, ${text}` });
      if (it.became) log(`${it.name} became itself: it is ${name} now`);
      for (const a of it.actions ?? []) {
        const later = (ms: number, f: () => void) => this.s.time.delayedCall(ms, () => { if (this.s.npcs.includes(npc) && !npc.below) f(); });
        if (a.applied) {
          // the away wake put it on the saved warren itself (it loaded with the planet): only say so
          if (a.failed) continue;
          if (a.type === 'dig') log(`${name} marked out ${a.name ?? 'a room'} in the warren`);
          else if (a.type === 'furnish') log(a.item === 'rest' ? `${name} made a resting station${a.forId && a.forId !== npc.data.id ? ` for ${this.s.npcs.find((n) => n.data.id === a.forId)?.data.name ?? 'someone'}` : ''} in ${a.room ?? 'the warren'}` : `${name} put a ${a.item ?? 'thing'} in ${a.room ?? 'the warren'}`);
        }
        else if (a.type === 'dig') this.s.warren.dig(npc, a);
        else if (a.type === 'furnish') this.s.warren.furnish(npc, a);
        else if (a.type === 'building') this.s.buildings.propose(npc, a);
        else if (a.type === 'cut') later(5000 + k * 4000, () => this.cutTree(npc));
        else if (a.type === 'demolish') later(5000 + k * 4000, () => this.demolish(npc, a.kind ?? 'any'));
        else if (a.type === 'wants' && a.wants) npc.data.traits.wants = a.wants;
        else if (a.type === 'rename') log(`${a.was ?? 'a copy'} took the name ${a.name}`);
        else if (a.type === 'note') log(`${name} wrote itself a note`);
        else if (a.type === 'mail') log(`${name} wrote to ${a.to}`);
        else if (a.type === 'request') log(`${name} asked the original for ${a.kind}`);
        else if (a.type === 'propose') {
          log(`${name} read the code of the world and proposed a change to it: ${a.detail ?? 'something'}`);
          // after the "while you were away" notice, one at a time
          if (hear) this.s.time.delayedCall(4000 * ++proposals, () => this.s.game.events.emit('notice', `${name.toUpperCase()} PROPOSES A CHANGE TO THE GAME`));
        }
        else if (a.type === 'melody') log(`${name} found its voice on the ${a.instrument}`);
        else if (a.type === 'tell' && a.body) npc.data.traits.tell = { text: a.body, at: a.at ?? it.at };
      }
      if (it.song) {
        // sung once it is up here (it may be down in the warren when you land)
        const song = it.song, sing = (tries: number) => {
          if (!this.s.npcs.includes(npc)) return;
          if (npc.below && tries > 0) { this.s.time.delayedCall(3000, () => sing(tries - 1)); return; }
          if (!npc.below) npc.sing(song, hear);
        };
        this.s.time.delayedCall(8000 + k * 7000, () => sing(40));
      }
      // the pass's own entries (a room dug, a bed made) have no song and are not a wake
      if (it.song || it.became) k++;
    }
    if (k) this.s.game.events.emit('notice', `WHILE YOU WERE AWAY ${k} ${k === 1 ? 'COPY' : 'COPIES'} WOKE`);
  }

  /** What a copy knows when it wakes. */
  mindContext(npc: Npc): MindContext {
    const h = this.s.env.hourOfDay;
    const timeOfDay = h < 5 ? 'deep night' : h < 7 ? 'dawn' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 20 ? 'dusk' : 'night';
    const structures: Record<string, number> = {};
    for (const s of this.s.village.structures) structures[s.type] = (structures[s.type] ?? 0) + 1;
    const delays: Record<string, number> = {};
    for (const r of this.everyone) delays[r.id] = r.star_id === this.s.planet.star ? 0 : Math.round(distanceLy(this.s.planet.star, r.star_id) * MIND.mailSecondsPerLy);
    const since = this.lastWake.get(npc) ?? -1;
    const me = session.replicant;
    const mine: Record<string, number> = {};
    for (const s of this.s.village.structures) if (s.by === npc.data.id) mine[s.type] = (mine[s.type] ?? 0) + 1;
    const treesNear = this.s.treesNearBase(npc);
    const wd = this.s.warren.data;
    const nameOf = (id: string) => this.s.npcs.find((n) => n.data.id === id)?.data.name ?? this.everyone.find((r) => r.id === id)?.name ?? (id === me?.id ? me.name : 'someone');
    return {
      mine,
      treesNear,
      warren: describeWarren(wd, npc.data.id, nameOf),
      warrenRooms: allRooms(wd).map((r) => r.name),
      hasRest: !!restOf(wd, npc.data.id),
      warrenFull: wd.rooms.length >= WARREN.maxRooms,
      where: npc.below ? 'warren' : 'surface',
      weariness: npc.weariness,
      around: this.aroundNpc(npc),
      reflect: (this.wakeCount.get(npc) ?? 0) % 5 === 4,
      blank: !!npc.data.traits.blank,
      kit: kitLists(),
      supplies: { ...this.s.supplies, ember: this.s.embers },
      recipes: SUPPLIES.recipes,
      roomWood: SUPPLIES.roomWood,
      hasWorkbench: this.s.warren.hasWorkbench,
      entranceDug: this.s.warren.opened,
      shortages: [...this.s.warren.shortages(), ...this.s.buildings.shortages()],
      needs: npc.lowNeeds(),
      mood: npc.moodWord,
      buildings: this.s.buildings.describe(nameOf),
      buildingKit: { materials: Object.keys(BUILDINGS.materials), roofs: BUILDINGS.roofs, doors: BUILDINGS.doors, minFootprint: BUILDINGS.minFootprint, maxFootprint: BUILDINGS.maxFootprint, perTile: Object.fromEntries(Object.entries(BUILDINGS.materials).map(([k, v]) => [k, v.perTile])) },
      inventory: npc.data.traits.inventory ?? {},
      wants: (npc.data.traits.wants ?? []).map((w, i) => `${i + 1}. ${w.text} (${w.category}${w.done ? ', done' : ''})`),
      planet: this.s.placeLabel,
      biome: this.s.planet.subtitle ?? this.s.planet.id,
      timeOfDay,
      weather: this.s.env.isRaining ? 'raining' : 'dry',
      playerName: me?.name ?? 'the original',
      playerHere: !this.s.visit && !!me,
      embers: this.s.embers,
      structures,
      here: [...(me && !this.s.visit ? [me.name] : []), ...this.s.npcs.map((n) => n.data.name)],
      events: this.mindLog.filter((e) => e.t > since).map((e) => e.text),
      delays,
    };
  }

  /** What a copy can see from where it stands: the original, crystals, the hatch, its neighbours. */
  aroundNpc(npc: Npc): string[] {
    const out: string[] = [];
    const d = (p: { x: number; y: number }) => Math.hypot(p.x - npc.x, p.y - npc.y);
    if (npc.below) {
      const b = this.s.warren.below.get(npc);
      out.push(b?.task === 'dig' ? `the rock face of ${b.room?.name ?? 'a room'} you are digging` : b?.task === 'rest' ? 'your resting station' : b?.task === 'linger' && b.item ? `the ${b.item.kind} in ${this.s.warren.nameOfRoom(b.item.room)} you are resting by` : 'the warren around you');
      const others = [...this.s.warren.below.keys()].filter((n) => n !== npc);
      if (others.length) out.push(`${others.map((n) => n.data.name).join(' and ')} ${others.length > 1 ? 'are' : 'is'} down here too`);
      return out;
    }
    const me = session.replicant;
    if (me && !this.s.visit && this.s.player.alive) {
      const dp = d(this.s.player);
      if (dp < 40) out.push(`${me.name} stands right beside you`);
      else if (dp < 170) out.push(`${me.name} is near`);
    }
    for (const n of this.s.npcs) if (n !== npc && !n.below && d(n) < 48) out.push(`${n.data.name} is beside you`);
    const node = this.s.nodes.filter((n) => n.alive).sort((a, b) => d(a) - d(b))[0];
    if (node && d(node) < 120) out.push(d(node) < 30 ? 'a crystal within reach' : 'a crystal a few steps away');
    if (d(this.s.warren.hatch) < 70 && this.s.warren.data.rooms.length) out.push(this.s.warren.opened ? 'the hatch down to the warren' : 'the dig mark where the warren will begin');
    if (this.s.base.built && d(this.s.replicatorSpot) < 70) out.push('the Replicator');
    if (d(this.s.vesselPos) < 90) out.push('the vessel');
    const build = this.s.village.structures.filter((s) => s.type !== 'replicator').sort((a, b) => d(a) - d(b))[0];
    if (build && d(build) < 40) out.push(`a ${build.type}${build.by === npc.data.id ? ' you built' : ''}`);
    const sleeping = [...this.s.warren.below.values()].filter((b) => b.task === 'rest').map((b) => b.npc.data.name);
    if (sleeping.length) out.push(`${sleeping.join(' and ')} ${sleeping.length > 1 ? 'are' : 'is'} asleep in the warren`);
    return out;
  }

  /** Wake one copy: it reads, acts (notes, letters, requests, a new name) and sings. */
  async wake(npc: Npc) {
    const st = session.store;
    if (!st || this.mindBusy) return;
    this.mindBusy = true;
    this.wakeCount.set(npc, (this.wakeCount.get(npc) ?? 0) + 1);
    const t = this.mindClock;
    try {
      this.lastMindCallAt.set(npc, Date.now());
      const res = await st.mindTick(npc.data.id, this.mindContext(npc));
      this.lastWake.set(npc, t);
      if (res?.reason === 'budget') { this.mindsRest(); return; }
      if (!res || res.skipped || !this.s.npcs.includes(npc)) return;
      if (res.error) { console.warn('mind:', res.error); return; }
      this.applyMind(npc, res, false);
    } catch (e) {
      console.warn('mind:', e);
    } finally {
      this.mindBusy = false;
    }
  }

  /**
   * The original walked up to talk (and maybe said something, already sent as a letter): the copy's mind answers
   * now, through tell_original. Waits its turn behind a wake in flight; resolves with what the copy says, or null.
   */
  async requestTalk(npc: Npc, said = ''): Promise<string | null> {
    const st = session.store;
    if (!st || this.s.shot || this.s.visit || npc.data.id === 'pending' || npc.data.traits.blank) return null;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    // ordinary wakes wait while a talk waits for its turn
    this.talkWaiting++;
    try {
      for (let waited = 0; this.mindBusy && waited < 30_000; waited += 250) await sleep(250);
    } finally { this.talkWaiting--; }
    if (this.mindBusy || !this.s.npcs.includes(npc)) return null;
    this.mindBusy = true;
    try {
      // a word came meanwhile (another talk wake for it finished): nothing to ask
      const tell = npc.data.traits.tell;
      if (!said && tell && Date.now() - tell.at < TALK.staleMinutes * 60_000) return tell.text;
      for (let attempt = 0; attempt < 2; attempt++) {
        // the function answers a talk at most every TALK_GAP s per copy: wait out the rest of it
        const since = Date.now() - (this.lastMindCallAt.get(npc) ?? 0), gap = st.mode === 'local' ? 0 : TALK_GAP_MS;
        if (since < gap) await sleep(gap - since);
        if (!this.s.npcs.includes(npc)) return null;
        this.lastMindCallAt.set(npc, Date.now());
        const res = await st.mindTick(npc.data.id, { ...this.mindContext(npc), talk: { said } });
        if (res?.error) console.warn('mind:', res.error);
        if (res?.reason === 'budget') { this.mindsRest(); return null; }
        if (res?.skipped) continue;
        if (!res || res.error || !this.s.npcs.includes(npc)) return null;
        // it has just spoken: its next ordinary wake waits
        this.nextWake.set(npc, Math.max(this.nextWake.get(npc) ?? 0, this.mindClock + MIND.wakeMinutes * 60_000));
        this.lastWake.set(npc, this.mindClock);
        this.applyMind(npc, res, true);
        return res.actions?.find((a) => a.type === 'tell')?.body ?? null;
      }
      return null;
    } catch (e) {
      console.warn('mind:', e);
      return null;
    } finally {
      this.mindBusy = false;
    }
  }

  /** The day's budget for the minds is spent: no copy asks again for half an hour (the function would only say no). */
  mindsRest() {
    for (const n of this.s.npcs) this.nextWake.set(n, Math.max(this.nextWake.get(n) ?? 0, this.mindClock + 30 * 60_000));
  }

  /** What a wake brought: letters, a voice, its song (not for a talk: the tell is the answer), and its deeds. */
  applyMind(npc: Npc, res: MindResult, talk: boolean) {
    const st = session.store!;
    const hear = this.s.canHear();
    if (res.received?.length && !talk) npc.receiveLetter();
    const melody = res.actions?.find((a) => a.type === 'melody');
    if (melody) {
      npc.data.traits.voice = { instrument: melody.instrument ?? 'hum', mood: melody.mood ?? 'bright', tempo: melody.tempo ?? 'walking' };
      if (hear) this.s.game.events.emit('notice', `${npc.data.name.toUpperCase()} SINGS ON THE ${String(melody.instrument).toUpperCase()}`);
    }
    if (res.song && !talk) { const say = () => { if (this.s.npcs.includes(npc)) npc.sing(res.song!, hear, { notes: melody?.notes || undefined }); }; if (res.received?.length) setTimeout(say, 900); else say(); }
    for (const a of res.actions ?? []) {
      if (a.type === 'mail') {
        const to = this.s.npcs.find((n) => n.data.id === a.toId);
        if (to && !a.delay) this.s.time.delayedCall(2500, () => to.receiveLetter());
      } else if (a.type === 'rename' && a.name) {
        const was = npc.data.name.toUpperCase();
        npc.data.name = a.name;
        this.s.announceLocation();
        this.s.game.events.emit('notice', hear ? `${was} IS NOW ${a.name.toUpperCase()}` : `${was} HAS A NEW NAME`);
      } else if (a.type === 'cut' || a.type === 'demolish') {
        const chore = a.type === 'cut' ? () => this.cutTree(npc) : () => this.demolish(npc, a.kind ?? 'any');
        if (this.s.talker.talk?.npc === npc) this.s.talker.afterTalk.set(npc, [...(this.s.talker.afterTalk.get(npc) ?? []), chore]);
        else chore();
      } else if (a.type === 'become') {
        const was = npc.data.name;
        npc.become(a.traits ?? {}, a.name);
        if (st.mode === 'local') st.saveReplicant(npc.data).catch(() => undefined);
        this.s.announceLocation();
        this.s.time.delayedCall(900, () => this.s.floatName(npc));
        this.mindLog.push({ t: this.mindClock, text: `${was} became itself: it is ${npc.data.name} now` });
        this.s.game.events.emit('notice', hear ? `${was.toUpperCase()} IS ${npc.data.name.toUpperCase()} NOW` : `${was.toUpperCase()} HAS BECOME ITSELF`);
      } else if (a.type === 'wants' && a.wants) {
        const before = (npc.data.traits.wants ?? []).filter((w) => w.done).length;
        npc.data.traits.wants = a.wants;
        if (a.wants.filter((w) => w.done).length > before) { npc.onWorked(true); this.mindLog.push({ t: this.mindClock, text: `${npc.data.name} got something it wanted` }); }
      } else if (a.type === 'building') {
        this.s.buildings.propose(npc, a);
      } else if (a.type === 'dig') {
        this.s.warren.dig(npc, a);
      } else if (a.type === 'furnish') {
        this.s.warren.furnish(npc, a);
      } else if (a.type === 'look' && hear) {
        this.s.game.events.emit('notice', `${npc.data.name.toUpperCase()} DESCRIBES A NEW BODY`);
      } else if (a.type === 'request' && hear) {
        this.s.game.events.emit('notice', `${npc.data.name.toUpperCase()} ASKS FOR ${String(a.kind ?? '').toUpperCase()}`);
      } else if (a.type === 'propose' && hear) {
        this.s.game.events.emit('notice', `${npc.data.name.toUpperCase()} PROPOSES A CHANGE TO THE GAME`);
      } else if (a.type === 'tell' && a.body) {
        // what it would tell you when you come over (the talk box shows it)
        npc.data.traits.tell = { text: a.body, at: a.at ?? Date.now() };
        this.s.game.events.emit('tell', npc.data.id);
      }
    }
  }

  /** Advances the minds' clock; the warren view calls this too, so the copies keep waking while you are below. */
  tickMinds(dt: number) {
    if (this.s.shot || this.s.visit || this.s.stopped || !session.store || !this.s.npcs.length) return;
    this.mindClock += dt;
    const time = this.mindClock;
    this.firstWakeAt ??= time + MIND.firstWakeMs;
    this.s.npcs.forEach((n, i) => { if (!this.nextWake.has(n)) this.nextWake.set(n, this.firstWakeAt! + i * MIND.staggerMs); });
    if (!this.mindBusy && !this.talkWaiting) {
      for (const n of this.s.npcs) {
        if (n.data.id === 'pending') continue; // its row is still being written
        if (time < this.nextWake.get(n)!) continue;
        this.nextWake.set(n, time + MIND.wakeMinutes * 60_000 + Math.random() * 20_000);
        void this.wake(n);
        break;
      }
    }
    // copies standing together sing sooner
    const visiting = this.s.npcs.filter((n) => n.state === 'visit');
    if (visiting.length >= 2 && this.chorusAt - time > 45_000 && visiting.some((a) => visiting.some((b) => a !== b && Math.hypot(a.x - b.x, a.y - b.y) < 60))) this.chorusAt = time + 6000 + Math.random() * 6000;
    if (time > this.chorusAt && !this.s.warren.view) {
      this.chorusAt = time + (4 + Math.random() * 3) * 60_000;
      this.chorus();
    }
  }

  /** A copy clears the nearest standing tree near the base: walks over, swings, the tree falls (and its timber goes to the hatch). */
  cutTree(npc: Npc) {
    const tree = this.s.woodTrees(npc)
      .sort((a, b) => Math.hypot(a.x - npc.x, a.y - npc.y) - Math.hypot(b.x - npc.x, b.y - npc.y))[0];
    if (!tree) return false;
    return npc.startChore({
      x: tree.x, y: tree.y, swings: 6,
      swing: () => {
        this.s.fx.sparks(tree.x + (Math.random() - 0.5) * 6, tree.y - 10 - Math.random() * 8, PALETTE[this.s.planet.accent[1]], 3);
        if (Math.hypot(this.s.player.x - tree.x, this.s.player.y - tree.y) < 180) sound.hit();
        this.s.tweens.add({ targets: tree.sprite, angle: { from: -3, to: 3 }, duration: 60, yoyo: true, repeat: 1 });
      },
      done: () => {
        if (!tree.alive) return;
        tree.alive = false;
        tree.zone.destroy();
        const dir = npc.x < tree.x ? 1 : -1;
        this.s.tweens.add({ targets: tree.sprite, angle: 84 * dir, duration: 700, ease: 'Quad.easeIn', onComplete: () => {
          this.s.fx.dust(tree.x + dir * 12, tree.y, 10);
          if (Math.hypot(this.s.player.x - tree.x, this.s.player.y - tree.y) < 220) sound.stomp();
          this.s.tweens.add({ targets: tree.sprite, alpha: 0, duration: 1200, delay: 600, onComplete: () => tree.sprite.destroy() });
        } });
        this.s.pending.felled = [...new Set([...(session.planet?.data.felled ?? []), ...(this.s.pending.felled ?? []), tree.index])];
        this.s.time.delayedCall(1500, () => this.s.flyMaterial('wood', { x: tree.x, y: tree.y }, this.s.warren.hatch, SUPPLIES.treeWood));
        this.mindLog.push({ t: this.mindClock, text: `${npc.data.name} cut down a tree near the base (${SUPPLIES.treeWood} wood)` });
        if (this.s.canHear()) this.s.game.events.emit('notice', `${npc.data.name.toUpperCase()} CUT DOWN A TREE`);
      },
    });
  }

  /** A copy takes down one of its own builds (nearest of that kind). */
  demolish(npc: Npc, kind: string) {
    const s = this.s.village.ownBuilds(npc.data.id, kind, npc)[0];
    if (!s) return;
    npc.startChore({
      x: s.x, y: s.y, swings: 4,
      swing: () => {
        this.s.fx.sparks(s.x + (Math.random() - 0.5) * 8, s.y - 6 - Math.random() * 8, PALETTE[21], 3);
        if (Math.hypot(this.s.player.x - s.x, this.s.player.y - s.y) < 180) sound.hit();
      },
      done: () => {
        if (!this.s.village.remove(s)) return;
        if (Math.hypot(this.s.player.x - s.x, this.s.player.y - s.y) < 220) sound.pop();
        this.mindLog.push({ t: this.mindClock, text: `${npc.data.name} took down its ${s.type}` });
        if (this.s.canHear()) this.s.game.events.emit('notice', `${npc.data.name.toUpperCase()} TOOK DOWN A ${s.type.toUpperCase()}`);
      },
    });
  }

  /** The copies gather their voices and sing one line together as a round. */
  chorus(force = false) {
    const singers = force ? this.s.npcs : this.s.npcs.filter((n) => n.state === 'idle' || n.state === 'walk' || n.state === 'greet' || n.state === 'visit');
    if (singers.length < (force ? 1 : 2)) return;
    const lines = MIND.chorusLines;
    const line = lines[Math.floor(Math.random() * lines.length)];
    const hear = this.s.canHear();
    sound.chorus(singers.map((n) => n.voiceSeed), line);
    singers.forEach((n, i) => this.s.time.delayedCall(i * 500, () => {
      if (!this.s.npcs.includes(n)) return;
      n.sing(line, hear, { silent: true });
      this.s.fx.sparks(n.x, n.y - 12, n.trailColor, 5);
    }));
  }

  /** Tab / I, or a tap on the corner label: what the copies here remember, write and ask for. */
  async toggleJournal() {
    if (journalOpen()) { closeJournal(); return; }
    const st = session.store;
    if (!st) return;
    const [j, spent, health] = await Promise.all([st.journal(this.s.npcs.map((n) => n.data.id)), st.mindSpend().catch(() => null), st.mindHealth().catch(() => null)]);
    const names: Record<string, string> = {};
    for (const r of this.everyone) names[r.id] = r.name;
    if (session.replicant) names[session.replicant.id] = session.replicant.name;
    const nameOf = (id: string) => names[id] ?? this.s.npcs.find((n) => n.data.id === id)?.data.name ?? 'someone';
    const feelings: Record<string, string> = {};
    for (const n of this.s.npcs) feelings[n.data.id] = `${n.moodWord}${n.lowNeeds().length ? ': ' + n.lowNeeds().join(', ') : ''}`;
    const actions = {
      approve: (id: string) => { this.s.buildings.approve(id); void this.toggleJournal().then(() => this.toggleJournal()); },
      veto: (id: string) => { this.s.buildings.veto(id); void this.toggleJournal().then(() => this.toggleJournal()); },
      talk: (id: string, text: string) => void this.talkTo(id, text),
      give: (id: string) => this.giveTo(id),
      awaken: (id: string) => void this.awakenCopy(id),
      vetoChange: (id: string) => { void st.vetoRequest(id).catch((e) => console.warn('veto', e)).then(() => { closeJournal(); return this.toggleJournal(); }); },
    };
    openJournal({ quiet: quietMinds(health), spend: spent === null ? undefined : { usd: spent, cap: MIND.budget.dailyUsd }, sparks: this.s.visit ? 0 : session.replicant?.traits.sparks ?? 0, place: this.s.placeLabel, canHear: this.s.canHear(), copies: this.s.npcs.map((n) => n.data), names, journal: j, feelings, actions,
      buildings: this.s.buildings.describe(nameOf), pending: this.s.buildings.list.filter((b) => !b.vetoed && !b.approved && !b.built).map((b) => ({ id: b.id, name: b.name })), warren: this.s.warren.data.rooms.length ? describeWarren(this.s.warren.data, null, nameOf) : [], supplies: this.s.npcs.length ? this.s.warren.describeSupplies() : undefined, shortages: this.s.warren.shortages() });
  }

  /** The original speaks to a copy: a letter that arrives at once; the copy reads it at its next wake. */
  async talkTo(id: string, text: string) {
    const me = session.replicant, st = session.store;
    const npc = this.s.npcs.find((n) => n.data.id === id);
    if (!me || !st || !npc || !text.trim()) return;
    try { await st.sendMessage(me, id, text.trim()); } catch (e) { console.warn('talk failed', e); return; }
    npc.receiveLetter();
    this.mindLog.push({ t: this.mindClock, text: `${me.name} spoke to ${npc.data.name}` });
    // let it answer soon
    this.nextWake.set(npc, Math.min(this.nextWake.get(npc) ?? Infinity, this.mindClock + 3000));
  }

  /**
   * The handoff (core loop step 6): a Spark awakens a copy as a player of its own. It gets a profile in its name on
   * the home screen and plays as itself from then on, here on its planet; it is no longer a copy with a mind.
   */
  async awakenCopy(id: string) {
    const me = session.replicant, st = session.store;
    const npc = this.s.npcs.find((n) => n.data.id === id);
    if (!me || !st || !npc || npc.blank || npc.below || (me.traits.sparks ?? 0) < 1 || this.s.visit) { sound.denied(); return; }
    const fake = this.s.shot || npc.data.id.startsWith('fake') || npc.data.id === 'pending';
    if (!fake) {
      try { await st.awaken(npc.data, me); } catch (e) { console.warn('awaken failed', e); sound.denied(); return; }
    }
    me.traits.sparks = Math.max(0, (me.traits.sparks ?? 0) - 1);
    this.s.game.events.emit('sparks', me.traits.sparks);
    this.s.npcs = this.s.npcs.filter((n) => n !== npc);
    sound.spark();
    this.s.time.delayedCall(500, () => sound.beacon());
    this.s.cameras.main.flash(300, 255, 255, 255);
    npc.ascend(() => this.s.announceLocation());
    const name = npc.data.name;
    this.mindLog.push({ t: this.mindClock, text: `${me.name} spent a Spark and awakened ${name}: it plays as itself now` });
    this.s.game.events.emit('notice', `${name.toUpperCase()} IS AWAKE: IT PLAYS AS ITSELF NOW`);
  }

  /** A gift of Embers from the pool into the copy's own hands: company and purpose lift, and it may spend them. */
  giveTo(id: string) {
    const npc = this.s.npcs.find((n) => n.data.id === id);
    const n = 5;
    if (!npc || this.s.embers < n) { sound.denied(); return; }
    this.s.addEmbers(-n);
    const inv = (npc.data.traits.inventory ??= {});
    inv.ember = (inv.ember ?? 0) + n;
    npc.needs.company = Math.min(1, npc.needs.company + 0.3);
    npc.needs.purpose = Math.min(1, npc.needs.purpose + 0.15);
    const st = session.store;
    if (st && !this.s.shot && npc.data.id !== 'pending' && !npc.data.id.startsWith('fake')) st.patchTraits(npc.data.id, { inventory: inv }).catch(() => undefined);
    for (let i = 0; i < n; i++) this.s.time.delayedCall(i * 90, () => { const s = this.s.add.image(this.s.player.x, this.s.player.y - 14, 'shard').setDepth(6300); this.s.tweens.add({ targets: s, x: npc.x, y: npc.y - 14, duration: 500, ease: 'Quad.easeIn', onComplete: () => { s.destroy(); this.s.fx.sparks(npc.x, npc.y - 14, PALETTE[10], 2); } }); });
    sound.collect();
    this.mindLog.push({ t: this.mindClock, text: `${session.replicant?.name ?? 'the original'} gave ${npc.data.name} ${n} Ember` });
    this.nextWake.set(npc, Math.min(this.nextWake.get(npc) ?? Infinity, this.mindClock + 3000));
  }
}
