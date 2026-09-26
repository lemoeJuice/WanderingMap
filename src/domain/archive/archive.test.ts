import { describe, expect, it } from 'vitest'
import { migrateArchive, wanderArchiveSchema } from './archive'

const timestamp = '2026-01-01T12:00:00.000Z'

describe('archive validation and migration', () => {
  it('validates current archives and rejects invalid WGS84 coordinates', () => {
    const archive = {
      schemaVersion: 2,
      exportedAt: timestamp,
      places: [
        {
          id: 'place-1',
          name: 'Canal',
          coordinate: { longitude: 181, latitude: 32 },
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      connections: [],
      journeys: [],
    }
    expect(wanderArchiveSchema.safeParse(archive).success).toBe(false)
  })

  it('migrates legacy visit state and time rules without inventing visits', () => {
    const migrated = migrateArchive({
      schemaVersion: 1,
      exportedAt: timestamp,
      places: [
        {
          id: 'p1',
          name: 'Cafe',
          coordinate: { longitude: 1, latitude: 2 },
          category: 'food',
          tags: [],
          visitState: 'visited',
          visibility: 'private',
          createdAt: timestamp,
          updatedAt: timestamp,
          openingHours: [{ days: ['monday'], start: '09:00', end: '17:00' }],
        },
      ],
      connections: [
        {
          id: 'c1',
          fromPlaceId: 'p1',
          toPlaceId: 'p2',
          mode: 'metro',
          transit: {
            lineName: 'Blue Line',
            operator: 'City Transit',
            firstDeparture: '05:30',
            lastDeparture: '23:10',
            serviceDays: ['monday', 'tuesday'],
          },
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      journeys: [
        {
          id: 'j1',
          title: 'Plan',
          steps: [],
          tags: [],
          visibility: 'private',
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
    })
    expect(migrated.places[0]?.lifecycle).toBe('active')
    expect(migrated.places[0]?.openingHours?.[0]?.intervals).toEqual([
      { start: '09:00', end: '17:00' },
    ])
    expect(migrated.visitRecords).toEqual([])
    expect(migrated.journeys[0]?.kind).toBe('planned')
    expect(migrated.transitLines[0]).toMatchObject({
      name: 'Blue Line',
      operator: 'City Transit',
    })
    expect(migrated.transitServices[0]).toMatchObject({
      firstDeparture: '05:30',
      lastDeparture: '23:10',
    })
    expect(migrated.connections[0]?.transitServiceId).toBe(
      migrated.transitServices[0]?.id,
    )
  })

  it('rejects unknown versions', () => {
    expect(() => migrateArchive({ schemaVersion: 99 })).toThrow(
      'Unsupported archive schema version',
    )
  })
})
