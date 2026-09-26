import { z } from 'zod'
import {
  connectionModeSchema,
  lineStringSchema,
} from '../connection/connection'
import type { Connection } from '../connection/connection'
import type { Journey } from '../journey/journey'
import type { Place } from '../place/place'
import { coordinateSchema } from '../shared'
import { timeIntervalSchema, weekdaySchema } from '../time/timeRule'

const sharedTimeRuleSchema = z
  .object({
    timezone: z.string(),
    days: z.array(weekdaySchema),
    intervals: z.array(timeIntervalSchema),
    validFrom: z.string().optional(),
    validUntil: z.string().optional(),
    exceptions: z.array(
      z
        .object({
          date: z.string(),
          closed: z.boolean(),
          intervals: z.array(timeIntervalSchema),
        })
        .strict(),
    ),
  })
  .strict()

export const sharedPlaceSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    coordinate: coordinateSchema,
    category: z.string(),
    tags: z.array(z.string()),
    openingHours: z.array(sharedTimeRuleSchema).optional(),
    recommendedTimes: z.array(sharedTimeRuleSchema).optional(),
    timezone: z.string(),
  })
  .strict()

export const sharedConnectionSchema = z
  .object({
    id: z.string(),
    fromPlaceId: z.string(),
    toPlaceId: z.string(),
    direction: z.enum(['one-way', 'bidirectional']),
    mode: connectionModeSchema,
    geometry: lineStringSchema.optional(),
    durationMinutes: z.number().optional(),
    distanceMeters: z.number().optional(),
    transitLineName: z.string().optional(),
    firstDeparture: z.string().optional(),
    lastDeparture: z.string().optional(),
  })
  .strict()

export const sharedJourneySchema = z
  .object({
    id: z.string(),
    title: z.string(),
    kind: z.enum(['planned', 'recorded']),
    steps: z.array(
      z
        .object({
          placeId: z.string().optional(),
          connectionId: z.string().optional(),
          label: z.string().optional(),
        })
        .strict(),
    ),
    tags: z.array(z.string()),
  })
  .strict()

export const sharePackageSchema = z
  .object({
    version: z.literal(1),
    title: z.string().max(160),
    description: z.string().max(2000).optional(),
    places: z.array(sharedPlaceSchema),
    connections: z.array(sharedConnectionSchema),
    journeys: z.array(sharedJourneySchema).default([]),
    initialView: z
      .object({ center: coordinateSchema, zoom: z.number().min(0).max(22) })
      .optional(),
  })
  .strict()

export type SharedPlace = z.infer<typeof sharedPlaceSchema>
export type SharedConnection = z.infer<typeof sharedConnectionSchema>
export type SharedJourney = z.infer<typeof sharedJourneySchema>
export type SharePackage = z.infer<typeof sharePackageSchema>

export interface ShareSelection {
  title: string
  description?: string
  places: readonly Place[]
  connections: readonly Connection[]
  journeys?: readonly Journey[]
  transitLines?: readonly { id: string; name: string }[]
  transitServices?: readonly {
    id: string
    firstDeparture?: string
    lastDeparture?: string
  }[]
  placeIds: readonly string[]
  connectionIds?: readonly string[]
  journeyIds?: readonly string[]
  initialView?: SharePackage['initialView']
}

export function composeSharePackage(selection: ShareSelection): SharePackage {
  const chosenPlaces = selection.places.filter((place) =>
    selection.placeIds.includes(place.id),
  )
  const chosenPlaceIds = new Set(chosenPlaces.map((place) => place.id))
  const selectedConnectionIds = new Set(selection.connectionIds ?? [])
  const connections = selection.connections
    .filter((connection) => selectedConnectionIds.has(connection.id))
    .filter(
      (connection) =>
        chosenPlaceIds.has(connection.fromPlaceId) &&
        chosenPlaceIds.has(connection.toPlaceId),
    )
    .map((connection) => {
      const transit = connection.transitLineId
        ? selection.transitLines?.find(
            (line) => line.id === connection.transitLineId,
          )
        : undefined
      const service = connection.transitServiceId
        ? selection.transitServices?.find(
            (item) => item.id === connection.transitServiceId,
          )
        : undefined
      return {
        id: connection.id,
        fromPlaceId: connection.fromPlaceId,
        toPlaceId: connection.toPlaceId,
        direction: connection.direction,
        mode: connection.mode,
        geometry: connection.geometry,
        durationMinutes: connection.durationMinutes,
        distanceMeters: connection.distanceMeters,
        transitLineName: transit?.name,
        firstDeparture:
          connection.transitOverride?.firstDeparture ?? service?.firstDeparture,
        lastDeparture:
          connection.transitOverride?.lastDeparture ?? service?.lastDeparture,
      }
    })
  const safeConnectionIds = new Set(
    connections.map((connection) => connection.id),
  )
  const selectedJourneyIds = new Set(selection.journeyIds ?? [])
  const journeys = (selection.journeys ?? [])
    .filter((journey) => selectedJourneyIds.has(journey.id))
    .map((journey) => ({
      id: journey.id,
      title: journey.title,
      kind: journey.kind,
      tags: [...journey.tags],
      steps: journey.steps
        .filter(
          (step) =>
            (!step.placeId || chosenPlaceIds.has(step.placeId)) &&
            (!step.connectionId || safeConnectionIds.has(step.connectionId)),
        )
        .map((step) => ({
          placeId: step.placeId,
          connectionId: step.connectionId,
          label: step.label,
        })),
    }))

  return sharePackageSchema.parse({
    version: 1,
    title: selection.title,
    description: selection.description,
    places: chosenPlaces.map((place) => ({
      id: place.id,
      name: place.name,
      coordinate: place.coordinate,
      category: place.category,
      tags: [...place.tags],
      openingHours: place.openingHours?.map(
        ({ timezone, days, intervals, validFrom, validUntil, exceptions }) => ({
          timezone,
          days,
          intervals,
          validFrom,
          validUntil,
          exceptions: exceptions.map(
            ({ date, closed, intervals: exceptionIntervals }) => ({
              date,
              closed,
              intervals: exceptionIntervals,
            }),
          ),
        }),
      ),
      recommendedTimes: place.recommendedTimes?.map(
        ({ timezone, days, intervals, validFrom, validUntil, exceptions }) => ({
          timezone,
          days,
          intervals,
          validFrom,
          validUntil,
          exceptions: exceptions.map(
            ({ date, closed, intervals: exceptionIntervals }) => ({
              date,
              closed,
              intervals: exceptionIntervals,
            }),
          ),
        }),
      ),
      timezone: place.timezone,
    })),
    connections,
    journeys,
    initialView: selection.initialView,
  })
}
