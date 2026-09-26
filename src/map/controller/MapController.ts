import maplibregl, {
  type GeoJSONSource,
  type Map as MapLibreMap,
} from 'maplibre-gl'
import { TerraDraw, TerraDrawLineStringMode } from 'terra-draw'
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter'
import type { Connection } from '../../domain/connection/connection'
import type { LineString } from '../../domain/connection/connection'
import type { Place } from '../../domain/place/place'
import type { Coordinate } from '../../domain/shared'
import type { Availability, PlaceTimeState } from '../../domain/time/timeEngine'
import type { SearchResult } from '../../providers/search/SearchProvider'

const PLACES_SOURCE = 'wander-places'
const CONNECTIONS_SOURCE = 'wander-connections'
const PLACE_LAYER = 'wander-place-circles'
const LABEL_LAYER = 'wander-place-labels'
const CONNECTION_LAYER = 'wander-connection-lines'
const HEATMAP_LAYER = 'wander-visit-heatmap'
const SEARCH_SOURCE = 'wander-search-results'
const SEARCH_LAYER = 'wander-search-result-points'

export interface MapControllerOptions {
  container: HTMLElement
  styleUrl: string
  initialCenter: Coordinate
  initialZoom: number
  onSelectPlace: (id: string) => void
  onSelectSearchResult: (id: string) => void
  onCreatePlace: (coordinate: Coordinate) => void
  onRouteDrawn: (geometry: LineString) => void
  onCameraChange: (center: Coordinate, zoom: number) => void
  onError: (message: string) => void
}

export class MapController {
  private readonly map: MapLibreMap
  private styleUrl: string
  private places: Place[] = []
  private connections: Connection[] = []
  private placeStates: Record<string, PlaceTimeState> = {}
  private connectionStates: Record<string, Availability> = {}
  private visitCounts: Record<string, number> = {}
  private searchResults: SearchResult[] = []
  private heatmapVisible = false
  private createMode = false
  private routeDrawing = false
  private terraDraw?: TerraDraw
  private loaded = false

  constructor(private readonly options: MapControllerOptions) {
    this.styleUrl = options.styleUrl
    this.map = new maplibregl.Map({
      container: options.container,
      style: options.styleUrl,
      center: [options.initialCenter.longitude, options.initialCenter.latitude],
      zoom: options.initialZoom,
      cooperativeGestures: true,
    })
    this.map.addControl(
      new maplibregl.NavigationControl({ showCompass: true }),
      'top-right',
    )
    this.map.on('style.load', () => {
      this.loaded = true
      options.container.dataset.mapReady = 'true'
      this.installLayers()
      this.createDrawingTool()
      this.setPlaces(this.places)
      this.setConnections(this.connections)
      this.setSearchResults(this.searchResults)
    })
    this.map.on('error', (event) => {
      const message = event.error?.message ?? 'Map style could not be loaded'
      options.onError(message)
    })
    this.map.on('moveend', () => {
      if (!this.loaded) return
      const center = this.map.getCenter()
      options.onCameraChange(
        { longitude: center.lng, latitude: center.lat },
        this.map.getZoom(),
      )
    })
    this.map.on('click', (event) => {
      if (this.routeDrawing) return
      const features = this.map.queryRenderedFeatures(event.point, {
        layers: [PLACE_LAYER],
      })
      const id = features[0]?.properties?.id
      if (typeof id === 'string') {
        options.onSelectPlace(id)
        this.selectPlace(id)
        return
      }
      const searchFeatures = this.map.queryRenderedFeatures(event.point, {
        layers: [SEARCH_LAYER],
      })
      const searchId = searchFeatures[0]?.properties?.id
      if (typeof searchId === 'string') {
        options.onSelectSearchResult(searchId)
      } else if (this.createMode) {
        this.options.onCreatePlace({
          longitude: event.lngLat.lng,
          latitude: event.lngLat.lat,
        })
      }
    })
    this.map.on('contextmenu', (event) => {
      if (this.routeDrawing) return
      this.options.onCreatePlace({
        longitude: event.lngLat.lng,
        latitude: event.lngLat.lat,
      })
    })
  }

  setBasemapStyle(styleUrl: string): void {
    if (this.styleUrl === styleUrl) return
    this.styleUrl = styleUrl
    this.loaded = false
    this.options.container.dataset.mapReady = 'false'
    if (this.terraDraw?.enabled) this.terraDraw.stop()
    this.map.setStyle(styleUrl)
  }

