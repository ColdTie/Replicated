import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { HomeScene } from './scenes/HomeScene';
import { PlanetScene } from './scenes/PlanetScene';
import { StarMapScene } from './scenes/StarMapScene';
import { TravelScene } from './scenes/TravelScene';
import { UIScene } from './scenes/UIScene';
import { WarrenScene } from './scenes/WarrenScene';
import { VaultScene } from './scenes/VaultScene';
import { DesignScene } from './scenes/DesignScene';
import { fitToVisibleScreen } from './core/viewport';

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  width: 480,
  height: 270,
  pixelArt: true,
  roundPixels: true,
  backgroundColor: '#181425',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { debug: false } },
  input: { activePointers: 3, gamepad: true },
  render: { antialias: false, powerPreference: 'high-performance' },
  scene: [BootScene, HomeScene, PlanetScene, UIScene, TravelScene, StarMapScene, WarrenScene, VaultScene, DesignScene],
});

(window as unknown as { __game: Phaser.Game }).__game = game;
// on a phone: only the part of the screen that shows (not under the browser's bars or the notch)
fitToVisibleScreen(game, document.getElementById('game')!);

// Handles for headless tests and debugging
import { sound } from './audio/Sound';
import { session } from './core/session';
Object.assign(window, { __sound: sound, __session: session });
