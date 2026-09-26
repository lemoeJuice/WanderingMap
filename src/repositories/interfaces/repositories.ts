import type { Connection } from '../../domain/connection/connection'
import type { Journey } from '../../domain/journey/journey'
import type { Place } from '../../domain/place/place'
import type { AppSettings } from '../../domain/settings/settings'
import type { WanderArchive } from '../../domain/archive/archive'
import type { TransitLine, TransitService } from '../../domain/transit/transit'
import type { VisitRecord } from '../../domain/visit/visitRecord'

export interface EntityRepository<T extends { id: string }> {
  get(id: string): Promise<T | undefined>
  list(): Promise<T[]>
  put(entity: T): Promise<void>
  delete(id: string): Promise<void>
}

export interface VisitRecordRepository extends EntityRepository<VisitRecord> {
  listForPlace(placeId: string): Promise<VisitRecord[]>
}

export interface ConnectionRepository extends EntityRepository<Connection> {
  saveWithTransit(
    connection: Connection,
    line?: TransitLine,
    service?: TransitService,
  ): Promise<void>
}

export interface PlaceRepository extends EntityRepository<Place> {
  deleteWithRelations(id: string): Promise<void>
}

export interface JourneyRepository extends EntityRepository<Journey> {
  addRecordedVisit(journeyId: string, visit: VisitRecord): Promise<void>
  deleteWithRelations(id: string): Promise<void>
}

export interface SettingsRepository {
  get(): Promise<AppSettings | undefined>
  put(settings: AppSettings): Promise<void>
}

export interface ArchiveRepository {
  exportArchive(): Promise<WanderArchive>
  previewArchive(
    archive: WanderArchive,
  ): Promise<{ added: number; updated: number }>
  importArchive(
    archive: WanderArchive,
    mode: 'merge' | 'replace',
  ): Promise<void>
}

export interface Repositories {
  places: PlaceRepository
  connections: ConnectionRepository
  journeys: JourneyRepository
  visits: VisitRecordRepository
  transitLines: EntityRepository<TransitLine>
  transitServices: EntityRepository<TransitService>
  settings: SettingsRepository
  archive: ArchiveRepository
  close(): void
  clear(): Promise<void>
}