  setPlaces(places: Place[]): void {
    this.places = places
    if (!this.loaded) return
    const source = this.map.getSource(PLACES_SOURCE) as
      GeoJSONSource | undefined
    source?.setData({
      type: 'FeatureCollection',
      features: places
        .filter((place) => place.lifecycle !== 'archived')
        .map((place) => ({
          type: 'Feature' as const,
          id: place.id,
          geometry: {
            type: 'Point' as const,
            coordinates: [
              place.coordinate.longitude,
              place.coordinate.latitude,
            ],
          },
          properties: {
            id: place.id,
            name: place.name,
            category: place.category,
            lifecycle: place.lifecycle,
            openingState: this.placeStates[place.id]?.opening ?? 'unknown',
            recommended: this.placeStates[place.id]?.recommended ?? false,
            visitWeight: this.visitCounts[place.id] ?? 0,
          },
        })),
    })
  }

  setConnections(connections: Connection[]): void {
    this.connections = connections
    if (!this.loaded) return
    const source = this.map.getSource(CONNECTIONS_SOURCE) as
      GeoJSONSource | undefined
    source?.setData({
      type: 'FeatureCollection',
      features: connections.flatMap((connection) => {
        const from = this.places.find(
          (place) => place.id === connection.fromPlaceId,
        )
        const to = this.places.find(
          (place) => place.id === connection.toPlaceId,
        )
        const geometry =
          connection.geometry ??
          (from && to
            ? {
                type: 'LineString' as const,
                coordinates: [
                  [from.coordinate.longitude, from.coordinate.latitude] as [
                    number,
                    number,
                  ],
                  [to.coordinate.longitude, to.coordinate.latitude] as [
                    number,
                    number,
                  ],
                ],
              }
            : undefined)
        return geometry
          ? [
              {
                type: 'Feature' as const,
                id: connection.id,
                geometry,
                properties: {
                  id: connection.id,
                  mode: connection.mode,
                  direction: connection.direction,
                  availability:
                    this.connectionStates[connection.id] ?? 'unknown',
                },
              },
            ]
          : []
      }),
    })
  }

  setTimeStates(
    placeStates: Record<string, PlaceTimeState>,
    connectionStates: Record<string, Availability>,
  ): void {
    this.placeStates = placeStates
    this.connectionStates = connectionStates
    this.setPlaces(this.places)
    this.setConnections(this.connections)
  }

  setVisitCounts(visitCounts: Record<string, number>): void {
    this.visitCounts = visitCounts
    this.setPlaces(this.places)
  }

  setSearchResults(results: SearchResult[]): void {
    this.searchResults = results
    if (!this.loaded) return
    const source = this.map.getSource(SEARCH_SOURCE) as
      GeoJSONSource | undefined
    source?.setData({
      type: 'FeatureCollection',
      features: results.map((result) => ({
        type: 'Feature' as const,
        id: result.id,
        geometry: {
          type: 'Point' as const,
          coordinates: [
            result.coordinate.longitude,
            result.coordinate.latitude,
          ],
        },
        properties: {
          id: result.id,
          name: result.name,
          category: result.category ?? 'other',
        },
      })),
    })
  }

  setHeatmapVisible(visible: boolean): void {
    this.heatmapVisible = visible
    if (this.loaded && this.map.getLayer(HEATMAP_LAYER)) {
      this.map.setLayoutProperty(
        HEATMAP_LAYER,
        'visibility',
        visible ? 'visible' : 'none',
      )
    }
  }

  setCreateMode(enabled: boolean): void {
    this.createMode = enabled
    this.map.getCanvas().style.cursor = enabled ? 'crosshair' : ''
  }

  setRouteDrawing(enabled: boolean): void {
    this.routeDrawing = enabled
    this.map.getCanvas().style.cursor = enabled
      ? 'crosshair'
      : this.createMode
        ? 'crosshair'
        : ''
    if (!this.terraDraw || !this.loaded) return
    if (enabled) {
      this.terraDraw.start()
      this.terraDraw.setMode('linestring')
    } else if (this.terraDraw.enabled) {
      this.terraDraw.stop()
    }
  }

  selectPlace(id: string | null): void {
    if (this.loaded && this.map.getLayer(PLACE_LAYER)) {
      this.map.setPaintProperty(PLACE_LAYER, 'circle-stroke-color', [
        'case',
        ['==', ['get', 'id'], id ?? ''],
        '#d7e778',
        '#fffefa',
      ])
      this.map.setPaintProperty(PLACE_LAYER, 'circle-stroke-width', [
        'case',
        ['==', ['get', 'id'], id ?? ''],
        4,
        2,
      ])
    }
  }

  flyTo(coordinate: Coordinate, zoom = 14): void {
    this.map.flyTo({
      center: [coordinate.longitude, coordinate.latitude],
      zoom,
      duration: 700,
    })
  }

