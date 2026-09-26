<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import { ArchiveService } from '../domain/archive/archiveService'
import type { WanderArchive } from '../domain/archive/archive'
import { composeSharePackage } from '../domain/share/sharePackage'
import { encodeSharePackage } from '../domain/share/shareUrl'
import { nowIso } from '../domain/shared'
import type { Repositories } from '../repositories/interfaces/repositories'
import { repositoriesPromise } from '../repositories/indexeddb/client'

const repositories = shallowRef<Repositories>()
const places = ref<Awaited<ReturnType<Repositories['places']['list']>>>([])
const connections = ref<
  Awaited<ReturnType<Repositories['connections']['list']>>
>([])
const journeys = ref<Awaited<ReturnType<Repositories['journeys']['list']>>>([])
const transitLines = ref<
  Awaited<ReturnType<Repositories['transitLines']['list']>>
>([])
const transitServices = ref<
  Awaited<ReturnType<Repositories['transitServices']['list']>>
>([])
const tab = ref<'backup' | 'share' | 'map'>('backup')
const message = ref('')
const error = ref('')
const basemapStyle = ref('https://tiles.openfreemap.org/styles/liberty')
const timezone = ref(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
const archivePreview = shallowRef<WanderArchive>()
const archiveCounts = ref<{ added: number; updated: number }>()
const importMode = ref<'merge' | 'replace'>('merge')
const shareTitle = ref('My Wander Map')
const shareDescription = ref('')
const selectedPlaceIds = ref<string[]>([])
const selectedConnectionIds = ref<string[]>([])
const selectedJourneyIds = ref<string[]>([])
const shareUrl = ref('')
const storageUsage = ref<string>()

const selectedPlaces = computed(() =>
  places.value.filter((place) => selectedPlaceIds.value.includes(place.id)),
)
const selectableConnections = computed(() =>
  connections.value.filter(
    (connection) =>
      selectedPlaceIds.value.includes(connection.fromPlaceId) &&
      selectedPlaceIds.value.includes(connection.toPlaceId),
  ),
)

onMounted(async () => {
  try {
    repositories.value = await repositoriesPromise
    await reload()
    const settings = await repositories.value.settings.get()
    if (settings) {
      basemapStyle.value = settings.basemapStyle
      timezone.value = settings.timezone
    }
    if (navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate()
      if (estimate.usage)
        storageUsage.value = `${(estimate.usage / 1_048_576).toFixed(1)} MB`
    }
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : 'Could not load settings.'
  }
})

async function reload(): Promise<void> {
  if (!repositories.value) return
  ;[
    places.value,
    connections.value,
    journeys.value,
    transitLines.value,
    transitServices.value,
  ] = await Promise.all([
    repositories.value.places.list(),
    repositories.value.connections.list(),
    repositories.value.journeys.list(),
    repositories.value.transitLines.list(),
    repositories.value.transitServices.list(),
  ])
  if (selectedPlaceIds.value.length === 0)
    selectedPlaceIds.value = places.value
      .filter((place) => place.visibility === 'shareable')
      .map((place) => place.id)
  if (selectedJourneyIds.value.length === 0)
    selectedJourneyIds.value = journeys.value
      .filter((journey) => journey.visibility === 'shareable')
      .map((journey) => journey.id)
}

async function savePreferences(): Promise<void> {
  if (!repositories.value) return
  try {
    const current = await repositories.value.settings.get()
    await repositories.value.settings.put({
      id: 'app',
      basemapStyle: basemapStyle.value,
      timezone: timezone.value,
      defaultCenter: current?.defaultCenter ?? {
        longitude: 118.78,
        latitude: 32.04,
      },
      defaultZoom: current?.defaultZoom ?? 11,
      updatedAt: nowIso(),
    })
    window.dispatchEvent(new CustomEvent('wander-map-settings-changed'))
    message.value = 'Preferences saved to this device.'
    error.value = ''
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : 'Could not save settings.'
  }
}

async function exportArchive(): Promise<void> {
  if (!repositories.value) return
  try {
    const json = await new ArchiveService(
      repositories.value.archive,
    ).exportJson()
    download(
      json,
      `wander-map-${new Date().toISOString().slice(0, 10)}.wander.json`,
      'application/json',
    )
    message.value = 'Your atlas archive is ready.'
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : 'Could not export your atlas.'
  }
}

async function previewImport(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file || !repositories.value) return
  try {
    const preview = await new ArchiveService(
      repositories.value.archive,
    ).preview(await file.text())
    archivePreview.value = preview.archive
    archiveCounts.value = { added: preview.added, updated: preview.updated }
    message.value = ''
    error.value = ''
  } catch (cause) {
    error.value =
      cause instanceof Error
        ? cause.message
        : 'Could not validate this archive.'
    archivePreview.value = undefined
  } finally {
    if (event.target instanceof HTMLInputElement) event.target.value = ''
  }
}

