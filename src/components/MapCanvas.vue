<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Connection } from '../domain/connection/connection'
import type { LineString } from '../domain/connection/connection'
import type { Place } from '../domain/place/place'
import type { Coordinate } from '../domain/shared'
import type { Availability, PlaceTimeState } from '../domain/time/timeEngine'
import { MapController } from '../map/controller/MapController'
import type { SearchResult } from '../providers/search/SearchProvider'

const props = defineProps<{
  places: Place[]
  connections: Connection[]
  searchResults: SearchResult[]
  placeStates: Record<string, PlaceTimeState>
  connectionStates: Record<string, Availability>
  visitCounts: Record<string, number>
  heatmapVisible: boolean
  styleUrl: string
  initialCenter: Coordinate
  initialZoom: number
  createMode: boolean
  routeDrawing: boolean
  selectedPlaceId: string | null
}>()
const emit = defineEmits<{
  selectPlace: [id: string]
  selectSearchResult: [id: string]
  createPlace: [coordinate: Coordinate]
  routeDrawn: [geometry: LineString]
  cameraChange: [center: Coordinate, zoom: number]
  mapError: [message: string]
}>()

const container = ref<HTMLElement | null>(null)
let controller: MapController | undefined

onMounted(() => {
  if (!container.value) return
  controller = new MapController({
    container: container.value,
    styleUrl: props.styleUrl,
    initialCenter: props.initialCenter,
    initialZoom: props.initialZoom,
    onSelectPlace: (id) => emit('selectPlace', id),
    onSelectSearchResult: (id) => emit('selectSearchResult', id),
    onCreatePlace: (coordinate) => emit('createPlace', coordinate),
    onRouteDrawn: (geometry) => emit('routeDrawn', geometry),
    onCameraChange: (center, zoom) => emit('cameraChange', center, zoom),
    onError: (message) => emit('mapError', message),
  })
  controller.setPlaces(props.places)
  controller.setConnections(props.connections)
  controller.setSearchResults(props.searchResults)
  controller.setTimeStates(props.placeStates, props.connectionStates)
  controller.setVisitCounts(props.visitCounts)
  controller.setHeatmapVisible(props.heatmapVisible)
  controller.setCreateMode(props.createMode)
  controller.setRouteDrawing(props.routeDrawing)
  controller.selectPlace(props.selectedPlaceId)
})

watch(
  () => props.places,
  (places) => controller?.setPlaces(places),
  { deep: true },
)
watch(
  () => props.connections,
  (connections) => controller?.setConnections(connections),
  { deep: true },
)
watch(
  () => props.searchResults,
  (results) => controller?.setSearchResults(results),
  { deep: true },
)
watch(
  () => props.visitCounts,
  (counts) => controller?.setVisitCounts(counts),
  { deep: true },
)
watch(
  () => props.heatmapVisible,
  (visible) => controller?.setHeatmapVisible(visible),
)
watch(
  () => props.styleUrl,
  (styleUrl) => controller?.setBasemapStyle(styleUrl),
)
watch(
  () => [props.placeStates, props.connectionStates] as const,
  ([placeStates, connectionStates]) => {
    controller?.setTimeStates(placeStates, connectionStates)
  },
  { deep: true },
)
watch(
  () => props.createMode,
  (enabled) => controller?.setCreateMode(enabled),
)
watch(
  () => props.routeDrawing,
  (enabled) => controller?.setRouteDrawing(enabled),
)
watch(
  () => props.selectedPlaceId,
  (id) => {
    controller?.selectPlace(id)
    if (id) controller?.focusPlace(id)
  },
)
onBeforeUnmount(() => controller?.destroy())

defineExpose({
  focusPlace: (id: string) => controller?.focusPlace(id),
  focusCoordinate: (coordinate: Coordinate) =>
    controller?.focusCoordinate(coordinate),
})
</script>

<template>
  <div ref="container" class="map-canvas" aria-label="Interactive map" />
</template>
