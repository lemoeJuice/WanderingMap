import { afterEach, describe, expect, it } from 'vitest'
import { createId } from '../shared'
import {
  createRepositories,
  deleteDatabase,
} from '../../repositories/indexeddb/repositories'
import { WanderDatabase } from '../../repositories/indexeddb/database'
import { JourneyService } from './journeyService'
import { derivePlaceVisitStats } from '../place/visitStats'
import type { Place } from '../place/place'

const dbNames: string[] = []
const timestamp = '2026-07-01T10:00:00.000Z'
const place: Place = {
  id: 'place',
  name: 'Garden',
  coordinate: { longitude: 1, latitude: 1 },
  category: 'nature',
  tags: [],
  photos: [],
  lifecycle: 'active',
  timezone: 'UTC',
  visibility: 'private',
  createdAt: timestamp,
  updatedAt: timestamp,
}

afterEach(async () => {
  await Promise.all(dbNames.splice(0).map(deleteDatabase))
})

describe('journey visit semantics', () => {
  it('does not let a planned journey pollute visit-derived statistics', async () => {
    const name = `journey-${createId()}`
    dbNames.push(name)
    const db = createRepositories(new WanderDatabase(name))
    await db.places.put(place)
    const service = new JourneyService(db.journeys, db.places)
    const planned = await service.create({ title: 'Tomorrow', kind: 'planned' })
    await service.addPlannedPlace(planned.id, place.id)
    expect(
      derivePlaceVisitStats(place.id, await db.visits.list()),
    ).toMatchObject({ visitCount: 0, lastVisitedAt: null })
    db.close()
  })

  it('atomically associates a recorded journey visit with its factual record', async () => {
    const name = `journey-${createId()}`
    dbNames.push(name)
    const db = createRepositories(new WanderDatabase(name))
    await db.places.put(place)
    const service = new JourneyService(db.journeys, db.places)
    const recorded = await service.create({
      title: 'Evening walk',
      kind: 'recorded',
    })
    const visit = await service.recordVisit(
      recorded.id,
      place.id,
      timestamp,
      35,
    )
    const savedJourney = await db.journeys.get(recorded.id)
    expect(savedJourney?.visitRecordIds).toContain(visit.id)
    expect((await db.visits.get(visit.id))?.journeyId).toBe(recorded.id)
    expect(
      derivePlaceVisitStats(place.id, await db.visits.list()),
    ).toMatchObject({ visitCount: 1, totalDwellMinutes: 35 })
    db.close()
  })
})
