import { describe, expect, it } from 'vitest'
import { TimeEngine } from './timeEngine'
import type { Place } from '../place/place'
import type { Connection } from '../connection/connection'
import type { TimeRule } from './timeRule'

const stamp = '2026-01-01T00:00:00.000Z'
function placeWith(openingHours: TimeRule[]): Place {
  return {
    id: 'p',
    name: 'Place',
    coordinate: { longitude: 0, latitude: 0 },
    category: 'other',
    tags: [],
    lifecycle: 'active',
    timezone: 'UTC',
    visibility: 'private',
    createdAt: stamp,
    updatedAt: stamp,
    photos: [],
    openingHours,
  }
}
function rule(overrides: Partial<TimeRule> = {}): TimeRule {
  return {
    timezone: 'UTC',
    days: [
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday',
    ],
    intervals: [{ start: '09:00', end: '17:00' }],
    exceptions: [],
    ...overrides,
  }
}
function connection(overrides: Partial<Connection> = {}): Connection {
  return {
    id: 'c',
    fromPlaceId: 'a',
    toPlaceId: 'b',
    direction: 'one-way',
    mode: 'metro',
    source: 'manual',
    createdAt: stamp,
    updatedAt: stamp,
    ...overrides,
  }
}

describe('TimeEngine', () => {
  const engine = new TimeEngine()

  it('evaluates ordinary and multiple opening intervals', () => {
    const place = placeWith([
      rule({
        intervals: [
          { start: '09:00', end: '12:00' },
          { start: '13:00', end: '18:00' },
        ],
      }),
    ])
    expect(
      engine.getPlaceState(place, new Date('2026-01-05T10:00:00Z')).opening,
    ).toBe('available')
    expect(
      engine.getPlaceState(place, new Date('2026-01-05T12:30:00Z')).opening,
    ).toBe('unavailable')

    const overlapping = placeWith([
      rule({ intervals: [{ start: '09:00', end: '10:00' }] }),
      rule({ intervals: [{ start: '09:30', end: '12:00' }] }),
    ])
    expect(
      engine.getPlaceState(overlapping, new Date('2026-01-05T09:45:00Z'))
        .opening,
    ).toBe('available')
  })

  it('handles overnight intervals across the weekday boundary', () => {
    const place = placeWith([
      rule({
        days: ['monday'],
        intervals: [{ start: '22:00', end: '02:00' }],
      }),
    ])
    expect(
      engine.getPlaceState(place, new Date('2026-01-06T01:00:00Z')).opening,
    ).toBe('available')
    expect(
      engine.getPlaceState(place, new Date('2026-01-06T03:00:00Z')).opening,
    ).toBe('unavailable')
  })

  it('lets date exceptions replace weekly rules', () => {
    const place = placeWith([
      rule({
        exceptions: [{ date: '2026-01-05', closed: true, intervals: [] }],
      }),
    ])
    expect(
      engine.getPlaceState(place, new Date('2026-01-05T10:00:00Z')).opening,
    ).toBe('unavailable')
  })

  it('uses each rule IANA timezone when evaluating local hours', () => {
    const place = placeWith([
      rule({
        timezone: 'Asia/Tokyo',
        intervals: [{ start: '09:00', end: '10:00' }],
      }),
    ])
    expect(
      engine.getPlaceState(place, new Date('2026-01-05T00:30:00Z')).opening,
    ).toBe('closing-soon')
    expect(
      engine.getPlaceState(place, new Date('2026-01-05T02:00:00Z')).opening,
    ).toBe('unavailable')
  })

  it('prefers a manual connection override to provider service data', () => {
    const transit = {
      id: 'service',
      lineId: 'line',
      timezone: 'UTC',
      source: 'provider' as const,
      schedule: [rule({ intervals: [{ start: '05:00', end: '23:00' }] })],
      firstDeparture: '05:00',
      lastDeparture: '23:00',
      serviceDays: [],
      createdAt: stamp,
      updatedAt: stamp,
    }
    const item = connection({
      transitOverride: { timezone: 'UTC', lastDeparture: '21:00' },
    })
    expect(
      engine.getConnectionState(
        item,
        new Date('2026-01-05T21:30:00Z'),
        transit,
      ),
    ).toMatchObject({
      availability: 'unavailable',
      source: 'manual-override',
    })
    expect(
      engine.getConnectionState(
        connection(),
        new Date('2026-01-05T21:30:00Z'),
        transit,
      ).availability,
    ).toBe('available')
  })

  it('uses the previous service day for after-midnight transit departures', () => {
    const overnightService = {
      id: 'night-service',
      lineId: 'night-line',
      timezone: 'UTC',
      source: 'manual' as const,
      schedule: [],
      firstDeparture: '22:00',
      lastDeparture: '02:00',
      serviceDays: ['saturday' as const],
      createdAt: stamp,
      updatedAt: stamp,
    }
    expect(
      engine.getConnectionState(
        connection(),
        new Date('2026-01-04T01:00:00Z'),
        overnightService,
      ).availability,
    ).toBe('available')
    expect(
      engine.getConnectionState(
        connection(),
        new Date('2026-01-04T03:00:00Z'),
        overnightService,
      ).availability,
    ).toBe('unavailable')
  })
})
