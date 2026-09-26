import { describe, expect, it } from 'vitest'
import { derivePlaceVisitStats } from './visitStats'

const times = {
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('derived place visit stats', () => {
  it('derives count, most recent timestamp, and dwell time from VisitRecords', () => {
    const stats = derivePlaceVisitStats('p1', [
      {
        ...times,
        id: 'v1',
        placeId: 'p1',
        visitedAt: '2026-01-01T10:00:00.000Z',
        startedAt: '2026-01-01T10:00:00.000Z',
        endedAt: '2026-01-01T10:30:00.000Z',
        source: 'manual',
      },
      {
        ...times,
        id: 'v2',
        placeId: 'p1',
        visitedAt: '2026-01-02T10:00:00.000Z',
        startedAt: '2026-01-02T10:00:00.000Z',
        endedAt: '2026-01-02T11:00:00.000Z',
        source: 'manual',
      },
      {
        ...times,
        id: 'other',
        placeId: 'p2',
        visitedAt: '2026-01-03T10:00:00.000Z',
        source: 'manual',
      },
    ])
    expect(stats).toEqual({
      visitCount: 2,
      lastVisitedAt: '2026-01-02T10:00:00.000Z',
      totalDwellMinutes: 90,
      averageDwellMinutes: 45,
    })
  })

  it('does not infer visits from planned journey data', () => {
    expect(derivePlaceVisitStats('p1', [])).toEqual({
      visitCount: 0,
      lastVisitedAt: null,
      totalDwellMinutes: 0,
      averageDwellMinutes: null,
    })
  })
})
