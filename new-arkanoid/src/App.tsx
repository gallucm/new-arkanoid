import { useEffect, useLayoutEffect, useRef } from 'react'
import Phaser from 'phaser'
import { useStore } from 'zustand'
import { attachGameAudio } from '@/game/audio'
import { createGameConfig } from '@/game/config'
import { useGameStore, type GameStatus } from '@/state/gameStore'
import { SoundToggle } from '@/ui/SoundToggle'
import { ArcadeScreen, RoundResult } from '@/ui/ArcadeScreen'

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Phaser.Game | null>(null)
  const status = useStore(useGameStore, (state) => state.status)
  const score = useStore(useGameStore, (state) => state.score)
  const lives = useStore(useGameStore, (state) => state.lives)
  const outcome = useStore(useGameStore, (state) => state.outcome)
  const playing = status === 'level' && outcome === null

  useEffect(() => {
    const container = containerRef.current
    const board = boardRef.current
    if (container === null || board === null) return
    const game = new Phaser.Game(createGameConfig(container, board))
    gameRef.current = game
    const detachAudio = attachGameAudio(game)
    const resize = new ResizeObserver(() => {
      if (game.canvas && game.scale.getParentBounds()) game.scale.refresh()
    })
    resize.observe(container)

    return () => {
      gameRef.current = null
      resize.disconnect()
      detachAudio()
      game.destroy(true)
    }
  }, [])

  useLayoutEffect(() => {
    if (!playing) return
    const scale = gameRef.current?.scale
    scale?.getParentBounds()
    scale?.refresh()
    boardRef.current?.focus()
  }, [playing])

  function showScreen(next: Exclude<GameStatus, 'level'>) {
    if (status === 'level') gameRef.current?.scene.stop('Level')
    useGameStore.getState().setStatus(next)
  }

  function startGame() {
    gameRef.current?.scene.start('Level')
  }

  return (
    <main className="app">
      <div className="game-stage">
        <div
          ref={boardRef}
          className="game-board"
          role="region"
          aria-label="Tablero de New Arkanoid"
          aria-describedby={playing ? 'game-controls' : undefined}
          aria-hidden={!playing}
          tabIndex={playing ? 0 : -1}
          onPointerDownCapture={() => {
            if (playing) boardRef.current?.focus()
          }}
          onBlur={() => {
            if (playing)
              gameRef.current?.scene
                .getScene('Level')
                .input.keyboard?.resetKeys()
          }}
          onKeyDown={(event) => {
            if (playing && event.key === 'Escape') {
              event.stopPropagation()
              showScreen('menu')
            }
          }}
        >
          <div ref={containerRef} className="game-container" />
        </div>
        {status !== 'level' ? (
          <ArcadeScreen
            key={status}
            status={status}
            navigate={showScreen}
            startGame={startGame}
          />
        ) : outcome !== null ? (
          <RoundResult outcome={outcome} score={score} navigate={showScreen} />
        ) : null}
      </div>
      {playing && (
        <header className="game-hud">
          <span>
            Puntaje <strong>{score}</strong>
          </span>
          <span aria-live="polite">
            Vidas <strong>{lives}</strong>
          </span>
          <SoundToggle />
          <button type="button" onClick={() => showScreen('menu')}>
            Volver al menú
          </button>
        </header>
      )}
      {playing && (
        <p className="game-controls" id="game-controls">
          Flechas o puntero para mover · Espacio, clic o toque para lanzar · Esc
          para volver
        </p>
      )}
    </main>
  )
}
