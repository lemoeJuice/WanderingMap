import type { EntityRepository } from '../../repositories/interfaces/repositories'
import { createId, nowIso } from '../shared'
import { visitRecordSchema, type VisitRecord } from './visitRecord'

export interface RecordVisitInput {
  placeId: string
  visitedAt?: string
  startedAt?: string
  endedAt?: string
  dwellMinutes?: number
  note?: string
}

export class VisitService {
  constructor(private readonly visits: EntityRepository<VisitRecord>) {}

  async record(input: RecordVisitInput): Promise<VisitRecord> {
    const timestamp = input.visitedAt ?? nowIso()
    const startedAt =
      input.startedAt ??
      (input.dwellMinutes !== undefined
        ? new Date(
            Date.parse(timestamp) - input.dwellMinutes * 60_000,
          ).toISOString()
        : undefined)
    const endedAt =
      input.endedAt ??
      (input.startedAt && input.dwellMinutes !== undefined
        ? new Date(
            Date.parse(input.startedAt) + input.dwellMinutes * 60_000,
          ).toISOString()
        : input.dwellMinutes !== undefined
          ? timestamp
          : undefined)
    const record = visitRecordSchema.parse({
      id: createId(),
      placeId: input.placeId,
      visitedAt: timestamp,
      startedAt,
      endedAt,
      source: 'manual',
      note: input.note,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    })
    await this.visits.put(record)
    return record
  }
}
