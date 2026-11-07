import Phaser from 'phaser'
import { BootScene } from './scenes/BootScene'
import { LevelScene } from './scenes/LevelScene'

export const GAME_WIDTH = 800
export const GAME_HEIGHT = 600

export function createGameConfig(
  parent: HTMLElement,
  keyboardTarget: HTMLElement,
): Phaser.Types.Core.GameConfig {
  return {
    parent,
    input: { keyboard: { target: keyboardTarget } },
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#000000',
    render: {
      pixelArt: true,
      roundPixels: true,
      antialias: false,
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.NO_CENTER,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
    },
    physics: {
      default: 'arcade',
      arcade: {
        fps: 60,
        debug: false,
      },
    },
    fps: {
      target: 60,
    },
    scene: [BootScene, LevelScene],
  }
}
