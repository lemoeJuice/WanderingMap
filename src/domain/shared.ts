import { z } from 'zod'

export const entityFields = {
  id: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}

export const coordinateSchema = z.object({
  longitude: z.number().min(-180).max(180),
  latitude: z.number().min(-90).max(90),
})

export type Coordinate = z.infer<typeof coordinateSchema>
export type Entity = { id: string; createdAt: string; updatedAt: string }

export function createId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `wm-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
}

export function nowIso(): string {
  return new Date().toISOString()
}
