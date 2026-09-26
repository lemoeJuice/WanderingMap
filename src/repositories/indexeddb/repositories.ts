import Dexie, { type Table } from 'dexie'
import type { ZodType } from 'zod'
import {
  ARCHIVE_SCHEMA_VERSION,
  wanderArchiveSchema,
} from '../../domain/archive/archive'
import {
  connectionSchema,
  type Connection,
} from '../../domain/connection/connection'
import { journeySchema, type Journey } from '../../domain/journey/journey'
import { placeSchema, type Place } from '../../domain/place/place'
import {
  appSettingsSchema,
  type AppSettings,
} from '../../domain/settings/settings'
import {
  transitLineSchema,
  transitServiceSchema,
  type TransitLine,
  type TransitService,
} from '../../domain/transit/transit'
import {
  visitRecordSchema,
  type VisitRecord,
} from '../../domain/visit/visitRecord'
import type {
  ArchiveRepository,
  ConnectionRepository,
  EntityRepository,
  JourneyRepository,
  PlaceRepository,
  Repositories,
  SettingsRepository,
  VisitRecordRepository,
} from '../interfaces/repositories'
import { WanderDatabase } from './database'

class DexieEntityRepository<
  T extends { id: string },
> implements EntityRepository<T> {
  constructor(
    private readonly table: Table<T, string>,
    private readonly schema: ZodType<T>,
  ) {}

  get(id: string): Promise<T | undefined> {
    return this.table.get(id)
  }

  list(): Promise<T[]> {
    return this.table.toArray()
  }

  async put(entity: T): Promise<void> {
    await this.table.put(this.schema.parse(entity))
  }

  async delete(id: string): Promise<void> {
    await this.table.delete(id)
  }
}

class DexieVisitRepository
  extends DexieEntityRepository<VisitRecord>
  implements VisitRecordRepository
{
  constructor(private readonly db: WanderDatabase) {
    super(db.visitRecords, visitRecordSchema)
  }

  override async put(record: VisitRecord): Promise<void> {
    const validRecord = visitRecordSchema.parse(record)
    await this.db.transaction(
      'rw',
      [this.db.places, this.db.visitRecords],
      async () => {
        if (!(await this.db.places.get(validRecord.placeId))) {
          throw new Error(
            `Cannot record a visit for missing place: ${validRecord.placeId}`,
          )
        }
        await this.db.visitRecords.put(validRecord)
      },
    )
  }

  listForPlace(placeId: string): Promise<VisitRecord[]> {
    return this.db.visitRecords
      .where('placeId')
      .equals(placeId)
      .sortBy('visitedAt')
  }
}

class DexiePlaceRepository
  extends DexieEntityRepository<Place>
  implements PlaceRepository
{
  constructor(private readonly db: WanderDatabase) {
    super(db.places, placeSchema)
  }

  async deleteWithRelations(id: string): Promise<void> {
    await this.db.transaction(
      'rw',
      [
        this.db.places,
        this.db.connections,
        this.db.journeys,
        this.db.visitRecords,
      ],
      async () => {
        const [visits, connections] = await Promise.all([
          this.db.visitRecords.where('placeId').equals(id).toArray(),
          this.db.connections
            .filter(
              (connection) =>
                connection.fromPlaceId === id || connection.toPlaceId === id,
            )
            .toArray(),
        ])
        const removedVisitIds = new Set(visits.map((visit) => visit.id))
        const removedConnectionIds = new Set(
          connections.map((connection) => connection.id),
        )
        const journeys = await this.db.journeys.toArray()
        await Promise.all(
          journeys
            .filter(
              (journey) =>
                journey.steps.some(
                  (step) =>
                    step.placeId === id ||
                    (step.connectionId &&
                      removedConnectionIds.has(step.connectionId)),
                ) ||
                journey.visitRecordIds.some((visitId) =>
                  removedVisitIds.has(visitId),
                ),
            )
            .map((journey) =>
              this.db.journeys.put({
                ...journey,
                steps: journey.steps.filter(
                  (step) =>
                    step.placeId !== id &&
                    (!step.connectionId ||
                      !removedConnectionIds.has(step.connectionId)),
                ),
                visitRecordIds: journey.visitRecordIds.filter(
                  (visitId) => !removedVisitIds.has(visitId),
                ),
                updatedAt: new Date().toISOString(),
              }),
            ),
        )
        await Promise.all([
          this.db.places.delete(id),
          this.db.connections.bulkDelete([...removedConnectionIds]),
          this.db.visitRecords.bulkDelete([...removedVisitIds]),
        ])
      },
    )
  }

  override delete(id: string): Promise<void> {
    return this.deleteWithRelations(id)
  }
}

