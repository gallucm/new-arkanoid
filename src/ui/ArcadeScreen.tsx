import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { useStore } from 'zustand'
import { LEVEL_COUNT } from '@/game/levels/level'
import {
  qualifiesForEntry,
  SCORE_NAME_MAX,
  SCORE_NAME_MIN,
  todayISODate,
} from '@/services/storage'
import { SoundToggle } from './SoundToggle'
import { useGameStore, type GameStatus } from '@/state/gameStore'

type Screen = Exclude<GameStatus, 'level'>
type Navigate = (screen: Screen) => void

interface ArcadeScreenProps {
  status: Screen
  navigate: Navigate
  startGame: () => void
}

export function ArcadeScreen({
  status,
  navigate,
  startGame,
}: ArcadeScreenProps) {
  const scores = useStore(useGameStore, (state) => state.scores)
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    panelRef.current
      ?.querySelector<HTMLElement>('[data-initial-focus]')
      ?.focus()
  }, [])

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape' && (status === 'scores' || status === 'exit')) {
      navigate('menu')
      return
    }

    if (
      status !== 'menu' ||
      (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')
    )
      return
    const buttons = [...event.currentTarget.querySelectorAll('button')]
    const current = buttons.indexOf(event.target as HTMLButtonElement)
    if (current === -1) return
    event.preventDefault()
    const offset = event.key === 'ArrowUp' ? -1 : 1
    buttons[(current + offset + buttons.length) % buttons.length]?.focus()
  }

  return (
    <section
      className="arcade-screen"
      ref={panelRef}
      aria-labelledby="screen-title"
      onKeyDown={onKeyDown}
    >
      {(status === 'intro' || status === 'menu') && (
        <>
          <h1 id="screen-title" className="arcade-logo">
            <img
              src={`${import.meta.env.BASE_URL}assets/images/logo.png`}
              alt="New Arkanoid"
            />
          </h1>
          {status === 'intro' ? (
            <>
              <button
                data-initial-focus
                type="button"
                onClick={() => navigate('menu')}
              >
                Entrar
              </button>
              <button
                type="button"
                onClick={() => useGameStore.getState().setMuted(false)}
              >
                Escuchar música
              </button>
              <p className="arcade-caption">CMG · 2026</p>
            </>
          ) : (
            <>
              <p className="arcade-caption">
                Récord <strong>{scores[0]?.score ?? 0}</strong>
              </p>
              <nav className="arcade-actions" aria-label="Menú principal">
                <button data-initial-focus type="button" onClick={startGame}>
                  Jugar
                </button>
                <button type="button" onClick={() => navigate('scores')}>
                  Ranking
                </button>
                <button type="button" onClick={() => navigate('exit')}>
                  Salir
                </button>
                <SoundToggle />
              </nav>
            </>
          )}
        </>
      )}
      {status === 'scores' && (
        <>
          <h1 id="screen-title" data-initial-focus tabIndex={-1}>
            Mejores puntajes
          </h1>
          {scores.length === 0 ? (
            <p>Todavía no hay puntajes.</p>
          ) : (
            <table className="score-table" aria-labelledby="screen-title">
              <thead>
                <tr>
                  <th scope="col">Puesto</th>
                  <th scope="col">Nombre</th>
                  <th scope="col">Puntaje</th>
                  <th scope="col">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {scores.map((entry, index) => (
                  <tr key={index}>
                    <td>{index + 1}</td>
                    <td>{entry.name}</td>
                    <td>{entry.score}</td>
                    <td>
                      <time dateTime={entry.date}>{entry.date}</time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <button type="button" onClick={() => navigate('menu')}>
            Volver al menú
          </button>
        </>
      )}
      {status === 'exit' && (
        <>
          <h1 id="screen-title">Gracias por jugar</h1>
          <p>Podés cerrar esta pestaña o volver al menú.</p>
          <button
            data-initial-focus
            type="button"
            onClick={() => navigate('menu')}
          >
            Volver al menú
          </button>
        </>
      )}
    </section>
  )
}

interface RoundResultProps {
  outcome: 'won' | 'lost'
  score: number
  level: number
  navigate: Navigate
  continueGame: () => void
}

export function RoundResult({
  outcome,
  score,
  level,
  navigate,
  continueGame,
}: RoundResultProps) {
  const scores = useStore(useGameStore, (state) => state.scores)
  const [error, setError] = useState('')
  const panelRef = useRef<HTMLElement>(null)
  const hasNextLevel = outcome === 'won' && level < LEVEL_COUNT
  const canSave = !hasNextLevel && qualifiesForEntry(score, scores)

  useEffect(() => {
    panelRef.current
      ?.querySelector<HTMLElement>('[data-initial-focus]')
      ?.focus()
  }, [])

  function saveScore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = new FormData(event.currentTarget).get('name')
    if (typeof name !== 'string') return

    try {
      const store = useGameStore.getState()
      if (qualifiesForEntry(score, store.scores)) {
        store.addScore({ name, score, date: todayISODate() })
      }
      navigate('scores')
    } catch {
      setError('No se pudo guardar el puntaje. Volvé a intentarlo.')
    }
  }

  return (
    <section
      className="arcade-screen result-screen"
      ref={panelRef}
      aria-labelledby="result-title"
      onKeyDown={(event) => {
        if (event.key === 'Escape') navigate('menu')
      }}
    >
      <h1 id="result-title" data-initial-focus tabIndex={-1}>
        {hasNextLevel
          ? '¡Nivel superado!'
          : outcome === 'won'
            ? '¡Campaña completada!'
            : 'Fin de la partida'}
      </h1>
      <p>
        {hasNextLevel ? 'Puntaje' : 'Puntaje final'} <strong>{score}</strong>
      </p>
      {hasNextLevel && (
        <button type="button" onClick={continueGame}>
          Continuar al nivel {level + 1}
        </button>
      )}
      {canSave && (
        <form className="arcade-actions score-form" onSubmit={saveScore}>
          <label htmlFor="player-name">Nombre para el ranking</label>
          <input
            id="player-name"
            name="name"
            required
            minLength={SCORE_NAME_MIN}
            maxLength={SCORE_NAME_MAX}
            pattern={`[A-Za-z0-9 '_\\-]{${SCORE_NAME_MIN},${SCORE_NAME_MAX}}`}
            aria-describedby="name-format"
            autoComplete="off"
          />
          <small id="name-format">
            Usá de 3 a 8 caracteres: letras sin acento, números, espacios,
            apóstrofo, guion o guion bajo.
          </small>
          {error !== '' && <p role="alert">{error}</p>}
          <button type="submit">Guardar puntaje</button>
        </form>
      )}
      <button type="button" onClick={() => navigate('menu')}>
        {canSave ? 'Volver sin guardar' : 'Volver al menú'}
      </button>
    </section>
  )
}
