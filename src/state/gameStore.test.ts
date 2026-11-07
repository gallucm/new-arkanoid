import { afterEach, describe, expect, it } from 'vitest'
import { INITIAL_LIVES } from '@/game/levelRules'
import { useGameStore } from './gameStore'

afterEach(() => useGameStore.setState(useGameStore.getInitialState()))

describe('campaña', () => {
  it('avanza al ganar el nivel 1 y conserva las vidas y el puntaje', () => {
    useGameStore.setState({ status: 'level', score: 123, lives: 2 })
    const { advanceLevel, setOutcome } = useGameStore.getState()

    expect(advanceLevel()).toBe(false)
    setOutcome('lost')
    expect(advanceLevel()).toBe(false)
    setOutcome('won')
    expect(advanceLevel()).toBe(true)
    expect(useGameStore.getState()).toMatchObject({
      level: 2,
      score: 123,
      lives: 2,
      outcome: null,
    })
    setOutcome('won')
    expect(advanceLevel()).toBe(false)
  })

  it('reinicia el progreso al iniciar otra partida', () => {
    useGameStore.setState({ level: 2, score: 123, lives: 0, outcome: 'lost' })
    useGameStore.getState().startCampaign()

    expect(useGameStore.getState()).toMatchObject({
      level: 1,
      score: 0,
      lives: INITIAL_LIVES,
      outcome: null,
    })
  })
})
