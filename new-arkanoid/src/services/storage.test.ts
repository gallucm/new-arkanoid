import { beforeEach, describe, expect, it } from 'vitest'
import {
  LocalStorageStorageService,
  MAX_SCORES,
  SCORES_STORAGE_KEY,
  insertScore,
  migrateLegacyScores,
  parseStoredScores,
  qualifiesForEntry,
  sanitizeName,
  serializeScores,
  sortScores,
  type ScoreEntry,
} from './storage'

function makeEntry(name: string, score: number, date = '2026-11-06'): ScoreEntry {
  return { name, score, date }
}

describe('sanitizeName', () => {
  it('borra # y @ y pasa a mayúsculas', () => {
    expect(sanitizeName('a#b@c')).toBe('ABC')
  })

  it('conserva espacio, guion, underscore y apóstrofe', () => {
    expect(sanitizeName("a b-c_d'e")).toBe("A B-C_D'")
  })

  it('trunca a 8 caracteres', () => {
    expect(sanitizeName('ABCDEFGHIJKL')).toBe('ABCDEFGH')
  })

  it('vacío o solo caracteres inválidos → AAA', () => {
    expect(sanitizeName('')).toBe('AAA')
    expect(sanitizeName('###@@@')).toBe('AAA')
  })

  it('completa longitud 1-2 con A hasta 3', () => {
    expect(sanitizeName('X')).toBe('XAA')
    expect(sanitizeName('ab')).toBe('ABA')
  })
})

describe('qualifiesForEntry', () => {
  it('score 0 o negativo no califica', () => {
    expect(qualifiesForEntry(0, [])).toBe(false)
    expect(qualifiesForEntry(-5, [])).toBe(false)
  })

  it('con menos de 10, cualquier score > 0 califica', () => {
    expect(qualifiesForEntry(1, [])).toBe(true)
  })

  it('con top lleno, solo califica score > último', () => {
    const full: ScoreEntry[] = Array.from({ length: MAX_SCORES }, (_, i) =>
      makeEntry(`P${i}`, 100 - i),
    )
    const last = full[full.length - 1]?.score ?? 0
    expect(qualifiesForEntry(last, full)).toBe(false)
    expect(qualifiesForEntry(last + 1, full)).toBe(true)
  })
})

describe('ordering estable', () => {
  it('ordena descendente y preserva orden de inserción ante empate 42/42', () => {
    const bob = makeEntry('BOB', 42, '2026-01-01')
    const ann = makeEntry('ANN', 42, '2026-01-02')
    const sorted = sortScores([bob, ann, makeEntry('TOP', 50)])
    expect(sorted.map((e) => e.name)).toEqual(['TOP', 'BOB', 'ANN'])
  })

  it('insertScore trunca a top-10', () => {
    let scores: ScoreEntry[] = []
    for (let i = 1; i <= 12; i++) {
      scores = insertScore(scores, makeEntry(`P${i}`, i))
    }
    expect(scores).toHaveLength(MAX_SCORES)
    expect(scores[0]?.score).toBe(12)
    expect(scores[MAX_SCORES - 1]?.score).toBe(3)
  })
})

describe('persistencia localStorage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('guardar → recargar → mismo top-10', () => {
    const service = new LocalStorageStorageService(localStorage)
    service.saveScore(makeEntry('NEW', 100))
    service.saveScore(makeEntry('HIGH', 99))
    service.saveScore(makeEntry('TOP', 50))

    const reloaded = new LocalStorageStorageService(localStorage)
    const scores = reloaded.getScores()
    expect(scores).toHaveLength(3)
    expect(scores.map((e) => e.name)).toEqual(['NEW', 'HIGH', 'TOP'])
    expect(localStorage.getItem(SCORES_STORAGE_KEY)).toContain('NEW')
  })

  it('clearScores vacía el top-10', () => {
    const service = new LocalStorageStorageService(localStorage)
    service.saveScore(makeEntry('NEW', 100))
    service.clearScores()
    expect(service.getScores()).toEqual([])
    expect(localStorage.getItem(SCORES_STORAGE_KEY)).toBeNull()
  })

  it('round-trip JSON serializeScores / parseStoredScores', () => {
    const original = [makeEntry('NEW', 100), makeEntry('HIGH', 99)]
    const roundTripped = parseStoredScores(serializeScores(original))
    expect(roundTripped).toEqual(original)
  })

  it('parseStoredScores ignora JSON corrupto y entradas inválidas', () => {
    expect(parseStoredScores('no-json')).toEqual([])
    expect(parseStoredScores(null)).toEqual([])
    expect(
      parseStoredScores('[{"name":"AB","score":10,"date":"2026-01-01"}]'),
    ).toEqual([])
  })
})

describe('migrateLegacyScores', () => {
  it('migra el fixture NEW 100 / HIGH 99 / TOP 50', () => {
    const tsv = [
      'ARKANOID-SCORES 1',
      'NEW\t100\t2026-11-06',
      'HIGH\t99\t2026-11-06',
      'TOP\t50\t2026-01-03',
    ].join('\n')
    const migrated = migrateLegacyScores(tsv)
    expect(migrated).toHaveLength(3)
    expect(migrated[0]).toEqual(makeEntry('NEW', 100, '2026-11-06'))
    expect(migrated[1]).toEqual(makeEntry('HIGH', 99, '2026-11-06'))
    expect(migrated[2]).toEqual(makeEntry('TOP', 50, '2026-01-03'))
  })

  it('ignora línea BAD sin tabs y score no numérico', () => {
    const tsv = [
      'ARKANOID-SCORES 1',
      'BADLINE',
      'NOB\t100\t2026-11-06',
      'MIS\tNaN\t2026-11-06',
      'OK\t10\t2026-11-06',
    ].join('\n')
    const migrated = migrateLegacyScores(tsv)
    expect(migrated).toHaveLength(2)
    expect(migrated.map((e) => e.name)).toEqual(['NOB', 'OKA'])
  })

  it('preserva orden estable con BOB/ANN 20/20 del fixture legacy', () => {
    const tsv = [
      'ARKANOID-SCORES 1',
      'TOP\t50\t2026-01-03',
      'BOB\t20\t2026-01-01',
      'ANN\t20\t2026-01-02',
    ].join('\n')
    const migrated = migrateLegacyScores(tsv)
    expect(migrated.map((e) => e.name)).toEqual(['TOP', 'BOB', 'ANN'])
  })
})