async function commitImport(): Promise<void> {
  if (!repositories.value || !archivePreview.value) return
  if (
    importMode.value === 'replace' &&
    !window.confirm(
      'Replace all current places, connections, visits, and journeys with this archive?',
    )
  )
    return
  try {
    await new ArchiveService(repositories.value.archive).import(
      archivePreview.value,
      importMode.value,
    )
    archivePreview.value = undefined
    archiveCounts.value = undefined
    message.value = `Archive ${importMode.value === 'merge' ? 'merged' : 'restored'} successfully.`
    await reload()
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : 'Could not import this archive.'
  }
}

async function createShareLink(): Promise<void> {
  try {
    if (selectedPlaceIds.value.length === 0)
      throw new Error('Select at least one place to share.')
    const share = composeSharePackage({
      title: shareTitle.value,
      description: shareDescription.value || undefined,
      places: places.value,
      connections: connections.value,
      journeys: journeys.value,
      transitLines: transitLines.value,
      transitServices: transitServices.value,
      placeIds: selectedPlaceIds.value,
      connectionIds: selectedConnectionIds.value,
      journeyIds: selectedJourneyIds.value,
      initialView: {
        center: selectedPlaces.value[0]?.coordinate ?? {
          longitude: 118.78,
          latitude: 32.04,
        },
        zoom: 13,
      },
    })
    shareUrl.value = await encodeSharePackage(share)
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(shareUrl.value).catch(() => undefined)
    }
    error.value = ''
    message.value =
      'Read-only share link created. It contains only the selected public map data.'
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : 'Could not create a share link.'
  }
}

function download(contents: string, filename: string, mimeType: string): void {
  const link = document.createElement('a')
  const objectUrl = URL.createObjectURL(
    new Blob([contents], { type: mimeType }),
  )
  link.href = objectUrl
  link.download = filename
  link.click()
  URL.revokeObjectURL(objectUrl)
}

function openShare(): void {
  if (shareUrl.value) window.location.href = shareUrl.value
}
</script>

