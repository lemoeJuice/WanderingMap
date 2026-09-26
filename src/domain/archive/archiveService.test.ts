import { afterEach, describe, expect, it } from 'vitest'
import { createId } from '../shared'
import { ArchiveService } from './archiveService'
import {
  createRepositories,
  deleteDatabase,
} from '../../repositories/indexeddb/repositories'
import { WanderDatabase } from '../../repositories/indexeddb/database'

const names: string[] = []
const timestamp = '2026-06-01T10:00:00.000Z'
const archive = (places: Array<{ id: string; name: string }>) => ({
  schemaVersion: 2 as const,
  exportedAt: timestamp,
  places: places.map(({ id, name }) => ({
    id,
    name,
    coordinate: { longitude: 118.78, latitude: 32.04 },
    category: 'other',
    tags: [],
    photos: [],
    lifecycle: 'active' as const,
    timezone: 'Asia/Shanghai',
    visibility: 'private' as const,
    createdAt: timestamp,
    updatedAt: timestamp,
  })),
  connections: [],
  journeys: [],
  visitRecords: [],
  transitLines: [],
  transitServices: [],
})

afterEach(async () => {
  await Promise.all(names.splice(0).map(deleteDatabase))
})

describe('archive repository import/export', () => {
  it('previews and merges validated archive data', async () => {
    const name = `archive-${createId()}`
    names.push(name)
    const repositories = createRepositories(new WanderDatabase(name))
    await repositories.places.put(
      archive([{ id: 'existing', name: 'Before' }]).places[0]!,
    )
    const service = new ArchiveService(repositories.archive)
    const input = JSON.stringify(
      archive([
        { id: 'existing', name: 'Updated' },
        { id: 'new', name: 'New' },
      ]),
    )
    const preview = await service.preview(input)
    expect(preview).toMatchObject({ added: 1, updated: 1 })
    await service.import(preview.archive, 'merge')
    expect((await repositories.places.get('existing'))?.name).toBe('Updated')
    expect(await repositories.places.get('new')).toBeDefined()
    const exported = service.parseJson(await service.exportJson())
    expect(exported.places).toHaveLength(2)
    repositories.close()
  })

  it('does not partially replace data when archive relationships are invalid', async () => {
    const name = `archive-${createId()}`
    names.push(name)
    const repositories = createRepositories(new WanderDatabase(name))
    await repositories.places.put(
      archive([{ id: 'kept', name: 'Keep' }]).places[0]!,
    )
    const invalid = {
      ...archive([]),
      connections: [
        {
          id: 'orphan',
          fromPlaceId: 'missing-a',
          toPlaceId: 'missing-b',
          mode: 'walk',
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
    }
    const service = new ArchiveService(repositories.archive)
    const parsed = service.parseJson(JSON.stringify(invalid))
    await expect(service.import(parsed, 'replace')).rejects.toThrow(
      'place is missing',
    )
    expect((await repositories.places.get('kept'))?.name).toBe('Keep')
    repositories.close()
  })
})
