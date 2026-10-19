import { sound } from '../../audio/Sound';
import { PALETTE, PLAYER } from '../../core/data';
import { HEAR_HINT, journalOpen } from '../../ui/journal';
import { openReplyInput, type TalkBox, type TalkWho } from '../../ui/dialogue';
import { composeTalk, type Exchange, type TalkPage } from '../../ui/talk';
import TALK from '../../data/talk.json';
import type { UIScene } from '../UIScene';
import { session } from '../../core/session';
import { Npc } from '../../entities/Npc';
import { bodyFor } from '../../core/body';
import { planetAt } from '../../world/system';
import { type InputFrame } from '../../input/Controls';
import { starById } from '../../world/galaxy';
import type { PlanetScene } from '../PlanetScene';
import { NO_INPUT, placeName, type TalkSession } from './shared';

/**
 * The talk box: who you can talk to, the open talk, its pages, your reply.
 * Part of PlanetScene (src/scenes/PlanetScene.ts); `s` is the scene.
 */
export class Talk {
  constructor(readonly s: PlanetScene) {}

  talk: TalkSession | null = null;
  /** the copy whose talk hint is showing */
  talkable: Npc | null = null;
  talkClosedAt = -Infinity;
  /** a tree to cut or a build to take down that a copy's mind chose while you were talking to it: done when you part */
  afterTalk = new Map<Npc, (() => void)[]>();

  get talkBox(): TalkBox | undefined { return (this.s.scene.get('ui') as UIScene | null)?.talkBox; }

  /** The mind's talk wake (requestTalk): what the copy says, or null. */
  requestTalkFn() {
    return this.s.requestTalk;
  }

