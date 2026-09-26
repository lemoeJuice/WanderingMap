import { z } from 'zod'
import { coordinateSchema, entityFields } from '../shared'
import { ianaTimezoneSchema, timeRuleSchema } from '../time/timeRule'

export const placeSchema = z.object({
  ...entityFields,
  name: z.string().trim().min(1).max(160),
  coordinate: coordinateSchema,
  category: z.string().trim().min(1).max(48).default('other'),
  tags: z.array(z.string().trim().min(1).max(40)).default([]),
  description: z.string().max(4000).optional(),
  rating: z.number().min(0).max(5).optional(),
  note: z.string().max(10000).optional(),
  photos: z
    .array(z.object({ id: z.string(), name: z.string().optional() }))
    .default([]),
  lifecycle: z.enum(['wishlist', 'active', 'archived']).default('active'),
  openingHours: z.array(timeRuleSchema).optional(),
  recommendedTimes: z.array(timeRuleSchema).optional(),
  timezone: ianaTimezoneSchema.default('UTC'),
  visibility: z.enum(['private', 'shareable']).default('private'),
})

export type Place = z.infer<typeof placeSchema>
