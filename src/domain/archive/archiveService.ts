import { migrateArchive, type WanderArchive } from './archive'
import type { ArchiveRepository } from '../../repositories/interfaces/repositories'

export class ArchiveService {
  constructor(private readonly repository: ArchiveRepository) {}

  async exportJson(): Promise<string> {
    const archive = await this.repository.exportArchive()
    return JSON.stringify(archive, null, 2)
  }

  parseJson(serialized: string): WanderArchive {
    let input: unknown
    try {
      input = JSON.parse(serialized)
    } catch {
      throw new Error('The selected file is not valid JSON')
    }
    return migrateArchive(input)
  }

  async preview(
    serialized: string,
  ): Promise<{ archive: WanderArchive; added: number; updated: number }> {
    const archive = this.parseJson(serialized)
    const counts = await this.repository.previewArchive(archive)
    return { archive, ...counts }
  }

  import(archive: WanderArchive, mode: 'merge' | 'replace'): Promise<void> {
    return this.repository.importArchive(archive, mode)
  }
}
