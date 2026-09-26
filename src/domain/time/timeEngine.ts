import { Temporal } from '@js-temporal/polyfill'
import type { Connection, TransitOverride } from '../connection/connection'
import type { Place } from '../place/place'
import type { TransitService } from '../transit/transit'
import type { TimeInterval, TimeRule, Weekday } from './timeRule'

export type Availability =
  'available' | 'closing-soon' | 'unavailable' | 'unknown'

export interface PlaceTimeState {
  opening: Availability
  recommended: boolean | null
}

export interface ConnectionTimeState {
  availability: Availability
  source: 'manual-override' | 'manual-service' | 'provider-service' | 'unknown'
  message?: string
}

interface RuleEvaluation {
  open: boolean
  minutesUntilEnd?: number
}

const weekdayByNumber: Record<number, Weekday> = {
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
  7: 'sunday',
}

function zoned(at: Date, timezone: string): Temporal.ZonedDateTime {
  return Temporal.Instant.from(at.toISOString()).toZonedDateTimeISO(timezone)
}

function clockMinutes(time: string): number {
  const [hour = '0', minute = '0'] = time.split(':')
  return Number(hour) * 60 + Number(minute)
}

function dateIsValid(rule: TimeRule, date: Temporal.PlainDate): boolean {
  const isoDate = date.toString()
  return (
    (!rule.validFrom || isoDate >= rule.validFrom) &&
    (!rule.validUntil || isoDate <= rule.validUntil)
  )
}

function intervalsStartingOn(
  rule: TimeRule,
  date: Temporal.PlainDate,
): TimeInterval[] {
  if (!dateIsValid(rule, date)) return []
  const exception = rule.exceptions.find(
    (item) => item.date === date.toString(),
  )
  if (exception) return exception.closed ? [] : exception.intervals
  const weekday = weekdayByNumber[date.dayOfWeek]
  return weekday && rule.days.includes(weekday) ? rule.intervals : []
}

function evaluateRule(rule: TimeRule, at: Date): RuleEvaluation {
  try {
    const local = zoned(at, rule.timezone)
    const date = local.toPlainDate()
    const minute = local.hour * 60 + local.minute
    const todayException = rule.exceptions.find(
      (item) => item.date === date.toString(),
    )
    const candidates: Array<{
      startDate: Temporal.PlainDate
      interval: TimeInterval
    }> = []

    for (const interval of intervalsStartingOn(rule, date))
      candidates.push({ startDate: date, interval })

    if (!todayException) {
      const previous = date.subtract({ days: 1 })
      for (const interval of intervalsStartingOn(rule, previous)) {
        if (
          clockMinutes(interval.end) < clockMinutes(interval.start) &&
          minute < clockMinutes(interval.end)
        ) {
          candidates.push({ startDate: previous, interval })
        }
      }
    }

    for (const { interval } of candidates) {
      const start = clockMinutes(interval.start)
      const end = clockMinutes(interval.end)
      const open =
        end > start
          ? minute >= start && minute < end
          : minute >= start || minute < end
      if (!open || end === start) continue
      const minutesUntilEnd =
        end > start
          ? end - minute
          : minute >= start
            ? 24 * 60 - minute + end
            : end - minute
      return { open: true, minutesUntilEnd }
    }
    return { open: false }
  } catch {
    return { open: false }
  }
}

function rulesAvailability(rules: TimeRule[], at: Date): Availability {
  const states = rules
    .map((rule) => evaluateRule(rule, at))
    .filter((state) => state.open)
  if (states.length === 0) return 'unavailable'
  const furthestClosing = Math.max(
    ...states.map((state) => state.minutesUntilEnd ?? Infinity),
  )
  return furthestClosing <= 30 ? 'closing-soon' : 'available'
}

function rulesContainTime(rules: TimeRule[], at: Date): boolean {
  return rules.some((rule) => evaluateRule(rule, at).open)
}

function timeOfDay(
  at: Date,
  timezone: string,
): { weekday: Weekday; minute: number } | undefined {
  try {
    const local = zoned(at, timezone)
    const weekday = weekdayByNumber[local.dayOfWeek]
    return weekday
      ? { weekday, minute: local.hour * 60 + local.minute }
      : undefined
  } catch {
    return undefined
  }
}

