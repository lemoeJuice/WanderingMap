import type {
  ConnectionRepository,
  PlaceRepository,
} from '../../repositories/interfaces/repositories'
import { createId, nowIso } from '../shared'
import {
  connectionSchema,
  type Connection,
  type ConnectionMode,
  type LineString,
} from './connection'
import type { TransitLine, TransitService } from '../transit/transit'

export interface CreateConnectionInput {
  fromPlaceId: string
  toPlaceId: string
  mode: ConnectionMode
  direction: 'one-way' | 'bidirectional'
  geometry?: LineString
  durationMinutes?: number
  note?: string
  lineName?: string
  operator?: string
  timezone?: string
  serviceDays?: TransitService['serviceDays']
  firstDeparture?: string
  lastDeparture?: string
}

export class ConnectionService {
  constructor(
    private readonly places: PlaceRepository,
    private readonly connections: ConnectionRepository,
  ) {}

  async create(input: CreateConnectionInput): Promise<Connection> {
    if (input.fromPlaceId === input.toPlaceId)
      throw new Error('A connection needs two different places')
    const [from, to] = await Promise.all([
      this.places.get(input.fromPlaceId),
      this.places.get(input.toPlaceId),
    ])
    if (!from || !to)
      throw new Error('Both places must exist before they can be connected')

    const timestamp = nowIso()
    let transitLineId: string | undefined
    let transitServiceId: string | undefined
    let transitLine: TransitLine | undefined
    let transitService: TransitService | undefined
    if (
      ['metro', 'bus', 'train'].includes(input.mode) &&
      (input.lineName?.trim() || input.firstDeparture || input.lastDeparture)
    ) {
      const line = {
        id: createId(),
        name: input.lineName?.trim() || `${input.mode} service`,
        mode: input.mode as 'metro' | 'bus' | 'train',
        operator: input.operator?.trim() || undefined,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      const service = {
        id: createId(),
        lineId: line.id,
        timezone: input.timezone ?? from.timezone,
        serviceDays: input.serviceDays ?? [
          'monday',
          'tuesday',
          'wednesday',
          'thursday',
          'friday',
          'saturday',
          'sunday',
        ],
        schedule: [],
        firstDeparture: input.firstDeparture,
        lastDeparture: input.lastDeparture,
        source: 'manual' as const,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      transitLine = line
      transitService = service
      transitLineId = line.id
      transitServiceId = service.id
    }

    const connection = connectionSchema.parse({
      id: createId(),
      fromPlaceId: from.id,
      toPlaceId: to.id,
      mode: input.mode,
      direction: input.direction,
      geometry: input.geometry,
      durationMinutes: input.durationMinutes,
      note: input.note,
      transitLineId,
      transitServiceId,
      source: 'manual',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await this.connections.saveWithTransit(
      connection,
      transitLine,
      transitService,
    )
    return connection
  }
}
