import { createStore } from 'zustand/vanilla'
import {
  createRuntimeStorage,
  type NewScore,
  type ScoreEntry,
} from '@/services/storage'

const MUTE_STORAGE_KEY = 'arkanoid.muted.v1'

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function persistMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_STORAGE_KEY, String(muted))
  } catch {
    // La preferencia de esta sesión sigue funcionando sin almacenamiento.
  }
}

export type GameStatus = 'intro' | 'menu' | 'scores' | 'exit' | 'level'
export type GameOutcome = 'won' | 'lost' | null

export interface GameState {
  status: GameStatus
  score: number
  lives: number
  outcome: GameOutcome
  muted: boolean
  scores: ScoreEntry[]
  setStatus: (status: GameStatus) => void
  setScore: (score: number) => void
  setLives: (lives: number) => void
  setOutcome: (outcome: GameOutcome) => void
  setMuted: (muted: boolean) => void
  toggleMuted: () => void
  setScores: (scores: ScoreEntry[]) => void
  addScore: (entry: NewScore) => ScoreEntry[]
  refreshScores: () => void
}

function readInitialScores(): ScoreEntry[] {
  try {
    return createRuntimeStorage().getScores()
  } catch {
    return []
  }
}

export const useGameStore = createStore<GameState>()((set, get) => ({
  status: 'intro',
  score: 0,
  lives: 3,
  outcome: null,
  muted: readMuted(),
  scores: readInitialScores(),
  setStatus: (status) => set({ status }),
  setScore: (score) => set({ score }),
  setLives: (lives) => set({ lives }),
  setOutcome: (outcome) => set({ outcome }),
  setMuted: (muted) => {
    persistMuted(muted)
    set({ muted })
  },
  toggleMuted: () => get().setMuted(!get().muted),
  setScores: (scores) => set({ scores }),
  addScore: (entry) => {
    const next = createRuntimeStorage().saveScore(entry)
    set({ scores: next })
    return next
  },
  refreshScores: () => {
    const scores = createRuntimeStorage().getScores()
    get().setScores(scores)
  },
}))
