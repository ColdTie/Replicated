// Keeps the game inside the part of the screen you can actually see. On a phone the browser's bars and the camera
// notch cover parts of the window, and iOS reports a stale size after the phone is turned, so a game sized to the
// window can lose its top and bottom rows. The game's box is set from the visual viewport (what is shown) less the
// safe-area insets (the notch), and Phaser fits the canvas into it again whenever that changes.
import type Phaser from 'phaser';

export function fitToVisibleScreen(game: Phaser.Game, el: HTMLElement) {
  // the safe-area insets are only readable through CSS: a hidden probe padded by them
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;'
    + 'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const fit = () => {
    const vv = window.visualViewport, cs = getComputedStyle(probe);
    const t = parseFloat(cs.paddingTop) || 0, r = parseFloat(cs.paddingRight) || 0;
    const b = parseFloat(cs.paddingBottom) || 0, l = parseFloat(cs.paddingLeft) || 0;
    const w = (vv?.width ?? window.innerWidth) - l - r, h = (vv?.height ?? window.innerHeight) - t - b;
    Object.assign(el.style, {
      left: `${(vv?.offsetLeft ?? 0) + l}px`, top: `${(vv?.offsetTop ?? 0) + t}px`,
      width: `${Math.max(1, Math.floor(w))}px`, height: `${Math.max(1, Math.floor(h))}px`, right: 'auto', bottom: 'auto',
    });
    game.scale.refresh();
  };
  window.visualViewport?.addEventListener('resize', fit);
  window.visualViewport?.addEventListener('scroll', fit);
  window.addEventListener('resize', fit);
  // iOS settles its bars a moment after the phone turns
  window.addEventListener('orientationchange', () => { for (const ms of [120, 450, 1000]) setTimeout(fit, ms); });
  fit();
}
