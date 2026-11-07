import { describe, expect, it } from 'vitest'
import { ballDrain, INITIAL_LIVES, paddleRebound } from './levelRules'
import { loadCampaignLevel, loadLevel } from './levels/level'
import levelData from './levels/level_01.json'

describe('nivel 1', () => {
  it('carga 72 ladrillos y un solo bonus desde el JSON', () => {
    const bricks = loadLevel(levelData)

    expect(bricks).toHaveLength(72)
    expect(bricks.filter(({ multiball }) => multiball)).toEqual([
      expect.objectContaining({ row: 5, column: 2 }),
    ])
  })

  it('rechaza filas incompletas o un bonus en un hueco', () => {
    expect(() => loadLevel({ ...levelData, rows: ['BBBB'] })).toThrow()
    expect(() =>
      loadLevel({
        ...levelData,
        rows: [...levelData.rows.slice(0, 5), 'YY.YYYYYYYYY'],
      }),
    ).toThrow()
  })
})

describe('nivel 2', () => {
  it('carga un tablero distinto de 48 ladrillos con un solo bonus', () => {
    const bricks = loadCampaignLevel(2)

    expect(bricks).toHaveLength(48)
    expect(bricks.filter(({ multiball }) => multiball)).toEqual([
      expect.objectContaining({ row: 5, column: 4 }),
    ])
  })
})

describe('reglas de partida', () => {
  it('devuelve siete rebotes ascendentes y limita los impactos fuera de la paleta', () => {
    const rebounds = [-1, -2 / 3, -1 / 3, 0, 1 / 3, 2 / 3, 1].map(paddleRebound)

    expect(rebounds.map(({ x }) => x)).toEqual([
      -300, -250, -150, 0, 150, 250, 300,
    ])
    expect(rebounds.every(({ y }) => y < 0)).toBe(true)
    expect(paddleRebound(-1.5)).toEqual(rebounds[0])
    expect(paddleRebound(1.5)).toEqual(rebounds[6])
  })

  it('conserva vida y puntaje mientras quede alguna pelota activa', () => {
    expect(ballDrain(2, INITIAL_LIVES, 12)).toBeNull()
    expect(ballDrain(1, INITIAL_LIVES, 12)).toBeNull()
    expect(ballDrain(0, INITIAL_LIVES, 12)).toEqual({ lives: 2, score: 9 })
  })

  it('agota la última vida y aplica una sola penalización', () => {
    expect(ballDrain(0, 1, 11)).toEqual({ lives: 0, score: 8 })
  })
})
