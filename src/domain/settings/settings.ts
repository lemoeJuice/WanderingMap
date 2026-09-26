import { z } from 'zod'
import { coordinateSchema } from '../shared'
import { ianaTimezoneSchema } from '../time/timeRule'

export const appSettingsSchema = z.object({
  id: z.literal('app'),
  timezone: ianaTimezoneSchema.default('UTC'),
  basemapStyle: z
    .string()
    .default('https://tiles.openfreemap.org/styles/liberty'),
  defaultCenter: coordinateSchema.default({
    longitude: 118.78,
    latitude: 32.04,
  }),
  defaultZoom: z.number().min(0).max(22).default(11),
  updatedAt: z.string().datetime(),
})

export type AppSettings = z.infer<typeof appSettingsSchema>
