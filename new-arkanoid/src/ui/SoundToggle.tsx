import { useStore } from 'zustand'
import { useGameStore } from '@/state/gameStore'

export function SoundToggle() {
  const muted = useStore(useGameStore, (state) => state.muted)
  const toggleMuted = useStore(useGameStore, (state) => state.toggleMuted)

  return (
    <button
      type="button"
      aria-label="Sonido"
      aria-pressed={!muted}
      onClick={toggleMuted}
    >
      Sonido {muted ? 'silenciado' : 'activado'}
    </button>
  )
}
