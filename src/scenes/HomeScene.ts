// Title + "tap your face" profile picker. Signs in once per device (one family login), then lists
// the family's profiles. ?local plays from this device's storage without signing in.
import Phaser from 'phaser';
import { anim, featureTex } from '../core/assets';
import { PALETTE, PLAYER } from '../core/data';
import { session } from '../core/session';
import { makeSky, makeStars } from '../fx/textures';
import { CloudStore, LocalStore, currentSession, signIn, signUp, type GameStore, type Profile } from '../net/store';
import { el, openOverlay, overlayBusy, paletteCss } from '../ui/overlay';

const CARD_W = 76, CARD_H = 100;

export class HomeScene extends Phaser.Scene {
  private cards: Phaser.GameObjects.Container[] = [];
  private status!: Phaser.GameObjects.BitmapText;
  private picking = false;

  constructor() { super('home'); }

  create() {
    const { width: w, height: h } = this.scale;
    makeSky(this, 'sky.home', [0x181425, 0x262b44, 0x124e89], w, h);
    makeStars(this, 'stars.home', 160, 40, 42, PALETTE[18]);
    this.add.image(0, 0, 'sky.home').setOrigin(0);
    const stars = this.add.tileSprite(0, 0, w, h, 'stars.home').setOrigin(0);
    this.events.on('update', (_t: number, dt: number) => { stars.tilePositionX += dt * 0.004; });

    this.add.bitmapText(w / 2, 28, 'pixel', 'V E S S E L   M E T A N O I A').setOrigin(0.5).setTint(PALETTE[2]);
    this.add.bitmapText(w / 2, 42, 'pixel', 'REPLICANTS').setOrigin(0.5).setTint(PALETTE[9]);
    this.status = this.add.bitmapText(w / 2, h - 18, 'pixel', '').setOrigin(0.5).setTint(PALETTE[21]);

    void this.start();
  }

  private async start() {
    const params = new URLSearchParams(location.search);
    if (params.has('shot') || params.has('local')) {
      // Screenshots and offline play: device storage, auto-create a profile if needed
      const store = new LocalStore(!params.has('shot'));
      if (params.has('shot')) {
        const p = (await store.listProfiles())[0] ?? await store.createProfile({ name: 'STEVE', kid_mode: params.has('kid'), feature_color: 10, sort: 0 });
        return this.play(store, p);
      }
      return this.showProfiles(store);
    }
    this.status.setText('CONNECTING...');
    try {
      if (!(await currentSession())) return this.showSignIn();
      await this.openCloud();
    } catch (e) {
      console.warn(e);
      this.status.setText('OFFLINE - TAP TO PLAY ON THIS DEVICE');
      this.input.once('pointerdown', () => this.showProfiles(new LocalStore()));
    }
  }

  private async openCloud() {
    this.status.setText('CONNECTING...');
    const store = await CloudStore.open();
    await this.showProfiles(store);
  }

  private showSignIn() {
    this.status.setText('');
    openOverlay((form, close) => {
      const email = el('input', { type: 'email', placeholder: 'family email', autocomplete: 'username', required: true }) as HTMLInputElement;
      const pass = el('input', { type: 'password', placeholder: 'password', autocomplete: 'current-password', required: true, minLength: 6 }) as HTMLInputElement;
      const msg = el('div', { className: 'msg' });
      const go = el('button', { type: 'submit' }, 'SIGN IN') as HTMLButtonElement;
      const create = el('button', { type: 'button', className: 'alt' }, 'CREATE FAMILY LOGIN') as HTMLButtonElement;
      const offline = el('button', { type: 'button', className: 'link' }, 'play on this device without signing in');
      form.append(el('h2', {}, 'FAMILY LOGIN'), el('p', {}, 'Sign in once on this device. Everyone in the family shares this login.'), email, pass, msg, go, create, offline);

      const busy = (b: boolean) => { go.disabled = create.disabled = b; };
      const fail = (e: unknown) => { busy(false); msg.textContent = (e as Error).message ?? String(e); };
      go.onclick = async () => {
        if (!form.reportValidity()) return;
        busy(true); msg.textContent = '';
        try { await signIn(email.value.trim(), pass.value); close(); await this.openCloud(); } catch (e) { fail(e); }
      };
      create.onclick = async () => {
        if (!form.reportValidity()) return;
        busy(true); msg.textContent = '';
        try {
          const needsConfirm = await signUp(email.value.trim(), pass.value);
          if (needsConfirm) { busy(false); msg.textContent = 'Check that inbox and tap the confirmation link, then come back and sign in.'; return; }
          close(); await this.openCloud();
        } catch (e) { fail(e); }
      };
      offline.onclick = () => { close(); void this.showProfiles(new LocalStore()); };
      email.focus();
    });
  }

