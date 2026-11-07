import { z } from 'zod'

export const BRICK_COLORS = {
  B: 0x48a6ff,
  R: 0xff5872,
  Y: 0xffd654,
} as const

type BrickCode = keyof typeof BRICK_COLORS

const levelSchema = z
  .object({
    rows: z.array(z.string().regex(/^[BRY.]{12}$/)).length(6),
    multiball: z.object({
      row: z.number().int().min(0).max(5),
      column: z.number().int().min(0).max(11),
    }),
  })
  .refine(
    ({ rows, multiball }) => rows[multiball.row]?.[multiball.column] !== '.',
    {
      message: 'El bonus de multiball debe estar en un ladrillo',
      path: ['multiball'],
    },
  )

export interface LevelBrick {
  row: number
  column: number
  color: number
  multiball: boolean
}

export function loadLevel(data: unknown): LevelBrick[] {
  const { rows, multiball } = levelSchema.parse(data)
  return rows.flatMap((row, rowIndex) =>
    Array.from(row).flatMap((code, column) =>
      code === '.'
        ? []
        : [
            {
              row: rowIndex,
              column,
              color: BRICK_COLORS[code as BrickCode],
              multiball:
                multiball.row === rowIndex && multiball.column === column,
            },
          ],
    ),
  )
}
