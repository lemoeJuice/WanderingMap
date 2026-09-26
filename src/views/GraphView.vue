<script setup lang="ts">
import cytoscape, { type Core } from 'cytoscape'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { Connection } from '../domain/connection/connection'
import type { Place } from '../domain/place/place'
import { repositoriesPromise } from '../repositories/indexeddb/client'
import { useSessionStore } from '../stores/session'

const router = useRouter()
const session = useSessionStore()
const container = ref<HTMLElement>()
const places = ref<Place[]>([])
const connections = ref<Connection[]>([])
const loading = ref(true)
const error = ref('')
const categoryFilter = ref('all')
const modeFilter = ref('all')
const neighborDepth = ref(0)
const highlightedCenter = ref('')
const categories = computed(() =>
  [...new Set(places.value.map((place) => place.category))].sort(),
)
const modes = computed(() =>
  [...new Set(connections.value.map((connection) => connection.mode))].sort(),
)
let graph: Core | undefined

onMounted(async () => {
  try {
    const repositories = await repositoriesPromise
    ;[places.value, connections.value] = await Promise.all([
      repositories.places.list(),
      repositories.connections.list(),
    ])
    if (container.value) mountGraph()
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : 'Could not load your graph.'
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => graph?.destroy())
watch([categoryFilter, modeFilter], () => {
  if (!loading.value && container.value) mountGraph()
})
watch(neighborDepth, () => {
  highlightedCenter.value = ''
  graph?.elements().removeClass('muted highlighted')
})

function mountGraph(): void {
  graph?.destroy()
  const visiblePlaces = places.value.filter(
    (place) =>
      place.lifecycle !== 'archived' &&
      (categoryFilter.value === 'all' ||
        place.category === categoryFilter.value),
  )
  const knownPlaces = new Set(visiblePlaces.map((place) => place.id))
  graph = cytoscape({
    container: container.value,
    elements: [
      ...visiblePlaces.map((place) => ({
        data: { id: place.id, label: place.name, category: place.category },
      })),
      ...connections.value
        .filter(
          (connection) =>
            knownPlaces.has(connection.fromPlaceId) &&
            knownPlaces.has(connection.toPlaceId) &&
            (modeFilter.value === 'all' ||
              connection.mode === modeFilter.value),
        )
        .map((connection) => ({
          data: {
            id: connection.id,
            source: connection.fromPlaceId,
            target: connection.toPlaceId,
            label: connection.mode,
            direction: connection.direction,
          },
        })),
    ],
    layout: {
      name: 'cose',
      animate: false,
      padding: 55,
      nodeRepulsion: 5000,
      idealEdgeLength: 145,
    },
    style: [
      {
        selector: 'node',
        style: {
          label: 'data(label)',
          'background-color': '#4e7961',
          color: '#263b30',
          'font-family': 'DM Sans, sans-serif',
          'font-size': 11,
          'font-weight': 600,
          'text-valign': 'bottom',
          'text-halign': 'center',
          'text-margin-y': 9,
          width: 23,
          height: 23,
          'border-width': 3,
          'border-color': '#f9f8f2',
        },
      },
      {
        selector: 'node[category = "food"]',
        style: { 'background-color': '#df9c54' },
      },
      {
        selector: 'node[category = "transit"]',
        style: { 'background-color': '#758db0' },
      },
      {
        selector: 'edge',
        style: {
          width: 2,
          'line-color': '#93a897',
          'target-arrow-color': '#69836d',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          label: 'data(label)',
          color: '#738176',
          'font-size': 8,
          'text-background-color': '#f3f1eb',
          'text-background-opacity': 0.9,
        },
      },
      {
        selector: 'edge[direction = "bidirectional"]',
        style: {
          'source-arrow-shape': 'triangle',
          'source-arrow-color': '#69836d',
        },
      },
      {
        selector: ':selected',
        style: { 'border-color': '#d7e778', 'border-width': 5 },
      },
      { selector: '.muted', style: { opacity: 0.2 } },
      {
        selector: '.highlighted',
        style: { opacity: 1, 'border-color': '#d7e778', 'border-width': 5 },
      },
    ],
  })
  graph.on('tap', 'node', (event) => {
    const id = String(event.target.id())
    if (neighborDepth.value > 0) {
      if (highlightedCenter.value === id) openPlaceOnMap(id)
      else highlightNeighbors(id, neighborDepth.value)
      return
    }
    openPlaceOnMap(id)
  })
}

function openPlaceOnMap(id: string): void {
  session.selectedPlaceId = id
  void router.push('/')
}

function highlightNeighbors(id: string, depth: number): void {
  if (!graph) return
  highlightedCenter.value = id
  const center = graph.getElementById(id)
  let neighborhood = center.closedNeighborhood()
  let frontier = center
  for (let distance = 0; distance < depth; distance += 1) {
    frontier = frontier.neighborhood('node')
    neighborhood = neighborhood.union(frontier).union(frontier.connectedEdges())
  }
  graph.elements().addClass('muted')
  neighborhood.removeClass('muted').addClass('highlighted')
}
</script>

<template>
  <main class="secondary-view graph-view">
    <header class="secondary-header">
      <RouterLink to="/" class="brand compact-brand"
        ><span class="brand-mark"
          ><svg viewBox="0 0 32 32">
            <path d="m5 24 7-17 6 11 3-6 6 12" />
            <circle cx="12" cy="7" r="2" /></svg></span
        ><span class="brand-name"
          >Wander<span>Map</span><small>PERSONAL ATLAS</small></span
        ></RouterLink
      >
      <div class="breadcrumb">
        <span>ATLAS</span><b>/</b><strong>Graph</strong>
      </div>
      <RouterLink to="/" class="button button-quiet">← Back to map</RouterLink>
    </header>
    <section class="secondary-intro graph-intro">
      <div>
        <p class="eyebrow">THE SHAPE OF YOUR CITY</p>
        <h1>Places, <em>connected.</em></h1>
        <p>One map, seen as the relationships that make it yours.</p>
      </div>
      <div class="graph-controls">
        <label class="field"
          ><span>Place category</span
          ><select v-model="categoryFilter">
            <option value="all">All categories</option>
            <option
              v-for="category in categories"
              :key="category"
              :value="category"
            >
              {{ category }}
            </option>
          </select></label
        >
        <label class="field"
          ><span>Connection mode</span
          ><select v-model="modeFilter">
            <option value="all">All modes</option>
            <option v-for="mode in modes" :key="mode" :value="mode">
              {{ mode }}
            </option>
          </select></label
        >
        <label class="field"
          ><span>Highlight neighbors</span
          ><select v-model.number="neighborDepth">
            <option :value="0">Off · click opens map</option>
            <option :value="1">One hop · click twice to map</option>
            <option :value="2">Two hops · click twice to map</option>
          </select></label
        >
      </div>
      <span class="graph-count"
        >{{ places.length }} PLACES <i />
        {{ connections.length }} CONNECTIONS</span
      >
    </section>
    <div class="graph-canvas-wrap">
      <div v-if="loading" class="loading-indicator">
        <span class="loading-spinner" />Loading your graph…
      </div>
      <div v-else-if="error" class="empty-state">{{ error }}</div>
      <div v-else-if="places.length === 0" class="empty-state">
        <strong>No places to connect yet.</strong
        ><RouterLink to="/">Add a place to your map →</RouterLink>
      </div>
      <div
        v-else
        ref="container"
        class="graph-canvas"
        aria-label="Interactive place graph"
      />
    </div>
    <footer class="graph-footer">
      <span><i class="graph-dot" /> PLACE</span
      ><span><i class="graph-line" /> CONNECTION</span
      ><small>Select a node to open it on the map.</small>
    </footer>
  </main>
</template>
