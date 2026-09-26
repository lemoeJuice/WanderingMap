<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '../stores/session'
import type { Journey } from '../domain/journey/journey'
import type { Connection } from '../domain/connection/connection'
import { JourneyService } from '../domain/journey/journeyService'
import type { Place } from '../domain/place/place'
import type { Repositories } from '../repositories/interfaces/repositories'
import { repositoriesPromise } from '../repositories/indexeddb/client'

const router = useRouter()
const session = useSessionStore()
const repositories = shallowRef<Repositories>()
const journeys = ref<Journey[]>([])
const places = ref<Place[]>([])
const connections = ref<Connection[]>([])
const selectedId = ref<string | null>(null)
const modalOpen = ref(false)
const title = ref('')
const kind = ref<'planned' | 'recorded'>('planned')
const loading = ref(true)
const error = ref('')
const selectedJourney = computed(() =>
  journeys.value.find((journey) => journey.id === selectedId.value),
)
const orderedJourneys = computed(() =>
  [...journeys.value].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
)

onMounted(async () => {
  try {
    repositories.value = await repositoriesPromise
    await reload()
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : 'Could not open journeys.'
  } finally {
    loading.value = false
  }
})

async function reload(): Promise<void> {
  if (!repositories.value) return
  ;[journeys.value, places.value, connections.value] = await Promise.all([
    repositories.value.journeys.list(),
    repositories.value.places.list(),
    repositories.value.connections.list(),
  ])
}

async function createJourney(): Promise<void> {
  if (!repositories.value || !title.value.trim()) return
  const journey = await new JourneyService(
    repositories.value.journeys,
    repositories.value.places,
  ).create({
    title: title.value.trim(),
    kind: kind.value,
    startedAt: kind.value === 'recorded' ? new Date().toISOString() : undefined,
  })
  title.value = ''
  modalOpen.value = false
  selectedId.value = journey.id
  await reload()
}

async function addPlace(placeId: string): Promise<void> {
  if (!repositories.value || !selectedJourney.value) return
  try {
    const service = new JourneyService(
      repositories.value.journeys,
      repositories.value.places,
      repositories.value.connections,
    )
    if (selectedJourney.value.kind === 'planned')
      await service.addPlannedPlace(selectedJourney.value.id, placeId)
    else await service.recordVisit(selectedJourney.value.id, placeId)
    await reload()
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : 'Could not add that place.'
  }
}

async function addConnection(connectionId: string): Promise<void> {
  if (!repositories.value || !selectedJourney.value) return
  try {
    await new JourneyService(
      repositories.value.journeys,
      repositories.value.places,
      repositories.value.connections,
    ).addConnectionStep(selectedJourney.value.id, connectionId)
    await reload()
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : 'Could not add that route.'
  }
}

function placeForStep(placeId?: string): Place | undefined {
  return places.value.find((place) => place.id === placeId)
}

function labelForStep(step: Journey['steps'][number]): string {
  if (step.placeId)
    return placeForStep(step.placeId)?.name ?? step.label ?? 'Unknown place'
  const connection = connections.value.find(
    (item) => item.id === step.connectionId,
  )
  if (!connection) return step.label ?? 'Unknown route'
  const from = placeForStep(connection.fromPlaceId)?.name ?? 'Unknown place'
  const to = placeForStep(connection.toPlaceId)?.name ?? 'Unknown place'
  return `${from} → ${to} · ${connection.mode}`
}

function onAddPlaceChange(event: Event): void {
  const select = event.target
  if (select instanceof HTMLSelectElement && select.value)
    void addPlace(select.value)
  if (select instanceof HTMLSelectElement) select.value = ''
}

function onAddConnectionChange(event: Event): void {
  const select = event.target
  if (select instanceof HTMLSelectElement && select.value)
    void addConnection(select.value)
  if (select instanceof HTMLSelectElement) select.value = ''
}

async function deleteJourney(journey: Journey): Promise<void> {
  if (
    !repositories.value ||
    !window.confirm(
      `Delete “${journey.title}”? Recorded visits will remain in your visit history.`,
    )
  )
    return
  await repositories.value.journeys.deleteWithRelations(journey.id)
  selectedId.value = null
  await reload()
}
</script>

