import { z } from 'zod'
import { entityFields } from '../shared'
import { ianaTimezoneSchema, timeRuleSchema } from '../time/timeRule'

export const connectionModeSchema = z.enum([
  'walk',
  'bike',
  'metro',
  'bus',
  'taxi',
  'drive',
  'train',
  'custom',
])
export const lineStringSchema = z.object({
  type: z.literal('LineString'),
  coordinates: z
    .array(
      z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
    )
    .min(2),
})

export const transitOverrideSchema = z.object({
  timezone: ianaTimezoneSchema.optional(),
  serviceDays: z
    .array(
      z.enum([
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
        'sunday',
      ]),
    )
    .optional(),
  schedule: z.array(timeRuleSchema).optional(),
  firstDeparture: z.string().optional(),
  lastDeparture: z.string().optional(),
  note: z.string().optional(),
})

export const connectionSchema = z
  .object({
    ...entityFields,
    fromPlaceId: z.string().min(1),
    toPlaceId: z.string().min(1),
    direction: z.enum(['one-way', 'bidirectional']).default('one-way'),
    mode: connectionModeSchema,
    geometry: lineStringSchema.optional(),
    durationMinutes: z.number().nonnegative().optional(),
    distanceMeters: z.number().nonnegative().optional(),
    cost: z.number().nonnegative().optional(),
    transitLineId: z.string().optional(),
    transitServiceId: z.string().optional(),
    transitOverride: transitOverrideSchema.optional(),
    note: z.string().max(4000).optional(),
    source: z
      .enum(['manual', 'routing-provider', 'transit-provider'])
      .default('manual'),
  })
  .refine((connection) => connection.fromPlaceId !== connection.toPlaceId, {
    message: 'A connection must link two different places',
    path: ['toPlaceId'],
  })

export type ConnectionMode = z.infer<typeof connectionModeSchema>
export type LineString = z.infer<typeof lineStringSchema>
export type TransitOverride = z.infer<typeof transitOverrideSchema>
export type Connection = z.infer<typeof connectionSchema>
export type { Coordinate } from '../shared'
