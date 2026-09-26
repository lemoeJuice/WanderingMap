import { z } from 'zod'
import type { Coordinate } from '../../domain/shared'

export const searchResultSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  coordinate: z.object({
    longitude: z.number().min(-180).max(180),
    latitude: z.number().min(-90).max(90),
  }),
  category: z.string().optional(),
  address: z.string().optional(),
  provider: z.string(),
})

export type SearchResult = z.infer<typeof searchResultSchema>

export interface SearchContext {
  near?: Coordinate
  limit?: number
  language?: string
}

export interface SearchProvider {
  search(query: string, context?: SearchContext): Promise<SearchResult[]>
  reverseGeocode?(coordinate: Coordinate): Promise<SearchResult | null>
}

export class ManualSearchProvider implements SearchProvider {
  async search(): Promise<SearchResult[]> {
    return []
  }

  async reverseGeocode(): Promise<SearchResult | null> {
    return null
  }
}

export class NominatimSearchProvider implements SearchProvider {
  constructor(
    private readonly baseUrl = 'https://nominatim.openstreetmap.org',
  ) {}

  async search(
    query: string,
    context: SearchContext = {},
  ): Promise<SearchResult[]> {
    if (!query.trim()) return []
    const url = new URL('/search', this.baseUrl)
    url.searchParams.set('q', query)
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('limit', String(Math.min(context.limit ?? 8, 20)))
    if (context.language)
      url.searchParams.set('accept-language', context.language)
    if (context.near) {
      const { longitude, latitude } = context.near
      url.searchParams.set(
        'viewbox',
        `${longitude - 0.2},${latitude + 0.2},${longitude + 0.2},${latitude - 0.2}`,
      )
      url.searchParams.set('bounded', '0')
    }
    const response = await fetch(url)
    if (!response.ok)
      throw new Error(`Search provider returned ${response.status}`)
    const records: unknown = await response.json()
    if (!Array.isArray(records)) return []
    return records.map((item, index) => {
      const result = item as {
        place_id?: number
        display_name?: string
        lon?: string
        lat?: string
        type?: string
      }
      return searchResultSchema.parse({
        id: `nominatim:${result.place_id ?? index}`,
        name: result.display_name?.split(',')[0] ?? 'Unnamed place',
        coordinate: {
          longitude: Number(result.lon),
          latitude: Number(result.lat),
        },
        category: result.type,
        address: result.display_name,
        provider: 'nominatim',
      })
    })
  }
}
