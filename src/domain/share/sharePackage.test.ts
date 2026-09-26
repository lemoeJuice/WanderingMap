import { describe, expect, it } from 'vitest'
import { composeSharePackage, sharePackageSchema } from './sharePackage'
import { decodeShareFragment, encodeSharePackage } from './shareUrl'
import type { Place } from '../place/place'
import type { Journey } from '../journey/journey'

const createdAt = '2026-08-12T13:45:12.123Z'
const place: Place = {
  id: 'place-1',
  name: 'Night Cafe',
  coordinate: { longitude: 118.78, latitude: 32.04 },
  category: 'food',
  tags: ['late night'],
  note: 'Secret note',
  description: 'Public description intentionally omitted',
  photos: [{ id: 'photo-with-exif', name: 'photo.jpg' }],
  lifecycle: 'active',
  timezone: 'Asia/Shanghai',
  visibility: 'shareable',
  createdAt,
  updatedAt: createdAt,
  openingHours: [
    {
      timezone: 'Asia/Shanghai',
      days: ['monday'],
      intervals: [{ start: '18:00', end: '02:00' }],
      exceptions: [],
      note: 'Private schedule note',
    },
  ],
}
const journey: Journey = {
  id: 'journey-1',
  title: 'Late city walk',
  kind: 'recorded',
  startedAt: createdAt,
  endedAt: createdAt,
  steps: [
    {
      id: 'step-1',
      placeId: place.id,
      arrivedAt: createdAt,
      departedAt: createdAt,
    },
  ],
  visitRecordIds: ['private-visit-id'],
  note: 'Private journey note',
  photos: [{ id: 'private-photo' }],
  tags: ['night'],
  visibility: 'shareable',
  createdAt,
  updatedAt: createdAt,
}

describe('privacy-safe sharing', () => {
  it('projects explicit shared DTOs without visit records, private notes, photos, or recorded timestamps', () => {
    const shared = composeSharePackage({
      title: 'My night map',
      places: [place],
      connections: [],
      journeys: [journey],
      placeIds: [place.id],
      journeyIds: [journey.id],
    })
    const serialized = JSON.stringify(shared)
    expect(serialized).not.toContain('Secret note')
    expect(serialized).not.toContain('Private schedule note')
    expect(serialized).not.toContain('Private journey note')
    expect(serialized).not.toContain('private-photo')
    expect(serialized).not.toContain('photo-with-exif')
    expect(serialized).not.toContain('private-visit-id')
    expect(serialized).not.toContain(createdAt)
    expect(shared.places[0]).not.toHaveProperty('note')
    expect(shared.journeys[0]?.steps[0]).not.toHaveProperty('arrivedAt')
  })

  it('rejects domain entities passed directly rather than a shared DTO', () => {
    expect(
      sharePackageSchema.safeParse({
        version: 1,
        title: 'Unsafe',
        places: [place],
        connections: [],
        journeys: [],
      }).success,
    ).toBe(false)
  })

  it('encodes and decodes a read-only share in a URL fragment', async () => {
    const shared = composeSharePackage({
      title: 'Small map',
      places: [place],
      connections: [],
      placeIds: [place.id],
    })
    const url = await encodeSharePackage(shared)
    const decoded = await decodeShareFragment(new URL(url).hash)
    expect(decoded.places[0]?.id).toBe(place.id)
    expect(JSON.stringify(decoded)).not.toContain('Secret note')
  })
})