  focusPlace(id: string): void {
    const place = this.places.find((item) => item.id === id)
    if (place) this.flyTo(place.coordinate)
  }

  focusCoordinate(coordinate: Coordinate): void {
    this.flyTo(coordinate)
  }

  resize(): void {
    this.map.resize()
  }

  destroy(): void {
    if (this.terraDraw?.enabled) this.terraDraw.stop()
    this.map.remove()
  }

  private installLayers(): void {
    this.map.addSource(CONNECTIONS_SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
    this.map.addSource(PLACES_SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
    this.map.addSource(SEARCH_SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
    this.map.addLayer({
      id: HEATMAP_LAYER,
      type: 'heatmap',
      source: PLACES_SOURCE,
      paint: {
        'heatmap-weight': [
          'interpolate',
          ['linear'],
          ['get', 'visitWeight'],
          0,
          0,
          1,
          0.3,
          5,
          1,
        ],
        'heatmap-intensity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          0,
          0.8,
          9,
          1.5,
          15,
          2.5,
        ],
        'heatmap-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          0,
          3,
          9,
          22,
          15,
          42,
        ],
        'heatmap-opacity': 0.78,
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0,
          'rgba(94, 126, 87, 0)',
          0.2,
          '#b7c875',
          0.55,
          '#e7a65b',
          1,
          '#b75f45',
        ],
      },
      layout: { visibility: this.heatmapVisible ? 'visible' : 'none' },
    })
    this.map.addLayer({
      id: CONNECTION_LAYER,
      type: 'line',
      source: CONNECTIONS_SOURCE,
      paint: {
        'line-color': [
          'match',
          ['get', 'availability'],
          'unavailable',
          '#a76f66',
          'closing-soon',
          '#d39a57',
          '#286456',
        ],
        'line-width': 3,
        'line-opacity': [
          'match',
          ['get', 'availability'],
          'unavailable',
          0.38,
          'unknown',
          0.45,
          0.78,
        ],
      },
    })
    this.map.addLayer({
      id: PLACE_LAYER,
      type: 'circle',
      source: PLACES_SOURCE,
      paint: {
        'circle-color': [
          'case',
          ['==', ['get', 'openingState'], 'unavailable'],
          '#9c9b90',
          ['==', ['get', 'recommended'], true],
          '#b5bf55',
          [
            'match',
            ['get', 'category'],
            'food',
            '#e59a50',
            'scenic',
            '#6a9c77',
            'transit',
            '#7289ad',
            '#286456',
          ],
        ],
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          5,
          4,
          12,
          8,
          16,
          12,
        ],
        'circle-stroke-color': '#fffefa',
        'circle-stroke-width': 2,
        'circle-opacity': [
          'case',
          ['==', ['get', 'openingState'], 'unavailable'],
          0.55,
          1,
        ],
      },
    })
    this.map.addLayer({
      id: SEARCH_LAYER,
      type: 'circle',
      source: SEARCH_SOURCE,
      paint: {
        'circle-color': '#9b79a8',
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          5,
          5,
          12,
          9,
          16,
          12,
        ],
        'circle-stroke-color': '#fffefa',
        'circle-stroke-width': 2,
      },
    })
    this.map.addLayer({
      id: LABEL_LAYER,
      type: 'symbol',
      source: PLACES_SOURCE,
      minzoom: 13,
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 12,
        'text-offset': [0, 1.4],
        'text-anchor': 'top',
      },
      paint: {
        'text-color': '#172724',
        'text-halo-color': '#fffefa',
        'text-halo-width': 1.5,
      },
    })
    this.map.on('mouseenter', PLACE_LAYER, () => {
      this.map.getCanvas().style.cursor = 'pointer'
    })
    this.map.on('mouseleave', PLACE_LAYER, () => {
      this.map.getCanvas().style.cursor =
        this.createMode || this.routeDrawing ? 'crosshair' : ''
    })
  }

  private createDrawingTool(): void {
    if (!this.terraDraw) {
      this.terraDraw = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({ map: this.map }),
        modes: [new TerraDrawLineStringMode()],
      })
      this.terraDraw.on('finish', (id) => {
        const feature = this.terraDraw?.getSnapshotFeature(id)
        if (
          feature?.geometry.type === 'LineString' &&
          feature.geometry.coordinates.length >= 2
        ) {
          this.options.onRouteDrawn({
            type: 'LineString',
            coordinates: feature.geometry.coordinates.map(
              ([longitude, latitude]) =>
                [longitude, latitude] as [number, number],
            ),
          })
        }
        this.setRouteDrawing(false)
      })
    }
    if (this.routeDrawing) this.setRouteDrawing(true)
  }
}
