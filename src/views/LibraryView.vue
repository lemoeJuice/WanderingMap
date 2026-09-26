<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { Place } from '../domain/place/place'
import type { VisitRecord } from '../domain/visit/visitRecord'
import { derivePlaceVisitStats } from '../domain/place/visitStats'
import { repositoriesPromise } from '../repositories/indexeddb/client'
import { useSessionStore } from '../stores/session'

const router = useRouter()
const session = useSessionStore()
const places = ref<Place[]>([])
const visits = ref<VisitRecord[]>([])
const search = ref('')
const category = ref('all')
const loading = ref(true)
const error = ref('')
const categories = computed(() =>
  [...new Set(places.value.map((place) => place.category))].sort(),
)
const filteredPlaces = computed(() =>
  places.value
    .filter(
      (place) => category.value === 'all' || place.category === category.value,
    )
    .filter(
      (place) =>
        !search.value.trim() ||
        `${place.name} ${place.category} ${place.tags.join(' ')}`
          .toLocaleLowerCase()
          .includes(search.value.trim().toLocaleLowerCase()),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
)
const totalVisits = computed(() => visits.value.length)
const visitedPlaces = computed(
  () => new Set(visits.value.map((visit) => visit.placeId)).size,
)

onMounted(async () => {
  try {
    const repositories = await repositoriesPromise
    ;[places.value, visits.value] = await Promise.all([
      repositories.places.list(),
      repositories.visits.list(),
    ])
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : 'Could not load places.'
  } finally {
    loading.value = false
  }
})

function openPlace(place: Place): void {
  session.selectedPlaceId = place.id
  void router.push('/')
}
</script>

<template>
  <main class="secondary-view library-view">
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
        <span>ATLAS</span><b>/</b><strong>Library</strong>
      </div>
      <RouterLink to="/" class="button button-primary">＋ Add place</RouterLink>
    </header>
    <section class="secondary-intro">
      <div>
        <p class="eyebrow">YOUR PERSONAL ATLAS</p>
        <h1>Places you <em>carry.</em></h1>
        <p>Every pin, tag, and visit — collected in one place.</p>
      </div>
    </section>
    <div class="library-stats">
      <div>
        <strong>{{ places.length }}</strong
        ><small>PLACES</small>
      </div>
      <div>
        <strong>{{ totalVisits }}</strong
        ><small>RECORDED VISITS</small>
      </div>
      <div>
        <strong>{{ visitedPlaces }}</strong
        ><small>PLACES EXPERIENCED</small>
      </div>
    </div>
    <div class="library-controls">
      <label class="toolbar-search"
        ><span>⌕</span
        ><input
          v-model="search"
          placeholder="Search names and tags"
          aria-label="Search places" /></label
      ><label class="field"
        ><span>Category</span
        ><select v-model="category">
          <option value="all">All categories</option>
          <option v-for="item in categories" :key="item" :value="item">
            {{ item }}
          </option>
        </select></label
      ><span class="library-result-count"
        >{{ filteredPlaces.length }} places</span
      >
    </div>
    <p v-if="error" class="inline-message error-message">{{ error }}</p>
    <div v-if="loading" class="library-empty">Loading your local places…</div>
    <div v-else-if="places.length === 0" class="library-empty">
      <span>⌖</span><strong>Your atlas is ready for a first pin.</strong
      ><RouterLink to="/">Add a place on the map →</RouterLink>
    </div>
    <div v-else-if="filteredPlaces.length === 0" class="library-empty">
      No places match these filters.
    </div>
    <div v-else class="library-grid">
      <button
        v-for="place in filteredPlaces"
        :key="place.id"
        class="library-place-card"
        @click="openPlace(place)"
      >
        <div class="library-card-top">
          <span class="place-dot" :class="`dot-${place.category}`" /><span>{{
            place.category
          }}</span
          ><span
            class="lifecycle-pill"
            :class="`lifecycle-${place.lifecycle}`"
            >{{ place.lifecycle }}</span
          >
        </div>
        <h2>{{ place.name }}</h2>
        <p>{{ place.tags.length ? place.tags.join(' · ') : 'No tags yet' }}</p>
        <div v-if="place.note" class="library-note">✳ {{ place.note }}</div>
        <div class="library-card-footer">
          <span
            >{{ place.coordinate.latitude.toFixed(3) }},
            {{ place.coordinate.longitude.toFixed(3) }}</span
          ><span
            >{{
              derivePlaceVisitStats(place.id, visits).visitCount
            }}
            visits</span
          >
        </div>
      </button>
    </div>
  </main>
</template>
