import { z } from 'zod'

// Electron's renderer uses a CSP that disallows dynamic code generation.
z.config({ jitless: true })

export const SCORES_STORAGE_KEY = 'arkanoid.scores.v1'
export const MAX_SCORES = 10
export const SCORE_NAME_MIN = 3
export const SCORE_NAME_MAX = 8
export const LEGACY_SCORES_HEADER = 'ARKANOID-SCORES 1'
export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

// Labels explícitas del modo de almacenamiento (sin Electron real en Fase 2).
// - 'mock-web': implementación web con localStorage (la usada en el navegador).
// - 'mock-electron': IPC mock para futuro Electron (Fase 5); hoy es un
//   contenedor en memoria que simula el canal IPC sin acceder a window.electron.
export const STORAGE_MODE_WEB = 'mock-web' as const
export const STORAGE_MODE_ELECTRON = 'mock-electron' as const
export type StorageMode = typeof STORAGE_MODE_WEB | typeof STORAGE_MODE_ELECTRON
export const DEFAULT_STORAGE_MODE: StorageMode = STORAGE_MODE_WEB

export interface ScoreEntry {
  name: string
  score: number
  date: string
}

export type NewScore = ScoreEntry

const scoreEntrySchema = z.object({
  name: z.string().min(SCORE_NAME_MIN).max(SCORE_NAME_MAX),
  score: z.number().int().positive(),
  date: z.string().regex(DATE_REGEX),
})

const newScoreSchema = scoreEntrySchema

export type ScoreEntryInput = z.infer<typeof scoreEntrySchema>

// Caracteres permitidos del legacy: A-Z, 0-9 y espacio, apóstrofe, guion, underscore.

/**
 * Sanitiza un nombre al formato legacy:
 * - mayúsculas
 * - descarta todo lo que no sea A-Z0-9, espacio, ', - o _
 * - trunca a 8 caracteres
 * - vacío → 'AAA'
 * - longitud 1-2 → completa a la derecha con 'A' (mínimo 3)
 */
export function sanitizeName(raw: string): string {
  const upper = raw.toUpperCase()
  const filtered = upper.replace(/[^A-Z0-9 '_-]/g, '')
  const truncated = filtered.slice(0, SCORE_NAME_MAX)
  if (truncated.length === 0) return 'AAA'
  if (truncated.length < SCORE_NAME_MIN) {
    return truncated.padEnd(SCORE_NAME_MIN, 'A')
  }
  return truncated
}

/**
 * Normaliza y valida una entrada nueva. Lanza si la validación Zod falla.
 */
export function normalizeScoreEntry(entry: NewScore): ScoreEntry {
  const candidate: ScoreEntry = {
    name: sanitizeName(entry.name),
    score: entry.score,
    date: entry.date,
  }
  const parsed = newScoreSchema.safeParse(candidate)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')
    throw new Error(`Score inválido: ${issues}`)
  }
  return parsed.data
}

export function todayISODate(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Qualifies legacy: solo score > 0 y (si ya hay 10 o más) score > último.
 * Con menos de 10, cualquier score > 0 califica.
 */
export function qualifiesForEntry(
  score: number,
  scores: readonly ScoreEntry[],
): boolean {
  if (!Number.isInteger(score) || score <= 0) return false
  if (scores.length < MAX_SCORES) return true
  const sorted = sortScores(scores)
  const last = sorted[sorted.length - 1]
  if (last === undefined) return false
  return score > last.score
}

/**
 * Ordena descendente por score de forma estable:
 * ante empate se conserva el orden de inserción original.
 */
export function sortScores(scores: readonly ScoreEntry[]): ScoreEntry[] {
  return scores
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      if (b.entry.score !== a.entry.score) return b.entry.score - a.entry.score
      return a.index - b.index
    })
    .map(({ entry }) => entry)
}

/** Inserta respetando el orden estable y trunca a top-10. */
export function insertScore(
  scores: readonly ScoreEntry[],
  entry: ScoreEntry,
): ScoreEntry[] {
  return sortScores([...scores, entry]).slice(0, MAX_SCORES)
}

export function serializeScores(scores: readonly ScoreEntry[]): string {
  return JSON.stringify(scores)
}

export function parseStoredScores(raw: string | null): ScoreEntry[] {
  if (raw === null || raw.trim() === '') return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const valid: ScoreEntry[] = []
  for (const item of parsed) {
    const result = scoreEntrySchema.safeParse(item)
    if (result.success) valid.push(result.data)
  }
  return sortScores(valid).slice(0, MAX_SCORES)
}

