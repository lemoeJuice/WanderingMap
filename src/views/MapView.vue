<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useRoute } from 'vue-router'
import MapCanvas from '../components/MapCanvas.vue'
import ConnectionEditorSheet from '../components/ConnectionEditorSheet.vue'
import PlaceEditorSheet from '../components/PlaceEditorSheet.vue'
import VisitDialog from '../components/VisitDialog.vue'
import { derivePlaceVisitStats } from '../domain/place/visitStats'
import {
  ConnectionService,
  type CreateConnectionInput,
} from '../domain/connection/connectionService'
import { PlaceService, type NewPlace } from '../domain/place/placeService'
import type { Connection, LineString } from '../domain/connection/connection'
import type { Place } from '../domain/place/place'
import type { Coordinate } from '../domain/shared'
import { TimeEngine, type Availability } from '../domain/time/timeEngine'
import type { TransitService } from '../domain/transit/transit'
import {
  NominatimSearchProvider,
  type SearchResult,
} from '../providers/search/SearchProvider'
import { VisitService } from '../domain/visit/visitService'
import type { Repositories } from '../repositories/interfaces/repositories'
import { repositoriesPromise } from '../repositories/indexeddb/client'
import { useSessionStore } from '../stores/session'

const session = useSessionStore()
const route = useRoute()
const mapCanvas = ref<{
  focusPlace: (id: string) => void
  focusCoordinate: (coordinate: Coordinate) => void
}>()
const repositories = shallowRef<Repositories>()
const places = ref<Place[]>([])
const connections = ref<Connection[]>([])
const visits = ref<Awaited<ReturnType<Repositories['visits']['list']>>>([])
const transitServices = ref<TransitService[]>([])
const mapStyle = ref('https://tiles.openfreemap.org/styles/liberty')
const mapCenter = ref<Coordinate>({ longitude: 118.78, latitude: 32.04 })
const mapZoom = ref(11)
const search = ref('')
const providerSearchOpen = ref(false)
const providerQuery = ref('')
const providerResults = ref<SearchResult[]>([])
const selectedProviderResultId = ref<string | null>(null)
const providerSearchBusy = ref(false)
const providerSearchError = ref('')
const searchProvider = new NominatimSearchProvider()
const editorOpen = ref(false)
const visitDialogOpen = ref(false)
const heatmapVisible = ref(false)
const connectionOpen = ref(false)
const connectionOrigin = shallowRef<Place>()
const routeDrawing = ref(false)
const routeGeometry = ref<LineString>()
const editingPlace = shallowRef<Place>()
const draftCoordinate = ref<Coordinate>({ longitude: 118.78, latitude: 32.04 })
const loadError = ref('')
const busy = ref(true)
const connected = ref(navigator.onLine)
const now = ref(new Date())
let clockInterval: ReturnType<typeof setInterval> | undefined
let cameraSaveTimeout: ReturnType<typeof setTimeout> | undefined
const timeCursor = ref(new Date().getHours())
const showCurrentTime = ref(true)
const timeEngine = new TimeEngine()

const selectedPlace = computed(() =>
  places.value.find((place) => place.id === session.selectedPlaceId),
)
const selectedProviderResult = computed(() =>
  providerResults.value.find(
    (result) => result.id === selectedProviderResultId.value,
  ),
)
const selectedStats = computed(() =>
  selectedPlace.value
    ? derivePlaceVisitStats(selectedPlace.value.id, visits.value)
    : null,
)
const filteredPlaces = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  const ordered = [...places.value].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  )
  return query
    ? ordered.filter((place) =>
        `${place.name} ${place.tags.join(' ')} ${place.category}`
          .toLocaleLowerCase()
          .includes(query),
      )
    : ordered
})
const placesForMap = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  return query
    ? places.value.filter((place) =>
        `${place.name} ${place.tags.join(' ')} ${place.category}`
          .toLocaleLowerCase()
          .includes(query),
      )
    : places.value
})
const totalVisits = computed(() => visits.value.length)
const visitCounts = computed(() => {
  const counts: Record<string, number> = {}
  for (const visit of visits.value)
    counts[visit.placeId] = (counts[visit.placeId] ?? 0) + 1
  return counts
})
const filterTime = computed(() => {
  if (showCurrentTime.value) return now.value
  const at = new Date()
  at.setHours(timeCursor.value, 0, 0, 0)
  return at
})
const placeTimeStates = computed(() =>
  Object.fromEntries(
    places.value.map((place) => [
      place.id,
      timeEngine.getPlaceState(place, filterTime.value),
    ]),
  ),
)
const connectionTimeStates = computed<Record<string, Availability>>(() =>
  Object.fromEntries(
    connections.value.map((connection) => {
      const service = transitServices.value.find(
        (item) => item.id === connection.transitServiceId,
      )
      return [
        connection.id,
        timeEngine.getConnectionState(connection, filterTime.value, service)
          .availability,
      ]
    }),
  ),
)
const unavailableConnectionCount = computed(
  () =>
    Object.values(connectionTimeStates.value).filter(
      (state) => state === 'unavailable',
    ).length,
)
const timeLabel = computed(() =>
  showCurrentTime.value
    ? 'Now'
    : `${String(timeCursor.value).padStart(2, '0')}:00`,
)

