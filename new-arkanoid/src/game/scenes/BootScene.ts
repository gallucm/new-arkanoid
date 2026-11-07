import Phaser from 'phaser'
import { notifyGameAudioReady, preloadGameAudio } from '@/game/audio'

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot')
  }

  preload(): void {
    preloadGameAudio(this)
  }

  create(): void {
    notifyGameAudioReady(this)
  }
}