/**
 * Migrador del TSV legacy:
 *   ARKANOID-SCORES 1
 *   NAME\tSCORE\tDATE (YYYY-MM-DD)
 * Ignora líneas inválidas (sin tabs, score no numérico, fecha inválida),
 * sanitiza nombres, ordena estable descendente y trunca a top-10.
 */
export function migrateLegacyScores(tsv: string): ScoreEntry[] {
  const lines = tsv.split(/\r?\n/)
  const entries: ScoreEntry[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed === LEGACY_SCORES_HEADER) continue
    const parts = line.split('\t')
    if (parts.length !== 3) continue
    const rawName = parts[0] ?? ''
    const rawScore = parts[1] ?? ''
    const rawDate = parts[2] ?? ''
    const score = Number(rawScore)
    if (!Number.isInteger(score) || score <= 0) continue
    const candidate: ScoreEntry = {
      name: sanitizeName(rawName),
      score,
      date: rawDate.trim(),
    }
    if (!DATE_REGEX.test(candidate.date)) continue
    const parsed = scoreEntrySchema.safeParse(candidate)
    if (!parsed.success) continue
    entries.push(parsed.data)
  }
  return sortScores(entries).slice(0, MAX_SCORES)
}

export interface StorageService {
  getScores(): ScoreEntry[]
  saveScore(entry: NewScore): ScoreEntry[]
  clearScores(): void
}

function safeGetLocalStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

/**
 * Implementación web (mock-web): persiste en localStorage
 * bajo la clave 'arkanoid.scores.v1' como JSON.
 */
export class LocalStorageStorageService implements StorageService {
  readonly mode = STORAGE_MODE_WEB
  private readonly storage: Storage | null

  constructor(storage: Storage | null = safeGetLocalStorage()) {
    this.storage = storage
  }

  getScores(): ScoreEntry[] {
    if (this.storage === null) return []
    const raw = this.storage.getItem(SCORES_STORAGE_KEY)
    return parseStoredScores(raw)
  }

  saveScore(entry: NewScore): ScoreEntry[] {
    const normalized = normalizeScoreEntry(entry)
    const current = this.getScores()
    const next = insertScore(current, normalized)
    this.persist(next)
    return next
  }

  clearScores(): void {
    this.storage?.removeItem(SCORES_STORAGE_KEY)
  }

  private persist(scores: ScoreEntry[]): void {
    if (this.storage === null) {
      throw new Error('El almacenamiento de puntajes no está disponible')
    }
    this.storage.setItem(SCORES_STORAGE_KEY, serializeScores(scores))
  }
}

/**
 * IPC mock para futuro Electron (Fase 5, mock-electron):
 * simula el canal IPC con un contenedor en memoria.
 * NO usa Electron real ni window.electron en esta fase.
 */
export class MockElectronStorageService implements StorageService {
  readonly mode = STORAGE_MODE_ELECTRON
  private memory: ScoreEntry[] = []

  getScores(): ScoreEntry[] {
    // Mock IPC: en Fase 5 esto llamaría a ipcRenderer.invoke('scores:get').
    return sortScores(this.memory).slice(0, MAX_SCORES)
  }

  saveScore(entry: NewScore): ScoreEntry[] {
    const normalized = normalizeScoreEntry(entry)
    this.memory = insertScore(this.memory, normalized)
    return [...this.memory]
  }

  clearScores(): void {
    this.memory = []
  }
}

export function createStorageService(
  mode: StorageMode = DEFAULT_STORAGE_MODE,
): StorageService {
  if (mode === STORAGE_MODE_ELECTRON) return new MockElectronStorageService()
  return new LocalStorageStorageService()
}

export const webStorage: StorageService = new LocalStorageStorageService()

type DesktopRanking = {
  readScores(): { ok: true; data: string | null } | { ok: false }
  writeScores(scores: ScoreEntry[]): { ok: boolean }
}

declare global {
  interface Window {
    arkanoidDesktop?: DesktopRanking
  }
}

export function createRuntimeStorage(): Pick<
  StorageService,
  'getScores' | 'saveScore'
> {
  const desktop =
    typeof window === 'undefined' ? undefined : window.arkanoidDesktop
  if (!desktop) return new LocalStorageStorageService()

  const getScores = (): ScoreEntry[] => {
    const result = desktop.readScores()
    if (!result.ok) throw new Error('No se pudo leer el ranking')
    return parseStoredScores(result.data)
  }

  return {
    getScores,
    saveScore(entry) {
      const next = insertScore(getScores(), normalizeScoreEntry(entry))
      if (!desktop.writeScores(next).ok)
        throw new Error('No se pudo guardar el ranking')
      return next
    },
  }
}
