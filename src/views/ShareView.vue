<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import MapCanvas from '../components/MapCanvas.vue'
import { decodeShareFragment } from '../domain/share/shareUrl'
import type { SharePackage } from '../domain/share/sharePackage'
import type { Place } from '../domain/place/place'
import type { Connection } from '../domain/connection/connection'

const shared = ref<SharePackage>()
const loading = ref(true)
const error = ref('')
const selectedPlaceId = ref<string | null>(null)
const mapError = ref(false)
const places = computed<Place[]>(
  () =>
    shared.value?.places.map((place) => ({
      ...place,
      lifecycle: 'active',
      visibility: 'shareable',
      photos: [],
      createdAt: '1970-01-01T00:00:00.000Z',
      updatedAt: '1970-01-01T00:00:00.000Z',
    })) ?? [],
)
const connections = computed<Connection[]>(
  () =>
    shared.value?.connections.map((connection) => ({
      ...connection,
      source: 'manual',
      createdAt: '1970-01-01T00:00:00.000Z',
      updatedAt: '1970-01-01T00:00:00.000Z',
    })) ?? [],
)

onMounted(async () => {
  try {
    shared.value = await decodeShareFragment(location.hash)
  } catch (cause) {
    error.value =
      cause instanceof Error
        ? cause.message
        : 'This share link could not be opened.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main class="share-view">
    <header class="share-header">
      <RouterLink to="/" class="brand compact-brand"
        ><span class="brand-mark"
          ><svg viewBox="0 0 32 32">
            <path d="m5 24 7-17 6 11 3-6 6 12" />
            <circle cx="12" cy="7" r="2" /></svg></span
        ><span class="brand-name"
          >Wander<span>Map</span><small>PERSONAL ATLAS</small></span
        ></RouterLink
      ><span class="readonly-badge"><i /> READ-ONLY SHARED MAP</span
      ><RouterLink to="/" class="button button-quiet">Open my atlas</RouterLink>
    </header>
    <div v-if="loading" class="share-message">
      <span class="loading-spinner" />Opening shared map…
    </div>
    <div v-else-if="error" class="share-message share-error">
      <strong>Could not open this map.</strong><span>{{ error }}</span
      ><RouterLink to="/" class="button button-primary"
        >Go to Wander Map</RouterLink
      >
    </div>
    <template v-else-if="shared">
      <section class="share-map-stage">
        <MapCanvas
          :places="places"
          :connections="connections"
          :search-results="[]"
          :place-states="{}"
          :connection-states="{}"
          :visit-counts="{}"
          :heatmap-visible="false"
          style-url="https://tiles.openfreemap.org/styles/liberty"
          :initial-center="
            shared.initialView?.center ?? { longitude: 118.78, latitude: 32.04 }
          "
          :initial-zoom="shared.initialView?.zoom ?? 11"
          :create-mode="false"
          :route-drawing="false"
          :selected-place-id="selectedPlaceId"
          @select-place="selectedPlaceId = $event"
          @map-error="mapError = true"
        />
        <div class="share-title-card">
          <p class="eyebrow">A SHARED WANDER MAP</p>
          <h1>{{ shared.title }}</h1>
          <p v-if="shared.description">{{ shared.description }}</p>
          <span
            >{{ shared.places.length }} places <i />
            {{ shared.connections.length }} connections</span
          >
        </div>
        <div v-if="mapError" class="share-map-fallback">
          The basemap is unavailable. Shared places remain on the map.
        </div>
        <div v-if="selectedPlaceId" class="share-place-card">
          <button
            class="icon-button small"
            aria-label="Close place details"
            @click="selectedPlaceId = null"
          >
            ×</button
          ><template
            v-for="place in shared.places.filter(
              (item) => item.id === selectedPlaceId,
            )"
            :key="place.id"
            ><span class="share-place-category">{{ place.category }}</span>
            <h2>{{ place.name }}</h2>
            <p v-if="place.tags.length">{{ place.tags.join(' · ') }}</p>
            <p v-if="place.openingHours?.length">
              Hours are available in the selected place's timezone ({{
                place.timezone
              }}).
            </p></template
          >
        </div>
        <div class="readonly-watermark">
          <span>↗</span> Shared map · edits are not saved
        </div>
      </section>
    </template>
  </main>
</template>
