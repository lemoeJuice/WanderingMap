import type {
  ConnectionRepository,
  JourneyRepository,
  PlaceRepository,
} from '../../repositories/interfaces/repositories'
import { createId, nowIso } from '../shared'
import { journeySchema, type Journey } from './journey'
import { visitRecordSchema } from '../visit/visitRecord'
import type { VisitRecord } from '../visit/visitRecord'

export class JourneyService {
  constructor(
    private readonly journeys: JourneyRepository,
    private readonly places: PlaceRepository,
    private readonly connections?: ConnectionRepository,
  ) {}

  async create(
    input: Pick<Journey, 'title'> &
      Partial<Omit<Journey, 'id' | 'createdAt' | 'updatedAt' | 'title'>>,
  ): Promise<Journey> {
    const timestamp = nowIso()
    const journey = journeySchema.parse({
      ...input,
      id: createId(),
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await this.journeys.put(journey)
    return journey
  }

  async addPlannedPlace(journeyId: string, placeId: string): Promise<Journey> {
    const journey = await this.journeys.get(journeyId)
    if (!journey) throw new Error(`Journey not found: ${journeyId}`)
    if (journey.kind !== 'planned')
      throw new Error('Recorded journeys add places by recording a visit')
    if (!(await this.places.get(placeId)))
      throw new Error(`Place not found: ${placeId}`)
    const updated = journeySchema.parse({
      ...journey,
      steps: [...journey.steps, { id: createId(), placeId }],
      updatedAt: nowIso(),
    })
    await this.journeys.put(updated)
    return updated
  }

  async addConnectionStep(
    journeyId: string,
    connectionId: string,
  ): Promise<Journey> {
    const journey = await this.journeys.get(journeyId)
    if (!journey) throw new Error(`Journey not found: ${journeyId}`)
    if (!this.connections)
      throw new Error('Connection repository is unavailable')
    const connection = await this.connections.get(connectionId)
    if (!connection) throw new Error(`Connection not found: ${connectionId}`)
    const updated = journeySchema.parse({
      ...journey,
      steps: [
        ...journey.steps,
        { id: createId(), connectionId, label: connection.mode },
      ],
      updatedAt: nowIso(),
    })
    await this.journeys.put(updated)
    return updated
  }

  async recordVisit(
    journeyId: string,
    placeId: string,
    visitedAt = nowIso(),
    dwellMinutes?: number,
  ): Promise<VisitRecord> {
    const [journey, place] = await Promise.all([
      this.journeys.get(journeyId),
      this.places.get(placeId),
    ])
    if (!journey) throw new Error(`Journey not found: ${journeyId}`)
    if (journey.kind !== 'recorded')
      throw new Error('Planned journeys do not create visit records')
    if (!place) throw new Error(`Place not found: ${placeId}`)
    const startedAt =
      dwellMinutes === undefined
        ? undefined
        : new Date(Date.parse(visitedAt) - dwellMinutes * 60_000).toISOString()
    const record = visitRecordSchema.parse({
      id: createId(),
      placeId,
      visitedAt,
      startedAt,
      endedAt: dwellMinutes === undefined ? undefined : visitedAt,
      source: 'journey',
      journeyId,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    })
    await this.journeys.addRecordedVisit(journeyId, record)
    return record
  }
}