<template>
  <main class="secondary-view journeys-view">
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
        <span>ATLAS</span><b>/</b><strong>Journeys</strong>
      </div>
      <RouterLink to="/" class="button button-quiet">← Back to map</RouterLink>
    </header>
    <section class="secondary-intro">
      <div>
        <p class="eyebrow">PLANS & MEMORIES</p>
        <h1>Your days, <em>in motion.</em></h1>
        <p>Plans stay plans. Only a recorded journey creates visit history.</p>
      </div>
      <button class="button button-primary" @click="modalOpen = true">
        ＋ New journey
      </button>
    </section>
    <div v-if="error" class="inline-message">
      {{ error }} <button @click="error = ''">×</button>
    </div>
    <div class="journey-layout">
      <section class="journey-list-panel">
        <div class="panel-kicker">
          YOUR JOURNEYS <span>{{ journeys.length }}</span>
        </div>
        <div v-if="loading" class="panel-empty">Opening your atlas…</div>
        <div v-else-if="journeys.length === 0" class="panel-empty">
          <span>↗</span><strong>Nothing in motion yet.</strong
          ><small>Create a plan or save a day you already wandered.</small>
        </div>
        <button
          v-for="journey in orderedJourneys"
          :key="journey.id"
          class="journey-list-item"
          :class="{ selected: selectedId === journey.id }"
          @click="selectedId = journey.id"
        >
          <span class="journey-symbol">{{
            journey.kind === 'planned' ? '↗' : '✳'
          }}</span
          ><span class="journey-list-copy"
            ><strong>{{ journey.title }}</strong
            ><small
              >{{ journey.kind }} · {{ journey.steps.length }}
              {{ journey.steps.length === 1 ? 'stop' : 'stops' }}</small
            ></span
          ><span class="journey-arrow">›</span>
        </button>
      </section>
      <section class="journey-detail-panel">
        <template v-if="selectedJourney">
          <div class="journey-detail-heading">
            <div>
              <p class="eyebrow">
                {{
                  selectedJourney.kind === 'planned'
                    ? 'PLANNED JOURNEY'
                    : 'RECORDED JOURNEY'
                }}
              </p>
              <h2>{{ selectedJourney.title }}</h2>
            </div>
            <button
              class="icon-button delete-action"
              aria-label="Delete journey"
              @click="deleteJourney(selectedJourney)"
            >
              ⌫
            </button>
          </div>
          <p class="journey-explainer">
            {{
              selectedJourney.kind === 'planned'
                ? 'Planning this journey does not create visits or change your statistics.'
                : 'Each stop recorded here is linked to a VisitRecord and contributes to visit history.'
            }}
          </p>
          <ol class="journey-steps">
            <li v-for="(step, index) in selectedJourney.steps" :key="step.id">
              <span class="step-index">{{
                String(index + 1).padStart(2, '0')
              }}</span
              ><span class="step-connector" />
              <div>
                <strong>{{ labelForStep(step) }}</strong
                ><small v-if="step.arrivedAt">{{
                  new Date(step.arrivedAt).toLocaleString()
                }}</small>
              </div>
              <RouterLink
                v-if="step.placeId"
                to="/"
                class="step-map-link"
                @click="session.selectedPlaceId = step.placeId"
                >⌖</RouterLink
              >
            </li>
          </ol>
          <label class="field add-stop-field"
            ><span>{{
              selectedJourney.kind === 'planned'
                ? 'Add a place to the plan'
                : 'Record an actual stop'
            }}</span
            ><select value="" @change="onAddPlaceChange">
              <option disabled value="">Choose a place…</option>
              <option
                v-for="place in places.filter(
                  (item) => item.lifecycle !== 'archived',
                )"
                :key="place.id"
                :value="place.id"
              >
                {{ place.name }}
              </option>
            </select></label
          >
          <label class="field add-stop-field"
            ><span>Add a connection</span
            ><select value="" @change="onAddConnectionChange">
              <option disabled value="">Choose a route…</option>
              <option
                v-for="connection in connections"
                :key="connection.id"
                :value="connection.id"
              >
                {{ placeForStep(connection.fromPlaceId)?.name }} →
                {{ placeForStep(connection.toPlaceId)?.name }} ·
                {{ connection.mode }}
              </option>
            </select></label
          >
          <button class="button button-quiet" @click="router.push('/')">
            Open map and connect places →
          </button>
        </template>
        <div v-else class="journey-placeholder">
          <span>↗</span><strong>Choose a journey to begin.</strong
          ><small>Or make a new plan for the next time you wander.</small>
        </div>
      </section>
    </div>
    <div
      v-if="modalOpen"
      class="dialog-backdrop"
      @click.self="modalOpen = false"
    >
      <form class="visit-dialog" @submit.prevent="createJourney">
        <p class="eyebrow">START A JOURNEY</p>
        <h2>Give the day a name.</h2>
        <label class="field"
          ><span>Journey title</span
          ><input
            v-model="title"
            required
            maxlength="160"
            autofocus
            placeholder="A slow Sunday by the river" /></label
        ><label class="field"
          ><span>Journey type</span
          ><select v-model="kind">
            <option value="planned">Planned — no visit records</option>
            <option value="recorded">Recorded — actual visit history</option>
          </select></label
        >
        <div class="form-actions">
          <button
            class="button button-quiet"
            type="button"
            @click="modalOpen = false"
          >
            Cancel</button
          ><button class="button button-primary" type="submit">
            Create journey <span>↗</span>
          </button>
        </div>
      </form>
    </div>
  </main>
</template>
