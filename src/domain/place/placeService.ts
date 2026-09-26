import { placeSchema, type Place } from './place'
import type { PlaceRepository } from '../../repositories/interfaces/repositories'
import { createId, nowIso, type Coordinate } from '../shared'

export type NewPlace = Pick<Place, 'name' | 'coordinate'> &
  Partial<Omit<Place, 'id' | 'createdAt' | 'updatedAt' | 'name' | 'coordinate'>>

export class PlaceService {
  constructor(private readonly places: PlaceRepository) {}

  async create(input: NewPlace): Promise<Place> {
    const timestamp = nowIso()
    const place = placeSchema.parse({
      ...input,
      id: createId(),
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await this.places.put(place)
    return place
  }

  async update(id: string, input: NewPlace): Promise<Place> {
    const existing = await this.places.get(id)
    if (!existing) throw new Error(`Place not found: ${id}`)
    const place = placeSchema.parse({
      ...existing,
      ...input,
      id,
      createdAt: existing.createdAt,
      updatedAt: nowIso(),
    })
    await this.places.put(place)
    return place
  }

  async move(id: string, coordinate: Coordinate): Promise<Place> {
    const existing = await this.places.get(id)
    if (!existing) throw new Error(`Place not found: ${id}`)
    return this.update(id, { ...existing, coordinate })
  }

  delete(id: string): Promise<void> {
    return this.places.deleteWithRelations(id)
  }
}
