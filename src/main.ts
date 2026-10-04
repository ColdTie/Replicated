import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { HomeScene } from './scenes/HomeScene';
import { PlanetScene } from './scenes/PlanetScene';
import { StarMapScene } from './scenes/StarMapScene';
import { UIScene } from './scenes/UIScene';
import { session } from './core/session';

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
  scene: [BootScene, HomeScene, PlanetScene, UIScene, StarMapScene],
});

// Handles for headless playtests (tools/ and screenshots)
Object.assign(window as object, { __game: game, __session: session });
