import Dexie, { type Table } from 'dexie'
import type { Connection } from '../../domain/connection/connection'
import type { Journey } from '../../domain/journey/journey'
import type { Place } from '../../domain/place/place'
import type { AppSettings } from '../../domain/settings/settings'
import type { TransitLine, TransitService } from '../../domain/transit/transit'
import type { VisitRecord } from '../../domain/visit/visitRecord'

export interface MetaRecord {
  key: string
  value: number | string
}

export class WanderDatabase extends Dexie {
  places!: Table<Place, string>
  connections!: Table<Connection, string>
  journeys!: Table<Journey, string>
  visitRecords!: Table<VisitRecord, string>
  transitLines!: Table<TransitLine, string>
  transitServices!: Table<TransitService, string>
  settings!: Table<AppSettings, string>
  assets!: Table<{ id: string }, string>
  meta!: Table<MetaRecord, string>

  constructor(name = 'wander-map') {
    super(name)

    this.version(1).stores({
      places: '&id, category, visitState, updatedAt',
      connections: '&id, fromPlaceId, toPlaceId, mode, updatedAt',
      journeys: '&id, startedAt, updatedAt',
      settings: '&id',
      assets: '&id',
      meta: '&key',
    })

    this.version(2)
      .stores({
        places: '&id, category, lifecycle, updatedAt',
        connections: '&id, fromPlaceId, toPlaceId, mode, updatedAt',
        journeys: '&id, startedAt, updatedAt',
        visitRecords: '&id, placeId, visitedAt',
        transitLines: '&id, mode',
        transitServices: '&id, lineId',
        settings: '&id',
        assets: '&id',
        meta: '&key',
      })
      .upgrade(async (transaction) => {
        const oldPlaces = (await transaction
          .table('places')
          .toArray()) as Array<Record<string, unknown>>
        await transaction.table('places').bulkPut(
          oldPlaces.map((place) => {
            const lifecycle =
              place.visitState === 'wishlist' || place.visitState === 'archived'
                ? place.visitState
                : 'active'
            const timezone =
              typeof place.timezone === 'string' ? place.timezone : 'UTC'
            const migrateRules = (value: unknown): unknown =>
              Array.isArray(value)
                ? value.map((item) => {
                    if (typeof item !== 'object' || item === null) return item
                    const rule = item as Record<string, unknown>
                    const intervals = Array.isArray(rule.intervals)
                      ? rule.intervals
                      : typeof rule.start === 'string' &&
                          typeof rule.end === 'string'
                        ? [{ start: rule.start, end: rule.end }]
                        : []
                    const migratedRule: Record<string, unknown> = {
                      ...rule,
                      timezone:
                        typeof rule.timezone === 'string'
                          ? rule.timezone
                          : timezone,
                      days: Array.isArray(rule.days)
                        ? rule.days
                        : [
                            'monday',
                            'tuesday',
                            'wednesday',
                            'thursday',
                            'friday',
                            'saturday',
                            'sunday',
                          ],
                      intervals,
                      exceptions: Array.isArray(rule.exceptions)
                        ? rule.exceptions
                        : [],
                    }
                    delete migratedRule.start
                    delete migratedRule.end
                    return migratedRule
                  })
                : value
            const migrated: Record<string, unknown> = {
              ...place,
              lifecycle,
              timezone,
              category:
                typeof place.category === 'string' ? place.category : 'other',
              tags: Array.isArray(place.tags) ? place.tags : [],
              photos: Array.isArray(place.photos) ? place.photos : [],
              visibility:
                place.visibility === 'shareable' ? 'shareable' : 'private',
            }
            if ('openingHours' in place)
              migrated.openingHours = migrateRules(place.openingHours)
            if ('recommendedTimes' in place)
              migrated.recommendedTimes = migrateRules(place.recommendedTimes)
            delete migrated.visitState
            return migrated
          }),
        )
        const oldConnections = (await transaction
          .table('connections')
          .toArray()) as Array<Record<string, unknown>>
        const migratedConnections = [] as Array<Record<string, unknown>>
        for (const connection of oldConnections) {
          const transit =
            typeof connection.transit === 'object' &&
            connection.transit !== null
              ? (connection.transit as Record<string, unknown>)
              : undefined
          const migrated: Record<string, unknown> = {
            direction: 'one-way',
            source: 'manual',
            ...connection,
          }
          if (transit) {
            const connectionId = String(connection.id)
            const connectionTimestamp =
              typeof connection.updatedAt === 'string'
                ? connection.updatedAt
                : typeof connection.createdAt === 'string'
                  ? connection.createdAt
                  : new Date().toISOString()
            const mode = connection.mode
            const supportedMode =
              mode === 'metro' || mode === 'bus' || mode === 'train'
                ? mode
                : undefined
            const lineName =
              typeof transit.lineName === 'string'
                ? transit.lineName.trim()
                : ''
            if (supportedMode && lineName) {
              const lineId = `legacy-line:${connectionId}`
              const serviceId = `legacy-service:${connectionId}`
              await transaction.table('transitLines').put({
                id: lineId,
                name: lineName,
                mode: supportedMode,
                operator:
                  typeof transit.operator === 'string'
                    ? transit.operator
                    : undefined,
                createdAt: connectionTimestamp,
                updatedAt: connectionTimestamp,
              })
              await transaction.table('transitServices').put({
                id: serviceId,
                lineId,
                timezone:
                  typeof transit.timezone === 'string'
                    ? transit.timezone
                    : 'UTC',
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
              timezone: transit.timezone,
              firstDeparture: transit.firstDeparture,
              lastDeparture: transit.lastDeparture,
              serviceDays: transit.serviceDays,
              note: transit.note,
            }
          }
          delete migrated.transit
          migratedConnections.push(migrated)
        }
        await transaction.table('connections').bulkPut(migratedConnections)
        const oldJourneys = (await transaction
          .table('journeys')
          .toArray()) as Array<Record<string, unknown>>
        await transaction.table('journeys').bulkPut(
          oldJourneys.map((journey) => ({
            kind: 'planned',
            visitRecordIds: [],
            steps: [],
            tags: [],
            visibility: 'private',
            ...journey,
          })),
        )
        await transaction.table('meta').put({ key: 'schemaVersion', value: 2 })
      })
  }
}