onMounted(async () => {
  clockInterval = setInterval(() => {
    now.value = new Date()
  }, 60_000)
  window.addEventListener('online', updateConnectionStatus)
  window.addEventListener('offline', updateConnectionStatus)
  window.addEventListener('wander-map-settings-changed', handleSettingsChange)
  try {
    repositories.value = await repositoriesPromise
    await reload()
  } catch (error) {
    loadError.value =
      error instanceof Error
        ? error.message
        : 'Could not open local atlas storage.'
  } finally {
    busy.value = false
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('online', updateConnectionStatus)
  window.removeEventListener('offline', updateConnectionStatus)
  window.removeEventListener(
    'wander-map-settings-changed',
    handleSettingsChange,
  )
  if (clockInterval) clearInterval(clockInterval)
  if (cameraSaveTimeout) clearTimeout(cameraSaveTimeout)
})

function updateConnectionStatus(): void {
  connected.value = navigator.onLine
}

function handleSettingsChange(): void {
  void reload()
}

function persistCamera(center: Coordinate, zoom: number): void {
  mapCenter.value = center
  mapZoom.value = zoom
  if (cameraSaveTimeout) clearTimeout(cameraSaveTimeout)
  cameraSaveTimeout = setTimeout(async () => {
    if (!repositories.value) return
    const settings = await repositories.value.settings.get()
    await repositories.value.settings.put({
      id: 'app',
      timezone:
        settings?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      basemapStyle: settings?.basemapStyle ?? mapStyle.value,
      defaultCenter: center,
      defaultZoom: zoom,
      updatedAt: new Date().toISOString(),
    })
  }, 500)
}

async function reload(): Promise<void> {
  if (!repositories.value) return
  const [
    nextPlaces,
    nextConnections,
    nextVisits,
    nextTransitServices,
    settings,
  ] = await Promise.all([
    repositories.value.places.list(),
    repositories.value.connections.list(),
    repositories.value.visits.list(),
    repositories.value.transitServices.list(),
    repositories.value.settings.get(),
  ])
  places.value = nextPlaces
  connections.value = nextConnections
  visits.value = nextVisits
  transitServices.value = nextTransitServices
  mapStyle.value =
    settings?.basemapStyle ?? 'https://tiles.openfreemap.org/styles/liberty'
  mapCenter.value = settings?.defaultCenter ?? {
    longitude: 118.78,
    latitude: 32.04,
  }
  mapZoom.value = settings?.defaultZoom ?? 11
  if (
    session.selectedPlaceId &&
    !nextPlaces.some((place) => place.id === session.selectedPlaceId)
  ) {
    session.selectedPlaceId = null
  }
}

function beginCreate(coordinate: Coordinate): void {
  draftCoordinate.value = coordinate
  editingPlace.value = undefined
  editorOpen.value = true
  session.createMode = false
  session.selectedPlaceId = null
}

function startCreate(): void {
  draftCoordinate.value = selectedPlace.value?.coordinate ?? {
    longitude: 118.78,
    latitude: 32.04,
  }
  editingPlace.value = undefined
  editorOpen.value = false
  session.createMode = true
}

function editPlace(place: Place): void {
  editingPlace.value = place
  draftCoordinate.value = place.coordinate
  editorOpen.value = true
}

async function savePlace(input: NewPlace): Promise<void> {
  if (!repositories.value) return
  const service = new PlaceService(repositories.value.places)
  const saved = editingPlace.value
    ? await service.update(editingPlace.value.id, input)
    : await service.create(input)
  editorOpen.value = false
  session.createMode = false
  session.selectedPlaceId = saved.id
  await reload()
}

async function deletePlace(place: Place): Promise<void> {
  if (
    !repositories.value ||
    !window.confirm(`Delete “${place.name}” and its visit history?`)
  )
    return
  await repositories.value.places.deleteWithRelations(place.id)
  await reload()
}

async function saveVisit(input: {
  visitedAt: string
  dwellMinutes?: number
  note?: string
}): Promise<void> {
  if (!repositories.value || !selectedPlace.value) return
  await new VisitService(repositories.value.visits).record({
    placeId: selectedPlace.value.id,
    ...input,
  })
  visitDialogOpen.value = false
  await reload()
}

async function searchPublicMap(): Promise<void> {
  providerSearchBusy.value = true
  providerSearchError.value = ''
  selectedProviderResultId.value = null
  try {
    providerResults.value = await searchProvider.search(providerQuery.value, {
      near: places.value[0]?.coordinate,
      language: navigator.language,
      limit: 8,
    })
  } catch (cause) {
    providerSearchError.value =
      cause instanceof Error
        ? cause.message
        : 'Public search is temporarily unavailable.'
  } finally {
    providerSearchBusy.value = false
  }
}

function selectProviderResult(result: SearchResult): void {
  session.selectedPlaceId = null
  selectedProviderResultId.value = result.id
  mapCanvas.value?.focusCoordinate(result.coordinate)
}

function selectProviderResultById(id: string): void {
  const result = providerResults.value.find((item) => item.id === id)
  if (result) selectProviderResult(result)
}

function handleRouteDrawn(geometry: LineString): void {
  routeGeometry.value = geometry
  routeDrawing.value = false
}

function resetTimeFilter(): void {
  timeCursor.value = now.value.getHours()
  showCurrentTime.value = true
}

function cancelPlaceEditor(): void {
  editorOpen.value = false
  session.createMode = false
}

function startRouteDrawing(): void {
  routeGeometry.value = undefined
  routeDrawing.value = true
}

async function saveProviderResult(result: SearchResult): Promise<void> {
  if (!repositories.value) return
  const place = await new PlaceService(repositories.value.places).create({
    name: result.name,
    coordinate: result.coordinate,
    category: result.category ?? 'other',
    description: result.address,
  })
  providerResults.value = []
  providerSearchOpen.value = false
  selectedProviderResultId.value = null
  search.value = ''
  session.selectedPlaceId = place.id
  await reload()
}

function beginConnection(place: Place): void {
  if (
    places.value.filter(
      (item) => item.id !== place.id && item.lifecycle !== 'archived',
    ).length === 0
  ) {
    loadError.value = 'Add another place before creating a connection.'
    return
  }
  connectionOrigin.value = place
  connectionOpen.value = true
  routeDrawing.value = false
  routeGeometry.value = undefined
}

function closeConnectionEditor(): void {
  connectionOpen.value = false
  routeDrawing.value = false
  routeGeometry.value = undefined
}

async function saveConnection(input: CreateConnectionInput): Promise<void> {
  if (!repositories.value) return
  routeDrawing.value = false
  await new ConnectionService(
    repositories.value.places,
    repositories.value.connections,
  ).create(input)
  closeConnectionEditor()
  await reload()
}

function selectPlace(id: string): void {
  session.selectedPlaceId = id
  session.createMode = false
  mapCanvas.value?.focusPlace(id)
}
</script>

<template>
  <main class="atlas-shell">
    <aside class="sidebar">
      <a class="brand" href="/" aria-label="Wander Map home">
        <span class="brand-mark"
          ><svg viewBox="0 0 32 32" aria-hidden="true">
            <path d="m5 24 7-17 6 11 3-6 6 12" />
            <circle cx="12" cy="7" r="2" /></svg
        ></span>
        <span class="brand-name"
          >Wander<span>Map</span><small>PERSONAL ATLAS</small></span
        >
      </a>
      <div class="nav-caption">YOUR ATLAS</div>
      <nav class="main-nav" aria-label="Main navigation">
        <RouterLink
          to="/"
          class="nav-item"
          :class="{ active: route.path === '/' }"
          ><span class="nav-glyph">⌖</span>Map
          <span class="nav-count">{{ places.length }}</span></RouterLink
        >
        <RouterLink
          to="/journeys"
          class="nav-item"
          :class="{ active: route.path === '/journeys' }"
          ><span class="nav-glyph">↗</span>Journeys</RouterLink
        >
        <RouterLink
          to="/graph"
          class="nav-item"
          :class="{ active: route.path === '/graph' }"
          ><span class="nav-glyph">◎</span>Graph</RouterLink
        >
        <RouterLink
          to="/library"
          class="nav-item"
          :class="{ active: route.path === '/library' }"
          ><span class="nav-glyph">▤</span>Library</RouterLink
        >
        <RouterLink
          to="/settings"
          class="nav-item"
          :class="{ active: route.path === '/settings' }"
          ><span class="nav-glyph">⚙</span>Settings</RouterLink
        >
      </nav>
      <div class="sidebar-divider" />
      <div class="places-heading">
        <span>PLACES</span><span>{{ places.length }}</span>
      </div>
      <label class="sidebar-search"
        ><span>⌕</span
        ><input
          v-model="search"
          placeholder="Find a place…"
          aria-label="Search saved places"
        /><kbd>⌘ K</kbd></label
      >
      <div class="place-list" aria-label="Saved places">
        <button
          v-for="place in filteredPlaces"
          :key="place.id"
          class="place-list-item"
          :class="{ selected: place.id === session.selectedPlaceId }"
          @click="selectPlace(place.id)"
        >
          <span class="place-dot" :class="`dot-${place.category}`" />
          <span class="place-list-copy"
            ><strong>{{ place.name }}</strong
            ><small
              >{{ place.category
              }}<template v-if="place.tags.length">
                · {{ place.tags.slice(0, 2).join(', ') }}</template
              ></small
            ></span
          >
          <span
            v-if="derivePlaceVisitStats(place.id, visits).visitCount"
            class="list-visit-count"
            >{{ derivePlaceVisitStats(place.id, visits).visitCount }}</span
          >
        </button>
        <p v-if="filteredPlaces.length === 0 && !busy" class="empty-list">
          {{
            search
              ? 'No places match.'
              : 'Your map is waiting for its first pin.'
          }}
        </p>
      </div>
      <button class="sidebar-add" @click="startCreate">
        <span>＋</span> Add a place
      </button>
      <div class="sidebar-footer">
        <span class="local-badge"
          ><i />{{ connected ? 'LOCAL ATLAS' : 'OFFLINE MODE' }}</span
        >
        <span class="footer-note">Your map lives on this device.</span>
      </div>
      <nav class="mobile-nav" aria-label="Main navigation">
        <RouterLink to="/" :class="{ active: route.path === '/' }"
          ><span>⌖</span>Map</RouterLink
        >
        <RouterLink
          to="/journeys"
          :class="{ active: route.path === '/journeys' }"
          ><span>↗</span>Journeys</RouterLink
        >
        <RouterLink to="/graph" :class="{ active: route.path === '/graph' }"
          ><span>◎</span>Graph</RouterLink
        >
        <RouterLink to="/library" :class="{ active: route.path === '/library' }"
          ><span>▤</span>Places</RouterLink
        >
        <RouterLink
          to="/settings"
          :class="{ active: route.path === '/settings' }"
          ><span>⚙</span>Settings</RouterLink
        >
      </nav>
    </aside>

    <section class="workspace">
      <header class="topbar">
        <div class="breadcrumb">
          <span>ATLAS</span><b>/</b><strong>Map</strong>
        </div>
        <div class="topbar-right">
          <span class="sync-indicator"
            ><i />{{
              busy
                ? 'Opening atlas…'
                : connected
                  ? 'Saved locally'
                  : 'Available offline'
            }}</span
          >
          <button class="avatar-button" aria-label="Personal atlas">W</button>
        </div>
      </header>

      <div class="map-stage">
        <MapCanvas
          ref="mapCanvas"
          :places="placesForMap"
          :connections="connections"
          :search-results="providerResults"
          :place-states="placeTimeStates"
          :connection-states="connectionTimeStates"
          :visit-counts="visitCounts"
          :heatmap-visible="heatmapVisible"
          :style-url="mapStyle"
          :initial-center="mapCenter"
          :initial-zoom="mapZoom"
          :create-mode="session.createMode"
          :route-drawing="routeDrawing"
          :selected-place-id="session.selectedPlaceId"
          @select-place="selectPlace"
          @select-search-result="selectProviderResultById"
          @create-place="beginCreate"
          @route-drawn="handleRouteDrawn"
          @camera-change="persistCamera"
          @map-error="
            loadError =
              'The basemap is unavailable. Your saved places are still available offline.'
          "
        />

        <div class="map-heading">
          <div class="map-title-kicker">
            <span class="live-dot" /> YOUR PERSONAL MAP
          </div>
          <h1>A life, <em>in places.</em></h1>
          <p>
            {{
              places.length
                ? 'Every place holds a little piece of your story.'
                : 'Start with a place you want to remember.'
            }}
          </p>
        </div>

        <div class="map-toolbar">
          <div class="toolbar-search">
            <span>⌕</span
            ><input
              v-model="search"
              placeholder="Search your map"
              aria-label="Search map"
            /><kbd>⌘ K</kbd>
          </div>
          <button
            class="provider-search-toggle"
            aria-label="Search public places"
            title="Search OpenStreetMap places"
            @click="providerSearchOpen = !providerSearchOpen"
          >
            ⌕<sup>+</sup>
          </button>
          <span class="toolbar-divider" />
          <button class="filter-chip selected">
            <i class="chip-dot all-dot" />All places
            <span>{{ places.length }}</span>
          </button>
          <button class="filter-chip" @click="search = 'food'">
            <i class="chip-dot food-dot" />Food
          </button>
          <button class="filter-chip" @click="search = 'scenic'">
            <i class="chip-dot scenic-dot" />Scenic
          </button>
          <button class="filter-chip" @click="search = 'transit'">
            <i class="chip-dot transit-dot" />Transit
          </button>
          <button
            class="filter-chip heatmap-chip"
            :class="{ selected: heatmapVisible }"
            @click="heatmapVisible = !heatmapVisible"
          >
            ◉ Visits
          </button>
          <button class="toolbar-add" @click="startCreate">
            <span>＋</span> Add place
          </button>
        </div>

        <section
          v-if="providerSearchOpen"
          class="search-provider-panel"
          aria-label="Public place search"
        >
          <form class="provider-search-form" @submit.prevent="searchPublicMap">
            <label class="field">
              <span
                >Search public places
                <small>OpenStreetMap · temporary results</small></span
              >
              <input
                v-model="providerQuery"
                aria-label="Search public places"
                placeholder="A cafe, park, station…"
                required
              />
            </label>
            <button
              class="button button-primary"
              type="submit"
              :disabled="providerSearchBusy"
            >
              {{ providerSearchBusy ? 'Searching…' : 'Search' }}
            </button>
          </form>
          <p v-if="providerSearchError" class="search-provider-error">
            {{ providerSearchError }}
          </p>
          <div v-if="providerResults.length" class="provider-result-list">
            <div
              v-for="result in providerResults"
              :key="result.id"
              class="provider-result-row"
              :class="{ selected: result.id === selectedProviderResultId }"
            >
              <button
                class="provider-result-copy"
                @click="selectProviderResult(result)"
              >
                <strong>{{ result.name }}</strong
                ><small>{{ result.address }}</small>
              </button>
              <button
                class="provider-save-button"
                :aria-label="`Save ${result.name}`"
                @click="saveProviderResult(result)"
              >
                ＋
              </button>
            </div>
          </div>
          <p
            v-else-if="
              !providerSearchBusy && providerQuery && !providerSearchError
            "
            class="search-provider-empty"
          >
            No results yet. Search results are temporary until you save one.
          </p>
        </section>

        <div v-if="loadError" class="map-offline-banner">
          <span>◌</span> {{ loadError }}
          <button @click="loadError = ''">×</button>
        </div>
        <div v-if="unavailableConnectionCount" class="time-status-alert">
          <span>!</span>
          {{ unavailableConnectionCount }} connection{{
            unavailableConnectionCount === 1 ? '' : 's'
          }}
          unavailable at {{ timeLabel }}
        </div>

        <div class="map-stats">
          <div>
            <span class="stat-icon">⌖</span
            ><span
              ><strong>{{ places.length }}</strong
              ><small>PLACES</small></span
            >
          </div>
          <i />
          <div>
            <span class="stat-icon">↗</span
            ><span
              ><strong>{{ connections.length }}</strong
              ><small>CONNECTIONS</small></span
            >
          </div>
          <i />
          <div>
            <span class="stat-icon">◷</span
            ><span
              ><strong>{{ totalVisits }}</strong
              ><small>VISITS</small></span
            >
          </div>
        </div>

        <div v-if="places.length === 0 && !busy" class="map-empty-hint">
          <span class="hint-arrow">↖</span
          ><span
            ><strong>Your story starts here</strong
            ><small>Click “Add place” to drop your first pin.</small></span
          >
        </div>

        <Transition name="sheet">
          <aside v-if="selectedPlace && !editorOpen" class="place-detail-card">
            <div class="detail-topline">
              <span class="place-category-label"
                ><i
                  class="place-dot"
                  :class="`dot-${selectedPlace.category}`"
                />{{ selectedPlace.category
                }}<span
                  v-for="tag in selectedPlace.tags.slice(0, 2)"
                  :key="tag"
                  class="tag-pill"
                  >{{ tag }}</span
                ></span
              ><button
                class="icon-button small"
                aria-label="Close place details"
                @click="session.selectedPlaceId = null"
              >
                ×
              </button>
            </div>
            <h2>{{ selectedPlace.name }}</h2>
            <p v-if="selectedPlace.description" class="detail-description">
              {{ selectedPlace.description }}
            </p>
            <p v-if="selectedPlace.note" class="detail-note">
              <span>✳</span> {{ selectedPlace.note }}
            </p>
            <div class="detail-stats">
              <div>
                <strong>{{ selectedStats?.visitCount ?? 0 }}</strong
                ><small>VISITS</small>
              </div>
              <div>
                <strong>{{
                  selectedStats?.lastVisitedAt
                    ? new Date(selectedStats.lastVisitedAt).toLocaleDateString()
                    : '—'
                }}</strong
                ><small>LAST VISITED</small>
              </div>
              <div>
                <strong>{{
                  selectedStats?.totalDwellMinutes
                    ? `${Math.round(selectedStats.totalDwellMinutes)}m`
                    : '—'
                }}</strong
                ><small>TIME SPENT</small>
              </div>
            </div>
            <div class="detail-actions">
              <button
                class="button button-primary"
                @click="visitDialogOpen = true"
              >
                ＋ Record a visit
              </button>
              <button
                class="button button-quiet"
                @click="beginConnection(selectedPlace)"
              >
                Connect
              </button>
              <button
                class="button button-quiet"
                @click="editPlace(selectedPlace)"
              >
                Edit
              </button>
              <button
                class="icon-button delete-action"
                aria-label="Delete place"
                title="Delete place"
                @click="deletePlace(selectedPlace)"
              >
                ⌫
              </button>
            </div>
          </aside>
        </Transition>

        <aside v-if="selectedProviderResult" class="search-result-card">
          <span class="search-result-eyebrow">TEMPORARY SEARCH RESULT</span>
          <button
            class="icon-button small"
            aria-label="Close search result"
            @click="selectedProviderResultId = null"
          >
            ×
          </button>
          <h2>{{ selectedProviderResult.name }}</h2>
          <p>{{ selectedProviderResult.address }}</p>
          <button
            class="button button-primary"
            @click="saveProviderResult(selectedProviderResult)"
          >
            ＋ Save as my place
          </button>
        </aside>

        <div class="timeline-control">
          <div class="time-now">
            <span class="time-icon">◷</span
            ><span
              ><small>TIME FILTER</small><strong>{{ timeLabel }}</strong></span
            >
          </div>
          <input
            v-model.number="timeCursor"
            type="range"
            min="0"
            max="23"
            step="1"
            aria-label="Map time filter"
            @input="showCurrentTime = false"
          />
          <div class="timeline-labels">
            <span>00:00</span><span>06:00</span><span>12:00</span
            ><span>18:00</span><span>23:00</span>
          </div>
          <button class="reset-time" @click="resetTimeFilter">
            NOW <span>↺</span>
          </button>
        </div>

        <div v-if="session.createMode && !editorOpen" class="create-banner">
          <span>＋</span> Tap the map to choose a place
          <button @click="session.createMode = false">Cancel</button>
        </div>
        <div v-if="busy" class="loading-indicator">
          <span class="loading-spinner" /> Opening your atlas…
        </div>
      </div>
    </section>

    <div
      v-if="editorOpen"
      class="sheet-backdrop"
      @click.self="cancelPlaceEditor"
    >
      <PlaceEditorSheet
        :place="editingPlace"
        :coordinate="draftCoordinate"
        @save="savePlace"
        @cancel="cancelPlaceEditor"
      />
    </div>
    <div
      v-if="connectionOpen && connectionOrigin"
      class="sheet-backdrop"
      @click.self="closeConnectionEditor"
    >
      <ConnectionEditorSheet
        :places="places"
        :origin="connectionOrigin"
        :route-geometry="routeGeometry"
        :route-drawing="routeDrawing"
        @save="saveConnection"
        @cancel="closeConnectionEditor"
        @start-drawing="startRouteDrawing"
        @stop-drawing="routeDrawing = false"
      />
    </div>
    <VisitDialog
      v-if="visitDialogOpen"
      @save="saveVisit"
      @cancel="visitDialogOpen = false"
    />
  </main>
</template>
