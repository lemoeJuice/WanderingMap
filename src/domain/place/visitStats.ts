import type { VisitRecord } from '../visit/visitRecord'
import { dwellMinutes } from '../visit/visitRecord'

export interface PlaceVisitStats {
  visitCount: number
  lastVisitedAt: string | null
  totalDwellMinutes: number
  averageDwellMinutes: number | null
}

export function derivePlaceVisitStats(
  placeId: string,
  records: readonly VisitRecord[],
): PlaceVisitStats {
  const visits = records
    .filter((record) => record.placeId === placeId)
    .sort((left, right) => right.visitedAt.localeCompare(left.visitedAt))
  const dwellValues = visits
    .map(dwellMinutes)
    .filter((value): value is number => value !== undefined)
  const totalDwellMinutes = dwellValues.reduce(
    (total, value) => total + value,
    0,
  )

  return {
    visitCount: visits.length,
    lastVisitedAt: visits[0]?.visitedAt ?? null,
    totalDwellMinutes,
    averageDwellMinutes:
      dwellValues.length > 0 ? totalDwellMinutes / dwellValues.length : null,
  }
}
