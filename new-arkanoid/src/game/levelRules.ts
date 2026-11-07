export const POINTS_PER_BRICK = 2
export const INITIAL_LIVES = 3
export const MAX_BALLS = 3
const POINTS_PER_LOST_LIFE = 3

const PADDLE_VELOCITIES = [
  { x: -300, y: -300 },
  { x: -250, y: -350 },
  { x: -150, y: -400 },
  { x: 0, y: -425 },
  { x: 150, y: -400 },
  { x: 250, y: -350 },
  { x: 300, y: -300 },
] as const

export function paddleRebound(offset: number) {
  const clamped = Math.max(-1, Math.min(1, offset))
  const zone = Math.round(clamped * 3 + 3)
  return PADDLE_VELOCITIES[zone] ?? PADDLE_VELOCITIES[3]
}

export function ballDrain(activeBalls: number, lives: number, score: number) {
  if (activeBalls > 0) return null
  return { lives: lives - 1, score: score - POINTS_PER_LOST_LIFE }
}
