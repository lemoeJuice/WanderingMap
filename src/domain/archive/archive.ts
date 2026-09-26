import { z } from 'zod'
import { connectionSchema } from '../connection/connection'
import { journeySchema } from '../journey/journey'
import { placeSchema } from '../place/place'
import { appSettingsSchema } from '../settings/settings'
import { transitLineSchema, transitServiceSchema } from '../transit/transit'
import { visitRecordSchema } from '../visit/visitRecord'

export const ARCHIVE_SCHEMA_VERSION = 2

export const wanderArchiveSchema = z.object({
  schemaVersion: z.literal(ARCHIVE_SCHEMA_VERSION),
  exportedAt: z.string().datetime(),
  places: z.array(placeSchema),
  connections: z.array(connectionSchema),
  journeys: z.array(journeySchema),
  visitRecords: z.array(visitRecordSchema).default([]),
  transitLines: z.array(transitLineSchema).default([]),
  transitServices: z.array(transitServiceSchema).default([]),
  settings: appSettingsSchema.optional(),
})

export type WanderArchive = z.infer<typeof wanderArchiveSchema>

const legacyTimeRuleSchema = z
  .object({
    days: z
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
    start: z.string().optional(),
    end: z.string().optional(),
    timezone: z.string().optional(),
    validFrom: z.string().optional(),
    validUntil: z.string().optional(),
    note: z.string().optional(),
  })
  .passthrough()

const legacyArchiveSchema = z
  .object({
    schemaVersion: z.literal(1),
    exportedAt: z.string().datetime().optional(),
    places: z.array(z.record(z.string(), z.unknown())),
    connections: z.array(z.record(z.string(), z.unknown())),
    journeys: z.array(z.record(z.string(), z.unknown())),
    settings: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough()

function migrateLegacyTimeRules(value: unknown): unknown {
  if (!Array.isArray(value)) return value
  return value.map((rawRule) => {
    const parsed = legacyTimeRuleSchema.safeParse(rawRule)
    if (!parsed.success) return rawRule
    const rule = parsed.data
    const { start, end, ...rest } = rule
    return {
      ...rest,
      timezone: rule.timezone ?? 'UTC',
      days: rule.days ?? [
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
        'sunday',
      ],
      intervals: start && end ? [{ start, end }] : [],
      exceptions: [],
    }
  })
}

export function migrateArchive(input: unknown): WanderArchive {
  const version =
    typeof input === 'object' && input !== null && 'schemaVersion' in input
      ? (input as { schemaVersion?: unknown }).schemaVersion
      : undefined

  if (version === ARCHIVE_SCHEMA_VERSION)
    return wanderArchiveSchema.parse(input)
  if (version !== 1)
    throw new Error(`Unsupported archive schema version: ${String(version)}`)

  const legacy = legacyArchiveSchema.parse(input)
  const exportedAt = legacy.exportedAt ?? new Date().toISOString()
  const places = legacy.places.map((place) => {
    const oldLifecycle = place.visitState
    const migrated: Record<string, unknown> = { ...place }
    delete migrated.visitState
    migrated.lifecycle =
      oldLifecycle === 'archived' || oldLifecycle === 'wishlist'
        ? oldLifecycle
        : 'active'
    migrated.timezone =
      typeof place.timezone === 'string' ? place.timezone : 'UTC'
    if ('openingHours' in place)
      migrated.openingHours = migrateLegacyTimeRules(place.openingHours)
    if ('recommendedTimes' in place)
      migrated.recommendedTimes = migrateLegacyTimeRules(place.recommendedTimes)
    return migrated
  })
  const transitLines: unknown[] = []
  const transitServices: unknown[] = []
  const connections = legacy.connections.map((connection, index) => {
    const migrated: Record<string, unknown> = {
      direction: 'one-way',
      source: 'manual',
      ...connection,
    }
    const transit =
      typeof connection.transit === 'object' && connection.transit !== null
        ? (connection.transit as Record<string, unknown>)
        : undefined
    delete migrated.transit
    if (!transit) return migrated

    const connectionId =
      typeof connection.id === 'string' ? connection.id : `legacy-${index}`
    const connectionTimestamp =
      typeof connection.updatedAt === 'string'
        ? connection.updatedAt
        : typeof connection.createdAt === 'string'
          ? connection.createdAt
          : exportedAt
    const transitMode = connection.mode
    const supportedMode =
      transitMode === 'metro' ||
      transitMode === 'bus' ||
      transitMode === 'train'
        ? transitMode
        : undefined
    const lineName =
      typeof transit.lineName === 'string' ? transit.lineName.trim() : ''
    const lineId = `legacy-line:${connectionId}`
    const serviceId = `legacy-service:${connectionId}`
    if (supportedMode && lineName) {
      transitLines.push({
        id: lineId,
        name: lineName,
        mode: supportedMode,
        operator:
          typeof transit.operator === 'string' ? transit.operator : undefined,
        createdAt: connectionTimestamp,
        updatedAt: connectionTimestamp,
      })
      transitServices.push({
        id: serviceId,
        lineId,
        timezone:
          typeof transit.timezone === 'string' ? transit.timezone : 'UTC',
        schedule: [],
        firstDeparture:
          typeof transit.firstDeparture === 'string'
            ? transit.firstDeparture
            : undefined,
        lastDeparture:
          typeof transit.lastDeparture === 'string'
            ? transit.lastDeparture
            : undefined,
        serviceDays: Array.isArray(transit.serviceDays)
          ? transit.serviceDays
          : [],
        source: 'manual',
        createdAt: connectionTimestamp,
        updatedAt: connectionTimestamp,
      })
      migrated.transitLineId = lineId
      migrated.transitServiceId = serviceId
    }
    migrated.transitOverride = {
      timezone:
        typeof transit.timezone === 'string' ? transit.timezone : undefined,
      firstDeparture:
        typeof transit.firstDeparture === 'string'
          ? transit.firstDeparture
          : undefined,
      lastDeparture:
        typeof transit.lastDeparture === 'string'
          ? transit.lastDeparture
          : undefined,
      serviceDays: Array.isArray(transit.serviceDays)
        ? transit.serviceDays
        : undefined,
      note: typeof transit.note === 'string' ? transit.note : undefined,
    }
    return migrated
  })
  const journeys = legacy.journeys.map((journey) => ({
    kind: 'planned',
    visitRecordIds: [],
    ...journey,
  }))

  return wanderArchiveSchema.parse({
    schemaVersion: ARCHIVE_SCHEMA_VERSION,
    exportedAt,
    places,
    connections,
    journeys,
    visitRecords: [],
    transitLines,
    transitServices,
  })
}
