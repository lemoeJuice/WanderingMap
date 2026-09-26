import { z } from 'zod'
import { entityFields } from '../shared'
import { timeRuleSchema } from '../time/timeRule'
import { ianaTimezoneSchema } from '../time/timeRule'

export const transitLineSchema = z.object({
  ...entityFields,
  name: z.string().min(1),
  mode: z.enum(['metro', 'bus', 'train']),
  operator: z.string().optional(),
  color: z.string().optional(),
})

export const transitServiceSchema = z.object({
  ...entityFields,
  lineId: z.string().min(1),
  timezone: ianaTimezoneSchema.default('UTC'),
  schedule: z.array(timeRuleSchema).default([]),
  firstDeparture: z.string().optional(),
  lastDeparture: z.string().optional(),
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
    .default([]),
  source: z.enum(['manual', 'provider']).default('manual'),
})

export type TransitLine = z.infer<typeof transitLineSchema>
export type TransitService = z.infer<typeof transitServiceSchema>