  private async showProfiles(store: GameStore) {
    this.status.setText('');
    this.cards.forEach((c) => c.destroy());
    this.cards = [];
    let profiles: Profile[];
    try { profiles = await store.listProfiles(); } catch (e) { console.warn(e); this.status.setText('COULD NOT LOAD PROFILES'); return; }
    const { width: w, height: h } = this.scale;
    const count = profiles.length + (profiles.length < 6 ? 1 : 0);
    const gap = 10;
    const total = count * CARD_W + (count - 1) * gap;
    let x = (w - total) / 2 + CARD_W / 2;
    const y = h / 2 + 12;
    for (const p of profiles) {
      this.cards.push(this.profileCard(x, y, p, () => this.play(store, p)));
      x += CARD_W + gap;
    }
    if (profiles.length < 6) this.cards.push(this.addCard(x, y, () => this.newProfile(store, profiles.length)));

    if (store.mode === 'cloud') {
      const out = this.add.bitmapText(w - 8, h - 10, 'pixel', 'SIGN OUT').setOrigin(1, 1).setTint(PALETTE[22]).setInteractive({ useHandCursor: true });
      out.on('pointerdown', async () => { await store.signOut(); location.reload(); });
      this.cards.push(this.add.container(0, 0, [out]));
    } else {
      this.status.setText('PLAYING ON THIS DEVICE ONLY');
    }
  }

  private cardFrame(x: number, y: number, color: number) {
    const g = this.add.graphics();
    g.fillStyle(PALETTE[24], 0.9).fillRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H);
    g.lineStyle(2, color, 1).strokeRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H);
    const c = this.add.container(x, y, [g]);
    c.setSize(CARD_W, CARD_H).setInteractive({ useHandCursor: true });
    c.on('pointerover', () => c.setScale(1.05));
    c.on('pointerout', () => c.setScale(1));
    return c;
  }

  private profileCard(x: number, y: number, p: Profile, onPick: () => void) {
    const c = this.cardFrame(x, y, PALETTE[p.feature_color] ?? PALETTE[10]);
    const key = featureTex(PLAYER.models[PLAYER.model as keyof typeof PLAYER.models].sprite, p.feature_color);
    const body = this.add.sprite(0, 18, key).setOrigin(0.5, 1).setScale(3);
    body.play(anim(key, 'idle'));
    const name = this.add.bitmapText(0, CARD_H / 2 - 16, 'pixel', p.name.toUpperCase().slice(0, 10)).setOrigin(0.5);
    c.add([body, name]);
    if (p.kid_mode) c.add(this.add.image(CARD_W / 2 - 10, -CARD_H / 2 + 10, 'shard'));
    c.on('pointerdown', () => {
      if (overlayBusy() || this.picking) return;
      this.picking = true;
      this.tweens.add({ targets: c, scale: 0.92, duration: 70, yoyo: true, onComplete: onPick });
    });
    return c;
  }

  private addCard(x: number, y: number, onPick: () => void) {
    const c = this.cardFrame(x, y, PALETTE[23]);
    const plus = this.add.bitmapText(0, -6, 'pixel', '+').setOrigin(0.5).setScale(4).setTint(PALETTE[21]);
    c.add(plus);
    c.on('pointerdown', () => { if (!overlayBusy() && !this.picking) onPick(); });
    return c;
  }

  private newProfile(store: GameStore, sort: number) {
    openOverlay((form, close) => {
      const name = el('input', { type: 'text', placeholder: 'name', maxLength: 12, required: true, autocapitalize: 'words' }) as HTMLInputElement;
      const kid = el('input', { type: 'checkbox' }) as HTMLInputElement;
      let color = PLAYER.featureColors[sort % PLAYER.featureColors.length][1];
      const swatches = el('div', { className: 'sw' });
      for (const [, light] of PLAYER.featureColors) {
        const b = el('button', { type: 'button', className: light === color ? 'on' : '' }) as HTMLButtonElement;
        b.style.background = paletteCss(PALETTE[light]);
        b.onclick = () => { color = light; swatches.querySelectorAll('button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); };
        swatches.append(b);
      }
      const msg = el('div', { className: 'msg' });
      const ok = el('button', { type: 'submit' }, 'CREATE') as HTMLButtonElement;
      const cancel = el('button', { type: 'button', className: 'link' }, 'cancel');
      form.append(el('h2', {}, 'NEW REPLICANT'), name, el('p', {}, 'Visor color'), swatches,
        el('label', { className: 'row' }, kid, 'Kid mode (no inventory, no dying)'), msg, ok, cancel);
      ok.onclick = async () => {
        if (!form.reportValidity()) return;
        ok.disabled = true;
        try {
          await store.createProfile({ name: name.value.trim(), kid_mode: kid.checked, feature_color: color, sort });
          close();
          await this.showProfiles(store);
        } catch (e) { ok.disabled = false; msg.textContent = (e as Error).message; }
      };
      cancel.onclick = close;
      name.focus();
    });
  }

  private async play(store: GameStore, profile: Profile) {
    this.status.setText('WAKING UP...');
    try {
      session.store = store;
      session.profile = profile;
      session.replicant = await store.loadReplicant(profile);
    } catch (e) {
      console.warn(e);
      this.status.setText('COULD NOT LOAD - CHECK CONNECTION');
      this.picking = false;
      return;
    }
    const params = new URLSearchParams(location.search);
    // Flying between stars: go to the ship (it lands by itself if it arrived while you were away)
    if (session.replicant.status === 'in_transit') {
      const j = await store.activeJourney(session.replicant).catch(() => null);
      if (j) { this.scene.start('travel', { journey: j }); return; }
      session.replicant.status = 'active';
    }
    this.scene.start('planet', {
      visit: params.get('star') ? { star: params.get('star')!, planetIndex: Number(params.get('pi') ?? 1) } : undefined,
      planetId: params.get('planet') ?? undefined,
      seed: params.get('seed') ? Number(params.get('seed')) : undefined,
      shot: params.has('shot'),
    });
  }
}
