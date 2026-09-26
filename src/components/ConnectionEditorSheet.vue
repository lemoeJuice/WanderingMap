<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ConnectionMode } from '../domain/connection/connection'
import type { Place } from '../domain/place/place'
import type { LineString } from '../domain/connection/connection'
import type { CreateConnectionInput } from '../domain/connection/connectionService'

const props = defineProps<{
  places: Place[]
  origin: Place
  routeGeometry?: LineString
  routeDrawing: boolean
}>()
const emit = defineEmits<{
  save: [input: CreateConnectionInput]
  cancel: []
  startDrawing: []
  stopDrawing: []
}>()

const destinationId = ref('')
const mode = ref<ConnectionMode>('walk')
const direction = ref<'one-way' | 'bidirectional'>('one-way')
const duration = ref('')
const note = ref('')
const lineName = ref('')
const operator = ref('')
const firstDeparture = ref('')
const lastDeparture = ref('')
const timezone = ref(props.origin.timezone)
const otherPlaces = computed(() =>
  props.places.filter(
    (place) => place.id !== props.origin.id && place.lifecycle !== 'archived',
  ),
)
const isTransit = computed(() => ['metro', 'bus', 'train'].includes(mode.value))

function save(): void {
  emit('save', {
    fromPlaceId: props.origin.id,
    toPlaceId: destinationId.value,
    mode: mode.value,
    direction: direction.value,
    durationMinutes: duration.value ? Number(duration.value) : undefined,
    geometry: props.routeGeometry,
    note: note.value || undefined,
    lineName: isTransit.value ? lineName.value || undefined : undefined,
    operator: isTransit.value ? operator.value || undefined : undefined,
    timezone: isTransit.value ? timezone.value : undefined,
    firstDeparture: isTransit.value
      ? firstDeparture.value || undefined
      : undefined,
    lastDeparture: isTransit.value
      ? lastDeparture.value || undefined
      : undefined,
  })
}
</script>

<template>
  <section class="sheet editor-sheet">
    <div class="sheet-handle" />
    <header class="sheet-header">
      <div>
        <p class="eyebrow">PERSONAL ROUTE</p>
        <h2>Connect places</h2>
      </div>
      <button
        class="icon-button"
        aria-label="Close connection editor"
        @click="emit('cancel')"
      >
        ×
      </button>
    </header>
    <form class="editor-form" @submit.prevent="save">
      <div class="connection-endpoint">
        <span class="endpoint-point" />
        <div>
          <small>FROM</small><strong>{{ origin.name }}</strong>
        </div>
        <span class="endpoint-arrow">→</span>
      </div>
      <label class="field"
        ><span>To place</span
        ><select v-model="destinationId" required>
          <option disabled value="">Choose a place</option>
          <option
            v-for="place in otherPlaces"
            :key="place.id"
            :value="place.id"
          >
            {{ place.name }}
          </option>
        </select></label
      >
      <div class="field-row">
        <label class="field"
          ><span>Travel mode</span
          ><select v-model="mode">
            <option value="walk">Walking</option>
            <option value="bike">Cycling</option>
            <option value="metro">Metro</option>
            <option value="bus">Bus</option>
            <option value="train">Train</option>
            <option value="taxi">Taxi</option>
            <option value="drive">Driving</option>
            <option value="custom">Other</option>
          </select></label
        >
        <label class="field"
          ><span>Direction</span
          ><select v-model="direction">
            <option value="one-way">One way →</option>
            <option value="bidirectional">Both ways ↔</option>
          </select></label
        >
      </div>
      <label class="field"
        ><span>Travel time <small>minutes</small></span
        ><input
          v-model="duration"
          type="number"
          min="0"
          step="1"
          placeholder="15"
      /></label>
      <section v-if="isTransit" class="hours-card transit-card">
        <div class="hours-title">
          <span>Manual transit service</span
          ><span class="optional-label">NO PROVIDER REQUIRED</span>
        </div>
        <label class="field"
          ><span>Line name</span
          ><input v-model="lineName" placeholder="e.g. Line 2"
        /></label>
        <label class="field"
          ><span>Operator <small>optional</small></span
          ><input v-model="operator" placeholder="Transit operator"
        /></label>
        <label class="field"
          ><span>Service timezone <small>IANA</small></span
          ><input v-model="timezone" placeholder="Asia/Shanghai"
        /></label>
        <div class="field-row">
          <label class="field"
            ><span>First departure</span
            ><input v-model="firstDeparture" type="time" /></label
          ><label class="field"
            ><span>Last departure</span
            ><input v-model="lastDeparture" type="time"
          /></label>
        </div>
      </section>
      <section class="hours-card route-drawing-card">
        <div class="hours-title">
          <span>Route shape</span><span class="optional-label">OPTIONAL</span>
        </div>
        <p>
          {{
            routeGeometry
              ? `${routeGeometry.coordinates.length} route points saved`
              : 'Add a personal path between these places.'
          }}
        </p>
        <button
          class="button button-quiet"
          type="button"
          @click="routeDrawing ? emit('stopDrawing') : emit('startDrawing')"
        >
          {{
            routeDrawing
              ? 'Cancel drawing'
              : routeGeometry
                ? '↻ Redraw route on map'
                : '＋ Draw route on map'
          }}
        </button>
        <small v-if="!routeGeometry" class="drawing-hint"
          >Tap along the path, then double-click or right-click to
          finish.</small
        >
      </section>
      <label class="field"
        ><span>Route note <small>private</small></span
        ><textarea
          v-model="note"
          rows="3"
          placeholder="The way you like to travel…"
        />
      </label>
      <div class="form-actions">
        <button
          class="button button-quiet"
          type="button"
          @click="emit('cancel')"
        >
          Cancel</button
        ><button class="button button-primary" type="submit">
          Save connection <span>↗</span>
        </button>
      </div>
    </form>
  </section>
</template>
