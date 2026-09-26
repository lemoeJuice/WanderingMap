import { z } from 'zod'

export const weekdays = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const
export const weekdaySchema = z.enum(weekdays)
export const localTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
export const ianaTimezoneSchema = z
  .string()
  .min(1)
  .refine((timezone) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: timezone })
      return true
    } catch {
      return false
    }
  }, 'Expected a valid IANA timezone')

export const timeIntervalSchema = z.object({
  start: localTimeSchema,
  end: localTimeSchema,
})

export const timeExceptionSchema = z.object({
  date: z.iso.date(),
  closed: z.boolean().default(false),
  intervals: z.array(timeIntervalSchema).default([]),
  note: z.string().optional(),
})

export const timeRuleSchema = z.object({
  timezone: ianaTimezoneSchema.default('UTC'),
  days: z.array(weekdaySchema).default([...weekdays]),
  intervals: z.array(timeIntervalSchema).default([]),
  validFrom: z.iso.date().optional(),
  validUntil: z.iso.date().optional(),
  exceptions: z.array(timeExceptionSchema).default([]),
  note: z.string().optional(),
})

export type Weekday = z.infer<typeof weekdaySchema>
export type TimeInterval = z.infer<typeof timeIntervalSchema>
export type TimeException = z.infer<typeof timeExceptionSchema>
export type TimeRule = z.infer<typeof timeRuleSchema>