<template>
  <main class="secondary-view settings-view">
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
        <span>ATLAS</span><b>/</b><strong>Settings</strong>
      </div>
      <RouterLink to="/" class="button button-quiet">← Back to map</RouterLink>
    </header>
    <section class="secondary-intro">
      <div>
        <p class="eyebrow">YOUR DEVICE, YOUR DATA</p>
        <h1>Atlas <em>settings.</em></h1>
        <p>Local-first by design. Your atlas stays on this device.</p>
      </div>
      <span class="readonly-badge"><i /> NO ACCOUNT REQUIRED</span>
    </section>
    <div v-if="error" class="inline-message error-message">
      {{ error }} <button @click="error = ''">×</button>
    </div>
    <div v-if="message" class="inline-message success-message">
      {{ message }} <button @click="message = ''">×</button>
    </div>
    <nav class="settings-tabs">
      <button :class="{ active: tab === 'backup' }" @click="tab = 'backup'">
        Data & backup</button
      ><button :class="{ active: tab === 'share' }" @click="tab = 'share'">
        Share composer</button
      ><button :class="{ active: tab === 'map' }" @click="tab = 'map'">
        Map & providers
      </button>
    </nav>

    <section v-if="tab === 'backup'" class="settings-grid">
      <article class="settings-card">
        <p class="eyebrow">DATA OWNERSHIP</p>
        <h2>Your atlas, on this device.</h2>
        <p class="settings-copy">
          Places, connections, visits, and journeys are stored in IndexedDB in
          this browser. There is no account or remote database.
        </p>
        <div class="storage-row">
          <span><i class="local-check">✓</i> Local database</span
          ><strong>{{ storageUsage ?? 'Active' }}</strong>
        </div>
        <div class="storage-row">
          <span><i class="local-check">✓</i> Personal map records</span
          ><strong>{{ places.length }} places</strong>
        </div>
        <div class="storage-row">
          <span><i class="local-check">✓</i> Visit history</span
          ><strong>VisitRecord-based</strong>
        </div>
      </article>
      <article class="settings-card">
        <p class="eyebrow">PORTABLE ARCHIVE</p>
        <h2>Back up or restore.</h2>
        <p class="settings-copy">
          A versioned JSON archive keeps your records portable. Imports are
          validated and previewed before any data changes.
        </p>
        <button
          class="button button-primary full-button"
          @click="exportArchive"
        >
          ↓ Export .wander.json</button
        ><label class="file-picker"
          >＋ Choose an archive<input
            type="file"
            accept=".json,.wander.json,application/json"
            @change="previewImport"
        /></label>
        <div v-if="archivePreview && archiveCounts" class="archive-preview">
          <strong
            >Validated archive · v{{ archivePreview.schemaVersion }}</strong
          ><span
            >{{ archivePreview.places.length }} places ·
            {{ archivePreview.connections.length }} connections ·
            {{ archivePreview.visitRecords.length }} visits ·
            {{ archivePreview.journeys.length }} journeys</span
          >
          <div class="import-modes">
            <label
              ><input v-model="importMode" type="radio" value="merge" /> Merge
              matching IDs</label
            ><label
              ><input v-model="importMode" type="radio" value="replace" />
              Replace this atlas</label
            >
          </div>
          <small
            >{{ archiveCounts.added }} new ·
            {{ archiveCounts.updated }} existing IDs will update</small
          ><button
            class="button button-primary full-button"
            @click="commitImport"
          >
            {{ importMode === 'merge' ? 'Merge archive' : 'Replace atlas' }}
          </button>
        </div>
      </article>
    </section>

    <section v-else-if="tab === 'map'" class="settings-grid">
      <article class="settings-card settings-wide">
        <p class="eyebrow">BASEMAP</p>
        <h2>Choose how your map looks.</h2>
        <p class="settings-copy">
          Custom map data stays in WGS84. The basemap is an optional external
          visual layer.
        </p>
        <label class="field"
          ><span>Style URL</span
          ><input
            v-model="basemapStyle"
            type="url"
            placeholder="https://tiles.openfreemap.org/styles/liberty"
        /></label>
        <p class="provider-note">
          <strong>Default:</strong> OpenFreeMap Liberty · no API key<br /><strong
            >Custom:</strong
          >
          Any MapLibre-compatible style URL
        </p>
        <label class="field"
          ><span>Default IANA timezone</span
          ><input v-model="timezone" placeholder="Asia/Shanghai"
        /></label>
        <div class="provider-boundaries">
          <div>
            <span>SEARCH</span><strong>Manual + Nominatim</strong
            ><small>Search results stay temporary until saved.</small>
          </div>
          <div>
            <span>ROUTING</span><strong>Manual route drawing</strong
            ><small>External routing providers can be configured later.</small>
          </div>
          <div>
            <span>TRANSIT</span><strong>Manual schedules</strong
            ><small>Connection overrides take priority.</small>
          </div>
          <div>
            <span>COORDINATES</span><strong>WGS84 canonical</strong
            ><small>AMap adapter converts at the provider boundary.</small>
          </div>
        </div>
        <button class="button button-primary" @click="savePreferences">
          Save preferences
        </button>
      </article>
      <article class="settings-card">
        <p class="eyebrow">APP SHELL</p>
        <h2>Works offline.</h2>
        <p class="settings-copy">
          The app shell is installable as a PWA. Personal data remains readable
          offline; full basemap tiles are supplied by the map provider.
        </p>
        <span class="pwa-state"><i /> SERVICE WORKER ENABLED</span>
      </article>
    </section>

    <section v-else class="share-composer-layout">
      <article class="settings-card share-selection-card">
        <p class="eyebrow">PRIVACY-SAFE PROJECTION</p>
        <h2>Choose what leaves your atlas.</h2>
        <p class="settings-copy">
          The share package never includes VisitRecords, private notes, photo
          files/EXIF, or precise recorded timestamps.
        </p>
        <label class="field"
          ><span>Share title</span
          ><input v-model="shareTitle" maxlength="160" /></label
        ><label class="field"
          ><span
            >Short description <small>included in the public link</small></span
          ><textarea v-model="shareDescription" rows="2" maxlength="2000" />
        </label>
        <div class="selection-list">
          <strong>PLACES · {{ selectedPlaceIds.length }} SELECTED</strong
          ><label v-for="place in places" :key="place.id"
            ><input
              v-model="selectedPlaceIds"
              type="checkbox"
              :value="place.id"
            /><span>{{ place.name }}</span
            ><small>{{ place.visibility }}</small></label
          >
          <p v-if="!places.length" class="empty-list">
            Create places before composing a share.
          </p>
        </div>
        <div class="selection-list">
          <strong
            >CONNECTIONS · {{ selectedConnectionIds.length }} SELECTED</strong
          ><label
            v-for="connection in selectableConnections"
            :key="connection.id"
            ><input
              v-model="selectedConnectionIds"
              type="checkbox"
              :value="connection.id"
            /><span
              >{{
                places.find((place) => place.id === connection.fromPlaceId)
                  ?.name
              }}
              →
              {{
                places.find((place) => place.id === connection.toPlaceId)?.name
              }}</span
            ><small>{{ connection.mode }}</small></label
          >
          <p v-if="!selectableConnections.length" class="empty-list">
            Select both ends of a connection to include it.
          </p>
        </div>
        <div class="selection-list">
          <strong>JOURNEYS · {{ selectedJourneyIds.length }} SELECTED</strong
          ><label v-for="journey in journeys" :key="journey.id"
            ><input
              v-model="selectedJourneyIds"
              type="checkbox"
              :value="journey.id"
            /><span>{{ journey.title }}</span
            ><small>{{ journey.kind }}</small></label
          >
          <p v-if="!journeys.length" class="empty-list">
            Journeys are optional.
          </p>
        </div>
        <button
          class="button button-primary full-button"
          @click="createShareLink"
        >
          Create read-only share URL <span>↗</span>
        </button>
      </article>
      <aside class="share-preview-card">
        <div class="share-preview-map">
          <span>⌖</span><small>MAP PREVIEW</small>
        </div>
        <p class="eyebrow">READ-ONLY SHARE</p>
        <h2>{{ shareTitle || 'Your selected places' }}</h2>
        <p>
          {{ shareDescription || 'A small window into your personal map.' }}
        </p>
        <div class="share-preview-counts">
          <span>{{ selectedPlaceIds.length }} places</span
          ><span>{{ selectedConnectionIds.length }} connections</span
          ><span>{{ selectedJourneyIds.length }} journeys</span>
        </div>
        <div class="privacy-list">
          <strong>ALWAYS PRIVATE</strong
          ><span>✓ Visit history & recorded timestamps</span
          ><span>✓ Personal notes & ratings</span
          ><span>✓ Photo files and EXIF metadata</span
          ><span>✓ Data outside this selection</span>
        </div>
        <div v-if="shareUrl" class="share-link-result">
          <label class="field"
            ><span>Share URL</span
            ><textarea readonly rows="4" :value="shareUrl" /></label
          ><button class="button button-primary full-button" @click="openShare">
            Open read-only share ↗
          </button>
        </div>
      </aside>
    </section>
  </main>
</template>
