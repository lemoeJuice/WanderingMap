import { afterEach, describe, expect, it } from 'vitest'
import Dexie from 'dexie'
import { createId } from '../../domain/shared'
import type { Place } from '../../domain/place/place'
import { createRepositories, deleteDatabase } from './repositories'
import { WanderDatabase } from './database'

const dbName = () => `wander-map-test-${createId()}`
const timestamp = '2026-05-10T12:00:00.000Z'
const databases: string[] = []

afterEach(async () => {
  await Promise.all(databases.splice(0).map(deleteDatabase))
})

describe('IndexedDB repositories', () => {
  it('supports validated CRUD and visit lookup', async () => {
    const name = dbName()
    databases.push(name)
    const db = new WanderDatabase(name)
    const repositories = createRepositories(db)
    const place: Place = {
      id: 'place-1',
      name: 'Canal Cafe',
      coordinate: { longitude: 118.78, latitude: 32.04 },
      category: 'food',
      tags: ['coffee'],
      lifecycle: 'active',
      timezone: 'Asia/Shanghai',
      visibility: 'private',
      createdAt: timestamp,
      updatedAt: timestamp,
      photos: [],
    }
    await repositories.places.put(place)
    expect(await repositories.places.get(place.id)).toMatchObject({
      name: 'Canal Cafe',
    })
    await repositories.visits.put({
      id: 'visit-1',
      placeId: place.id,
      visitedAt: timestamp,
      source: 'manual',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    expect(await repositories.visits.listForPlace(place.id)).toHaveLength(1)
    await repositories.places.delete(place.id)
    expect(await repositories.places.get(place.id)).toBeUndefined()
    repositories.close()
  })

  it('upgrades the old database schema without treating a visited flag as a visit record', async () => {
    const name = dbName()
    databases.push(name)
    const oldDb = new Dexie(name)
    oldDb.version(1).stores({
      places: '&id, category, visitState, updatedAt',
      connections: '&id, fromPlaceId, toPlaceId, mode, updatedAt',
      journeys: '&id, startedAt, updatedAt',
      settings: '&id',
      assets: '&id',
      meta: '&key',
    })
    await oldDb.open()
    await oldDb.table('places').put({
      id: 'old-place',
      name: 'Old place',
      coordinate: { longitude: 0, latitude: 0 },
      category: 'other',
      visitState: 'visited',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await oldDb.table('connections').put({
      id: 'old-connection',
      fromPlaceId: 'old-place',
      toPlaceId: 'somewhere',
      mode: 'bus',
      transit: {
        lineName: 'Legacy Bus',
        operator: 'City Transit',
        firstDeparture: '06:00',
        lastDeparture: '22:30',
        serviceDays: ['monday', 'tuesday'],
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    oldDb.close()

    const repositories = createRepositories(new WanderDatabase(name))
    const place = await repositories.places.get('old-place')
    expect(place?.lifecycle).toBe('active')
    expect(await repositories.visits.listForPlace('old-place')).toEqual([])
    const migratedConnection =
      await repositories.connections.get('old-connection')
    expect(migratedConnection?.transitLineId).toBeDefined()
    expect(migratedConnection?.transitServiceId).toBeDefined()
    const migratedLine = await repositories.transitLines.get(
      migratedConnection!.transitLineId!,
    )
    expect(migratedLine?.name).toBe('Legacy Bus')
    expect(migratedConnection?.transitOverride?.lastDeparture).toBe('22:30')
    repositories.close()
  })
})