  /** The copy you can talk to: the nearest one up here within reach (not being born, not below). */
  talkTarget(): Npc | null {
    const p = this.s.player;
    if (!p.alive || p.locked || p.isHidden || this.s.stopped || this.s.launching || this.s.replicating || journalOpen() || !this.talkBox) return null;
    let best: Npc | null = null, bd = TALK.range;
    for (const n of this.s.npcs) {
      if (n.below || n.state === 'born') continue;
      const d = Math.hypot(n.x - p.x, n.y - p.y);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  /**
   * Every frame's buttons go through here first. While the talk box is open they turn its pages and the player
   * stands still; otherwise the nearest copy in reach shows its talk hint and interact opens the box.
   */
  routeTalk(time: number, raw: InputFrame): InputFrame {
    if (this.talk) { this.updateTalk(raw); return NO_INPUT; }
    const target = this.talkTarget();
    if (target !== this.talkable) {
      if (this.talkable && this.s.npcs.includes(this.talkable)) this.talkable.setTalkHint(false);
      target?.setTalkHint(true);
      this.talkable = target;
      this.s.game.events.emit('talkable', target ? this.visorOf(target) : null);
    }
    if (raw.interact && target) { this.openTalk(target); return NO_INPUT; }
    // the press that closed the box must not also swing, dash or board the vessel
    if (time - this.talkClosedAt < 150) return { ...raw, attack: false, dash: false, interact: false };
    return raw;
  }

  visorOf(n: Npc) { return n.data.traits.blank ? PALETTE[21] : PALETTE[n.data.traits.feature ?? PLAYER.feature[1]]; }

  /** A press waiting in the player's attack buffer must not fire once the talk ends. */
  dropAttackBuffer() { (this.s.player as unknown as { attackBufferedUntil: number }).attackBufferedUntil = 0; }

  /** Opens the talk box for this copy; `jumpTo` a page key ("letters:0") once its notes and letters are in. */
  openTalk(npc: Npc, jumpTo?: string) {
    const box = this.talkBox, ui = this.s.scene.get('ui') as UIScene;
    if (!box) return;
    this.talkable?.setTalkHint(false);
    this.talkable = null;
    this.s.game.events.emit('talkable', null);
    const t: TalkSession = { npc, hp: this.s.player.hp, name: npc.data.name, journal: null, exchanges: [], composing: false, fresh: null, opening: npc.data.traits.tell ?? null, reply: null };
    this.talk = t;
    this.s.controls.modal = true;
    this.dropAttackBuffer();
    if (!npc.blank) npc.startTalk();
    ui.setTalking(true);
    box.canReply = !npc.blank && !!session.replicant && !!session.store;
    const look = (): ReturnType<TalkWho['look']> => {
      const l = bodyFor(this.s, npc.data);
      const blank = !!npc.data.traits.blank;
      return { key: l.key, anchors: l.anchors, gear: blank ? 0 : npc.data.traits.gear ?? 0, gearTint: npc.trailColor, model: l.model, blank };
    };
    box.show({ name: () => npc.data.name, color: () => this.visorOf(npc), look, seed: npc.voiceSeed, voice: () => npc.data.traits.voice }, this.talkPages());
    this.s.game.events.on('tell', this.onTell, this);
    // its notes and letters: SAYS shows at once while they load
    session.store?.journal([npc.data.id]).then((j) => { if (this.talk === t) { t.journal = j; this.refreshTalk(jumpTo); } }).catch((e) => console.warn('talk journal', e));
    // what it last wanted to tell you is old (or there is nothing): ask its mind for a fresh word
    const rt = this.requestTalkFn(), tell = npc.data.traits.tell;
    if (rt && !npc.blank && (!tell || Date.now() - tell.at > TALK.staleMinutes * 60_000)) {
      t.composing = true;
      this.refreshTalk();
      rt.call(this.s, npc).then((text) => {
        if (this.talk !== t) return;
        t.composing = false;
        if (text && !t.fresh) t.fresh = { text, at: Date.now() };
        this.refreshTalk();
      }).catch(() => { if (this.talk === t) { t.composing = false; this.refreshTalk(); } });
    }
  }

  /** Its mind set traits.tell (a talk wake finished): SAYS shows it. */
  onTell(id: string) {
    const t = this.talk;
    if (!t || t.npc.data.id !== id) return;
    const tell = t.npc.data.traits.tell;
    // an answer to your reply arrives through the exchange; this is for its own fresh word
    if (tell && !t.exchanges.some((x) => x.answer === undefined)) t.fresh = { text: tell.text, at: tell.at };
    t.composing = false;
    this.refreshTalk();
  }

  talkPages(): TalkPage[] {
    const t = this.talk!, n = t.npc, me = session.replicant, box = this.talkBox!;
    const who = (id: string | null) => {
      if (!id) return { name: 'someone' };
      if (me && id === me.id) return { name: me.name };
      const here = this.s.npcs.find((x) => x.data.id === id);
      if (here) return { name: here.data.name };
      const r = this.s.minds.everyone.find((x) => x.id === id);
      if (!r) return { name: 'someone' };
      if (r.star_id === this.s.planet.star && r.planet_index === this.s.planet.planetIndex) return { name: r.name };
      const where = r.star_id === this.s.planet.star ? planetAt(r.star_id, r.planet_index)?.name : starById(r.star_id)?.name;
      return { name: r.name, where: placeName(where ?? r.star_id) };
    };
    // an answer it just gave you is not told twice
    const tell = t.fresh ?? t.opening ?? n.data.traits.tell;
    const told = tell && t.exchanges.some((x) => x.answer && x.answer === tell.text) ? undefined : tell;
    const low = n.lowNeeds();
    return composeTalk({
      copyId: n.data.id, name: n.data.name, blank: !!n.data.traits.blank, canHear: this.s.canHear(), hint: HEAR_HINT, now: Date.now(),
      playerId: me?.id, tell: told ?? undefined, tellNew: !!t.fresh, composing: t.composing,
      notes: t.journal ? t.journal.notes.filter((x) => x.replicant_id === n.data.id) : null,
      mail: t.journal ? t.journal.mail : null,
      wants: n.data.traits.wants ?? [],
      feeling: { mood: n.moodWord, weariness: n.weariness, lonely: low.some((x) => x.startsWith('lonely')), aimless: low.some((x) => x.startsWith('aimless')) },
      exchanges: t.exchanges, who,
    }, { width: box.tw, lines: TALK.box.lines, measure: box.measure, thoughts: TALK.thoughts, lettersToYou: TALK.lettersToYou, staleMs: TALK.staleMinutes * 60_000 });
  }

  refreshTalk(jumpTo?: string) {
    if (!this.talk) return;
    this.talk.name = this.talk.npc.data.name;
    this.talkBox?.setPages(this.talkPages(), jumpTo);
  }

  /** The talk box has the buttons: next, back, close, reply. It also ends by itself if you are hurt or the copy goes. */
  updateTalk(raw: InputFrame) {
    const t = this.talk!, box = this.talkBox;
    if (!box || !this.s.player.alive || this.s.player.hp < t.hp || !this.s.npcs.includes(t.npc) || t.npc.below) { this.closeTalk(); return; }
    t.hp = this.s.player.hp; // any hit from here on ends it (health may have come back meanwhile)
    if (t.reply) { if (raw.cancel) t.reply(); return; } // the reply line has the keys (Esc still closes it if it lost focus)
    if (t.npc.data.name !== t.name) this.refreshTalk(); // renamed mid-talk
    if (raw.cancel) this.closeTalk();
    else if (raw.reply) this.openReply();
    else if (raw.back) box.back();
    else if (raw.forward) box.forward();
    else if ((raw.attack || raw.interact) && !box.advance()) this.closeTalk();
  }

  closeTalk() {
    const t = this.talk;
    if (!t) return;
    this.talk = null;
    t.reply?.();
    t.npc.endTalk();
    const later = this.afterTalk.get(t.npc) ?? [];
    this.afterTalk.delete(t.npc);
    later.forEach((f, k) => this.s.time.delayedCall(600 + k * 3000, () => { if (this.s.npcs.includes(t.npc) && !t.npc.below) f(); }));
    this.s.controls.modal = false;
    this.s.controls.clear();
    this.dropAttackBuffer();
    this.talkClosedAt = this.s.time.now;
    this.s.game.events.off('tell', this.onTell, this);
    this.talkBox?.hide();
    (this.s.scene.get('ui') as UIScene | null)?.setTalking?.(false);
  }

  /** R: a line of your own, sent as a letter (it arrives at once); the copy's answer comes as a new SAYS page. */
  openReply() {
    const t = this.talk, box = this.talkBox;
    if (!t || !box || t.reply || !box.canReply) return;
    t.reply = openReplyInput(this.s.game.canvas, box.textRect, `say something to ${t.npc.data.name}`, (text) => void this.sendReply(t, text), () => { t.reply = null; });
  }

  async sendReply(t: TalkSession, text: string) {
    const me = session.replicant, st = session.store;
    if (!me || !st || this.talk !== t) return;
    const npc = t.npc;
    try { await st.sendMessage(me, npc.data.id, text); } catch (e) { console.warn('talk failed', e); sound.denied(); return; }
    npc.receiveLetter();
    const x: Exchange = { said: text };
    t.exchanges.push(x);
    const rt = this.requestTalkFn();
    if (!rt) x.answer = null;
    this.refreshTalk(`x${t.exchanges.length - 1}:0`);
    if (!rt) return;
    try { x.answer = (await rt.call(this.s, npc, text)) ?? null; } catch { x.answer = null; }
    if (this.talk === t) this.refreshTalk();
  }

  // --- saving ---
}
