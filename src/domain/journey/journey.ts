import { z } from 'zod'
import { coordinateSchema, entityFields } from '../shared'

export const journeyStepSchema = z.object({
  id: z.string().min(1),
  placeId: z.string().optional(),
  connectionId: z.string().optional(),
  label: z.string().optional(),
  coordinate: coordinateSchema.optional(),
  arrivedAt: z.string().datetime().optional(),
  departedAt: z.string().datetime().optional(),
})

export const journeySchema = z
  .object({
    ...entityFields,
    title: z.string().trim().min(1).max(160),
    kind: z.enum(['planned', 'recorded']).default('planned'),
    startedAt: z.string().datetime().optional(),
    endedAt: z.string().datetime().optional(),
    steps: z.array(journeyStepSchema).default([]),
    visitRecordIds: z.array(z.string()).default([]),
    note: z.string().max(10000).optional(),
    photos: z
      .array(z.object({ id: z.string(), name: z.string().optional() }))
      .default([]),
    tags: z.array(z.string()).default([]),
    visibility: z.enum(['private', 'shareable']).default('private'),
  })
  .refine(
    (journey) =>
      journey.kind === 'recorded' || journey.visitRecordIds.length === 0,
    {
      message: 'Planned journeys cannot reference visit records',
      path: ['visitRecordIds'],
    },
  )

export type JourneyStep = z.infer<typeof journeyStepSchema>
export type Journey = z.infer<typeof journeySchema>