class DexieConnectionRepository
  extends DexieEntityRepository<Connection>
  implements ConnectionRepository
{
  constructor(private readonly db: WanderDatabase) {
    super(db.connections, connectionSchema)
  }

  override put(connection: Connection): Promise<void> {
    return this.saveWithTransit(connection)
  }

  async saveWithTransit(
    rawConnection: Connection,
    rawLine?: TransitLine,
    rawService?: TransitService,
  ): Promise<void> {
    const connection = connectionSchema.parse(rawConnection)
    const line = rawLine ? transitLineSchema.parse(rawLine) : undefined
    const service = rawService
      ? transitServiceSchema.parse(rawService)
      : undefined
    if (Boolean(line) !== Boolean(service)) {
      throw new Error('Transit line and service must be saved together')
    }
    if (service && line?.id !== service.lineId) {
      throw new Error('Transit service must reference the supplied line')
    }
    if (
      (line && connection.transitLineId !== line.id) ||
      (service && connection.transitServiceId !== service.id)
    ) {
      throw new Error(
        'Connection transit references do not match supplied records',
      )
    }

    await this.db.transaction(
      'rw',
      [
        this.db.places,
        this.db.connections,
        this.db.transitLines,
        this.db.transitServices,
      ],
      async () => {
        const [from, to] = await Promise.all([
          this.db.places.get(connection.fromPlaceId),
          this.db.places.get(connection.toPlaceId),
        ])
        if (!from || !to) throw new Error('Both connected places must exist')
        if (line && service) {
          await Promise.all([
            this.db.transitLines.put(line),
            this.db.transitServices.put(service),
          ])
        } else if (connection.transitLineId || connection.transitServiceId) {
          if (!connection.transitLineId || !connection.transitServiceId) {
            throw new Error(
              'Connection must reference both a transit line and service',
            )
          }
          const [storedLine, storedService] = await Promise.all([
            this.db.transitLines.get(connection.transitLineId),
            this.db.transitServices.get(connection.transitServiceId),
          ])
          if (
            !storedLine ||
            !storedService ||
            storedService.lineId !== storedLine.id
          ) {
            throw new Error('Connection transit references do not exist')
          }
        }
        await this.db.connections.put(connection)
      },
    )
  }
}

class DexieJourneyRepository
  extends DexieEntityRepository<Journey>
  implements JourneyRepository
{
  constructor(private readonly db: WanderDatabase) {
    super(db.journeys, journeySchema)
  }

  async addRecordedVisit(
    journeyId: string,
    rawVisit: VisitRecord,
  ): Promise<void> {
    const visit = visitRecordSchema.parse(rawVisit)
    await this.db.transaction(
      'rw',
      [this.db.journeys, this.db.visitRecords, this.db.places],
      async () => {
        const [journey, place] = await Promise.all([
          this.db.journeys.get(journeyId),
          this.db.places.get(visit.placeId),
        ])
        if (!journey) throw new Error(`Journey not found: ${journeyId}`)
        if (journey.kind !== 'recorded')
          throw new Error('Planned journeys cannot create visits')
        if (!place)
          throw new Error(
            `Cannot record a visit for missing place: ${visit.placeId}`,
          )
        if (visit.source !== 'journey' || visit.journeyId !== journeyId) {
          throw new Error('Visit record must reference its recorded journey')
        }
        await Promise.all([
          this.db.visitRecords.add(visit),
          this.db.journeys.put(
            journeySchema.parse({
              ...journey,
              steps: [
                ...journey.steps,
                {
                  id: visit.id,
                  placeId: visit.placeId,
                  arrivedAt: visit.visitedAt,
                },
              ],
              visitRecordIds: [...journey.visitRecordIds, visit.id],
              updatedAt: new Date().toISOString(),
            }),
          ),
        ])
      },
    )
  }

  async deleteWithRelations(id: string): Promise<void> {
    await this.db.transaction(
      'rw',
      [this.db.journeys, this.db.visitRecords],
      async () => {
        const journey = await this.db.journeys.get(id)
        if (!journey) return
        const records = await this.db.visitRecords
          .where('journeyId')
          .equals(id)
          .toArray()
        await Promise.all([
          this.db.visitRecords.bulkPut(
            records.map((record) => ({
              ...record,
              source: 'manual' as const,
              journeyId: undefined,
              updatedAt: new Date().toISOString(),
            })),
          ),
          this.db.journeys.delete(id),
        ])
      },
    )
  }

  override delete(id: string): Promise<void> {
    return this.deleteWithRelations(id)
  }
}

