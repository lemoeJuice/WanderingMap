import { afterEach, describe, expect, it } from 'vitest'
import { createId } from '../shared'
import {
  createRepositories,
  deleteDatabase,
} from '../../repositories/indexeddb/repositories'
import { WanderDatabase } from '../../repositories/indexeddb/database'
import { ConnectionService } from './connectionService'
import type { Place } from '../place/place'

const names: string[] = []
const timestamp = '2026-08-01T10:00:00.000Z'

function makePlace(id: string, name: string): Place {
  return {
    id,
    name,
    coordinate: { longitude: 118.78, latitude: 32.04 },
    category: 'other',
    tags: [],
    photos: [],
    lifecycle: 'active',
    timezone: 'Asia/Shanghai',
    visibility: 'private',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

afterEach(async () => {
  await Promise.all(names.splice(0).map(deleteDatabase))
})

describe('ConnectionService and manual transit persistence', () => {
  it('persists a directional connection and its line/service atomically', async () => {
    const name = `connection-${createId()}`
    names.push(name)
    const repositories = createRepositories(new WanderDatabase(name))
    await Promise.all([
      repositories.places.put(makePlace('from', 'Home')),
      repositories.places.put(makePlace('to', 'Station')),
    ])

    const connection = await new ConnectionService(
      repositories.places,
      repositories.connections,
    ).create({
      fromPlaceId: 'from',
      toPlaceId: 'to',
      mode: 'metro',
      direction: 'one-way',
      lineName: 'Line 3',
      firstDeparture: '05:00',
      lastDeparture: '23:00',
    })
    const line = await repositories.transitLines.get(connection.transitLineId!)
    const service = await repositories.transitServices.get(
      connection.transitServiceId!,
    )
    expect(connection.direction).toBe('one-way')
    expect(line?.name).toBe('Line 3')
    expect(service).toMatchObject({
      lineId: line?.id,
      firstDeparture: '05:00',
      lastDeparture: '23:00',
      source: 'manual',
    })

    await expect(
      new ConnectionService(
        repositories.places,
        repositories.connections,
      ).create({
        fromPlaceId: 'from',
        toPlaceId: 'to',
        mode: 'bus',
        direction: 'bidirectional',
        durationMinutes: -1,
        lineName: 'Invalid service',
      }),
    ).rejects.toThrow()
    expect(await repositories.transitLines.list()).toHaveLength(1)
    expect(await repositories.transitServices.list()).toHaveLength(1)
    repositories.close()
  })
})
