import { z } from 'zod'
import { entityFields } from '../shared'

export const visitRecordSchema = z
  .object({
    ...entityFields,
    placeId: z.string().min(1),
    visitedAt: z.string().datetime(),
    startedAt: z.string().datetime().optional(),
    endedAt: z.string().datetime().optional(),
    source: z.enum(['manual', 'journey']).default('manual'),
    journeyId: z.string().optional(),
    note: z.string().max(4000).optional(),
  })
  .refine(
    (record) =>
      !record.endedAt ||
      !record.startedAt ||
      record.endedAt >= record.startedAt,
    {
      message: 'Visit end must be after its start',
      path: ['endedAt'],
    },
  )
  .refine(
    (record) => record.source !== 'journey' || Boolean(record.journeyId),
    {
      message: 'Journey visits must reference their recorded journey',
      path: ['journeyId'],
    },
  )

export type VisitRecord = z.infer<typeof visitRecordSchema>

export function dwellMinutes(record: VisitRecord): number | undefined {
  if (!record.startedAt || !record.endedAt) return undefined
  return Math.max(
    0,
    (Date.parse(record.endedAt) - Date.parse(record.startedAt)) / 60_000,
  )
}
