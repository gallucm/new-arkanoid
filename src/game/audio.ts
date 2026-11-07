import Phaser from 'phaser'
import { useGameStore } from '@/state/gameStore'

const musicKey = 'start'
const effects = [
  'bounce',
  'brick_bounce',
  'bonus',
  'life_lost',
  'level_up',
] as const
const audioReady = 'arkanoid:audio-ready'
const soundEffect = 'arkanoid:sfx'

export function preloadGameAudio(scene: Phaser.Scene): void {
  for (const key of [musicKey, ...effects]) {
    const asset = `${import.meta.env.BASE_URL}assets/audio/${key}`
    scene.load.audio(key, [`${asset}.ogg`, `${asset}.mp3`])
  }
}

export function notifyGameAudioReady(scene: Phaser.Scene): void {
  scene.game.events.emit(audioReady)
}

export function attachGameAudio(game: Phaser.Game): () => void {
  const sound = game.sound
  if (!sound) return () => {}
  let music: Phaser.Sound.BaseSound | undefined

  function syncMusic(): void {
    const { muted, status } = useGameStore.getState()
    const shouldPlay = !muted && status === 'intro'
    if (!shouldPlay) {
      music?.stop()
      return
    }
    if (!sound.locked && game.cache.audio.exists(musicKey)) {
      music ??= sound.add(musicKey, { loop: true, volume: 0.22 })
      if (!music.isPlaying) music.play()
    }
  }

  function playEffect(key: (typeof effects)[number]): void {
    if (
      !useGameStore.getState().muted &&
      !sound.locked &&
      game.cache.audio.exists(key)
    ) {
      sound.play(key, { volume: 0.35 })
    }
  }

  const unsubscribe = useGameStore.subscribe((state, previous) => {
    if (state.muted !== previous.muted) sound.mute = state.muted
    if (state.muted !== previous.muted || state.status !== previous.status)
      syncMusic()
  })

  sound.mute = useGameStore.getState().muted
  sound.on(Phaser.Sound.Events.UNLOCKED, syncMusic)
  game.events.on(audioReady, syncMusic)
  game.events.on(soundEffect, playEffect)

  return () => {
    unsubscribe()
    music?.destroy()
    sound.off(Phaser.Sound.Events.UNLOCKED, syncMusic)
    game.events.off(audioReady, syncMusic)
    game.events.off(soundEffect, playEffect)
  }
}