function departureAvailability(
  first: string | undefined,
  last: string | undefined,
  at: Date,
  timezone: string,
): Availability {
  const local = timeOfDay(at, timezone)
  if (!local || (!first && !last)) return 'unknown'
  const current = local.minute
  const firstMinute = first ? clockMinutes(first) : undefined
  const lastMinute = last ? clockMinutes(last) : undefined

  if (
    firstMinute !== undefined &&
    lastMinute !== undefined &&
    lastMinute < firstMinute
  ) {
    if (current < firstMinute && current > lastMinute) return 'unavailable'
    const minutesUntilLast =
      current >= firstMinute
        ? 24 * 60 - current + lastMinute
        : lastMinute - current
    return minutesUntilLast <= 30 ? 'closing-soon' : 'available'
  }
  if (firstMinute !== undefined && current < firstMinute) return 'unavailable'
  if (lastMinute !== undefined && current > lastMinute) return 'unavailable'
  if (lastMinute !== undefined && lastMinute - current <= 30)
    return 'closing-soon'
  return 'available'
}

export class TimeEngine {
  getPlaceState(place: Place, at: Date): PlaceTimeState {
    const opening = place.openingHours
    const recommended = place.recommendedTimes
    return {
      opening: opening?.length ? rulesAvailability(opening, at) : 'unknown',
      recommended: recommended?.length
        ? rulesContainTime(recommended, at)
        : null,
    }
  }

  getConnectionState(
    connection: Connection,
    at: Date,
    service?: TransitService,
  ): ConnectionTimeState {
    const override = connection.transitOverride
    const hasManualData = Boolean(
      override &&
      (override.schedule?.length ||
        override.firstDeparture ||
        override.lastDeparture ||
        override.serviceDays),
    )
    const schedule = override?.schedule ?? service?.schedule ?? []
    const timezone = override?.timezone ?? service?.timezone ?? 'UTC'
    const serviceDays = override?.serviceDays ?? service?.serviceDays
    const firstDeparture = override?.firstDeparture ?? service?.firstDeparture
    const lastDeparture = override?.lastDeparture ?? service?.lastDeparture
    const source = hasManualData
      ? 'manual-override'
      : service?.source === 'manual'
        ? 'manual-service'
        : service
          ? 'provider-service'
          : 'unknown'

    if (!service && !hasManualData) return { availability: 'unknown', source }
    const local = timeOfDay(at, timezone)
    if (!local)
      return { availability: 'unknown', source, message: 'Unknown timezone' }
    let serviceWeekday = local.weekday
    if (
      firstDeparture &&
      lastDeparture &&
      clockMinutes(lastDeparture) < clockMinutes(firstDeparture) &&
      local.minute <= clockMinutes(lastDeparture)
    ) {
      try {
        const previousWeekday =
          weekdayByNumber[
            zoned(at, timezone).toPlainDate().subtract({ days: 1 }).dayOfWeek
          ]
        if (previousWeekday) serviceWeekday = previousWeekday
      } catch {
        return { availability: 'unknown', source, message: 'Unknown timezone' }
      }
    }
    if (serviceDays?.length && !serviceDays.includes(serviceWeekday)) {
      return {
        availability: 'unavailable',
        source,
        message: 'No service today',
      }
    }

    if (schedule.length) {
      const scheduled = rulesAvailability(schedule, at)
      if (scheduled === 'unavailable')
        return {
          availability: scheduled,
          source,
          message: 'Outside service hours',
        }
      if (lastDeparture) {
        const departure = departureAvailability(
          firstDeparture,
          lastDeparture,
          at,
          timezone,
        )
        if (departure === 'unavailable' || departure === 'closing-soon') {
          return {
            availability: departure,
            source,
            message:
              departure === 'unavailable'
                ? 'Last departure has passed'
                : undefined,
          }
        }
      }
      return { availability: scheduled, source }
    }

    const availability = departureAvailability(
      firstDeparture,
      lastDeparture,
      at,
      timezone,
    )
    return {
      availability,
      source,
      message:
        availability === 'unavailable' && lastDeparture
          ? 'Last departure has passed'
          : undefined,
    }
  }
}

export function effectiveTransitSchedule(
  override: TransitOverride | undefined,
  service: TransitService | undefined,
):
  | Pick<
      TransitService,
      | 'schedule'
      | 'timezone'
      | 'serviceDays'
      | 'firstDeparture'
      | 'lastDeparture'
    >
  | undefined {
  if (!override && !service) return undefined
  return {
    schedule: override?.schedule ?? service?.schedule ?? [],
    timezone: override?.timezone ?? service?.timezone ?? 'UTC',
    serviceDays: override?.serviceDays ?? service?.serviceDays ?? [],
    firstDeparture: override?.firstDeparture ?? service?.firstDeparture,
    lastDeparture: override?.lastDeparture ?? service?.lastDeparture,
  }
}
