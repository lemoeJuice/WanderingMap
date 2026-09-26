import type { LineString } from '../../domain/connection/connection'
import type { Coordinate } from '../../domain/shared'

export interface RouteRequest {
  from: Coordinate
  to: Coordinate
  mode: 'walk' | 'bike' | 'drive' | 'transit'
  manualGeometry?: LineString
  durationMinutes?: number
}

export interface RouteResult {
  geometry: LineString
  durationMinutes?: number
  distanceMeters?: number
  source: string
}

export interface RoutingProvider {
  route(request: RouteRequest): Promise<RouteResult[]>
}

export class ManualRoutingProvider implements RoutingProvider {
  async route(request: RouteRequest): Promise<RouteResult[]> {
    if (!request.manualGeometry) return []
    return [
      {
        geometry: request.manualGeometry,
        durationMinutes: request.durationMinutes,
        source: 'manual',
      },
    ]
  }
}