class DexieSettingsRepository implements SettingsRepository {
  constructor(private readonly table: Table<AppSettings, string>) {}

  get(): Promise<AppSettings | undefined> {
    return this.table.get('app')
  }

  async put(settings: AppSettings): Promise<void> {
    await this.table.put(appSettingsSchema.parse(settings))
  }
}

export function createRepositories(db = new WanderDatabase()): Repositories {
  const archiveRepository: ArchiveRepository = {
    exportArchive: async () =>
      wanderArchiveSchema.parse({
        schemaVersion: ARCHIVE_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        places: await db.places.toArray(),
        connections: await db.connections.toArray(),
        journeys: await db.journeys.toArray(),
        visitRecords: await db.visitRecords.toArray(),
        transitLines: await db.transitLines.toArray(),
        transitServices: await db.transitServices.toArray(),
        settings: await db.settings.get('app'),
      }),
    previewArchive: async (archive) => {
      const currentArchive = await archiveRepository.exportArchive()
      const countChanges = <T extends { id: string }>(
        incoming: T[],
        current: T[],
      ) => {
        const ids = new Set(current.map((entity) => entity.id))
        return {
          added: incoming.filter((entity) => !ids.has(entity.id)).length,
          updated: incoming.filter((entity) => ids.has(entity.id)).length,
        }
      }
      const collections = [
        countChanges(archive.places, currentArchive.places),
        countChanges(archive.connections, currentArchive.connections),
        countChanges(archive.journeys, currentArchive.journeys),
        countChanges(archive.visitRecords, currentArchive.visitRecords),
        countChanges(archive.transitLines, currentArchive.transitLines),
        countChanges(archive.transitServices, currentArchive.transitServices),
      ]
      return collections.reduce(
        (total, current) => ({
          added: total.added + current.added,
          updated: total.updated + current.updated,
        }),
        { added: 0, updated: 0 },
      )
    },
    importArchive: async (rawArchive, mode) => {
      const archive = wanderArchiveSchema.parse(rawArchive)
      const placeIds = new Set(
        mode === 'replace'
          ? archive.places.map((place) => place.id)
          : [
              ...(await db.places.toArray()).map((place) => place.id),
              ...archive.places.map((place) => place.id),
            ],
      )
      if (
        archive.connections.some(
          (connection) =>
            !placeIds.has(connection.fromPlaceId) ||
            !placeIds.has(connection.toPlaceId),
        )
      ) {
        throw new Error('Archive contains a connection whose place is missing')
      }
      if (archive.visitRecords.some((visit) => !placeIds.has(visit.placeId))) {
        throw new Error('Archive contains a visit whose place is missing')
      }
      const lineIds = new Set(
        mode === 'replace'
          ? archive.transitLines.map((line) => line.id)
          : [
              ...(await db.transitLines.toArray()).map((line) => line.id),
              ...archive.transitLines.map((line) => line.id),
            ],
      )
      if (
        archive.transitServices.some((service) => !lineIds.has(service.lineId))
      ) {
        throw new Error(
          'Archive contains a transit service whose line is missing',
        )
      }
      const [
        existingConnections,
        existingJourneys,
        existingVisits,
        existingServices,
      ] =
        mode === 'merge'
          ? await Promise.all([
              db.connections.toArray(),
              db.journeys.toArray(),
              db.visitRecords.toArray(),
              db.transitServices.toArray(),
            ])
          : [
              [] as Connection[],
              [] as Journey[],
              [] as VisitRecord[],
              [] as TransitService[],
            ]
      const connectionIds = new Set([
        ...existingConnections.map((connection) => connection.id),
        ...archive.connections.map((connection) => connection.id),
      ])
      const serviceIds = new Set([
        ...existingServices.map((service) => service.id),
        ...archive.transitServices.map((service) => service.id),
      ])
      const journeyById = new Map([
        ...existingJourneys.map((journey) => [journey.id, journey] as const),
        ...archive.journeys.map((journey) => [journey.id, journey] as const),
      ])
      const visitById = new Map([
        ...existingVisits.map((visit) => [visit.id, visit] as const),
        ...archive.visitRecords.map((visit) => [visit.id, visit] as const),
      ])
      if (
        archive.connections.some(
          (connection) =>
            (connection.transitLineId &&
              !lineIds.has(connection.transitLineId)) ||
            (connection.transitServiceId &&
              !serviceIds.has(connection.transitServiceId)),
        )
      ) {
        throw new Error(
          'Archive contains a connection whose transit service is missing',
        )
      }
      if (
        archive.journeys.some((journey) =>
          journey.steps.some(
            (step) =>
              (step.placeId && !placeIds.has(step.placeId)) ||
              (step.connectionId && !connectionIds.has(step.connectionId)),
          ),
        )
      ) {
        throw new Error(
          'Archive contains a journey step whose place or connection is missing',
        )
      }
      if (
        archive.journeys.some((journey) =>
          journey.visitRecordIds.some((visitId) => {
            const visit = visitById.get(visitId)
            return (
              !visit ||
              visit.journeyId !== journey.id ||
              journey.kind !== 'recorded'
            )
          }),
        )
      ) {
        throw new Error(
          'Archive contains an invalid recorded journey visit reference',
        )
      }
      if (
        archive.visitRecords.some((visit) => {
          if (visit.source !== 'journey') return false
          const journey = visit.journeyId
            ? journeyById.get(visit.journeyId)
            : undefined
          return (
            !journey ||
            journey.kind !== 'recorded' ||
            !journey.visitRecordIds.includes(visit.id)
          )
        })
      ) {
        throw new Error(
          'Archive contains a visit whose recorded journey is missing',
        )
      }
      await db.transaction(
        'rw',
        [
          db.places,
          db.connections,
          db.journeys,
          db.visitRecords,
          db.transitLines,
          db.transitServices,
          db.settings,
        ],
        async () => {
          if (mode === 'replace') {
            await Promise.all([
              db.places.clear(),
              db.connections.clear(),
              db.journeys.clear(),
              db.visitRecords.clear(),
              db.transitLines.clear(),
              db.transitServices.clear(),
              db.settings.clear(),
            ])
          }
          await Promise.all([
            db.places.bulkPut(archive.places),
            db.connections.bulkPut(archive.connections),
            db.journeys.bulkPut(archive.journeys),
            db.visitRecords.bulkPut(archive.visitRecords),
            db.transitLines.bulkPut(archive.transitLines),
            db.transitServices.bulkPut(archive.transitServices),
            archive.settings
              ? db.settings.put(archive.settings)
              : Promise.resolve(),
          ])
        },
      )
    },
  }

  return {
    places: new DexiePlaceRepository(db),
    connections: new DexieConnectionRepository(db),
    journeys: new DexieJourneyRepository(db),
    visits: new DexieVisitRepository(db),
    transitLines: new DexieEntityRepository<TransitLine>(
      db.transitLines,
      transitLineSchema,
    ),
    transitServices: new DexieEntityRepository<TransitService>(
      db.transitServices,
      transitServiceSchema,
    ),
    settings: new DexieSettingsRepository(db.settings),
    archive: archiveRepository,
    close: () => db.close(),
    clear: async () => {
      await db.transaction(
        'rw',
        [
          db.places,
          db.connections,
          db.journeys,
          db.visitRecords,
          db.transitLines,
          db.transitServices,
          db.settings,
        ],
        async () => {
          await Promise.all([
            db.places.clear(),
            db.connections.clear(),
            db.journeys.clear(),
            db.visitRecords.clear(),
            db.transitLines.clear(),
            db.transitServices.clear(),
            db.settings.clear(),
          ])
        },
      )
    },
  }
}

export async function openRepositories(name?: string): Promise<Repositories> {
  const db = new WanderDatabase(name)
  await db.open()
  const schemaVersion = await db.meta.get('schemaVersion')
  if (!schemaVersion) await db.meta.put({ key: 'schemaVersion', value: 2 })
  return createRepositories(db)
}

export async function deleteDatabase(name: string): Promise<void> {
  await Dexie.delete(name)
}
