// Small HTML forms over the canvas (sign-in, new profile). Typing into a canvas is unreliable on
// iPad, so text entry uses real inputs styled to match the game.
import { PALETTE } from '../core/data';

export const paletteCss = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const css = paletteCss;

let styled = false;
function ensureStyle() {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = `
  .ov { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 10;
    background: ${css(PALETTE[25])}cc; font: 16px/1.4 ui-monospace, Menlo, Consolas, monospace; color: ${css(PALETTE[20])};
    touch-action: auto; }
  .ov form { background: ${css(PALETTE[24])}; border: 2px solid ${css(PALETTE[22])}; padding: 20px; width: min(340px, 86vw);
    display: flex; flex-direction: column; gap: 12px; box-shadow: 0 0 0 4px ${css(PALETTE[25])}; }
  .ov h2 { margin: 0 0 4px; font-size: 18px; letter-spacing: 3px; color: ${css(PALETTE[2])}; text-align: center; }
  .ov p { margin: 0; font-size: 13px; color: ${css(PALETTE[21])}; }
  .ov input[type=text], .ov input[type=email], .ov input[type=password] { font: inherit; font-size: 16px; padding: 10px;
    background: ${css(PALETTE[25])}; color: ${css(PALETTE[19])}; border: 2px solid ${css(PALETTE[23])}; outline: none;
    -webkit-user-select: text; user-select: text; }
  .ov input:focus { border-color: ${css(PALETTE[9])}; }
  .ov button { font: inherit; padding: 12px; border: 2px solid ${css(PALETTE[9])}; background: ${css(PALETTE[9])};
    color: ${css(PALETTE[25])}; cursor: pointer; letter-spacing: 1px; }
  .ov button.alt { background: transparent; color: ${css(PALETTE[10])}; }
  .ov button.link { border: none; background: none; color: ${css(PALETTE[21])}; padding: 4px; font-size: 13px; text-decoration: underline; }
  .ov button:disabled { opacity: 0.5; }
  .ov label.row { display: flex; align-items: center; gap: 10px; }
  .ov input[type=checkbox] { width: 22px; height: 22px; accent-color: ${css(PALETTE[9])}; }
  .ov .sw { display: flex; gap: 8px; flex-wrap: wrap; }
  .ov .sw button { width: 34px; height: 34px; padding: 0; border: 3px solid ${css(PALETTE[24])}; }
  .ov .sw button.on { border-color: ${css(PALETTE[19])}; }
  .ov .msg { min-height: 1.2em; color: ${css(PALETTE[29])}; font-size: 13px; }
  `;
  document.head.appendChild(s);
}

let openCount = 0;
let closedAt = 0;
/** True while a form is open or just closed: the closing tap must not also hit the canvas. */
export const overlayBusy = () => openCount > 0 || performance.now() - closedAt < 400;

/** Opens a modal form; build() fills it. Returns close(). */
export function openOverlay(build: (form: HTMLFormElement, close: () => void) => void) {
  ensureStyle();
  const root = document.createElement('div');
  root.className = 'ov';
  const form = document.createElement('form');
  form.addEventListener('submit', (e) => e.preventDefault());
  root.appendChild(form);
  document.body.appendChild(root);
  openCount++;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    openCount--;
    closedAt = performance.now();
    root.remove();
  };
  build(form, close);
  return close;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...children: (Node | string)[]) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  for (const c of children) e.append(c);
  return e;
}
