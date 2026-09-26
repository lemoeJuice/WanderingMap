<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import type { NewPlace } from '../domain/place/placeService'
import type { Place } from '../domain/place/place'
import type { Coordinate } from '../domain/shared'

const props = defineProps<{ place?: Place; coordinate: Coordinate }>()
const emit = defineEmits<{ save: [place: NewPlace]; cancel: [] }>()

const form = reactive({
  name: '',
  category: 'other',
  tags: '',
  note: '',
  description: '',
  lifecycle: 'active' as Place['lifecycle'],
  visibility: 'private' as Place['visibility'],
  longitude: props.coordinate.longitude,
  latitude: props.coordinate.latitude,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  openStart: '',
  openEnd: '',
  recommendedStart: '',
  recommendedEnd: '',
})

watch(
  () => [props.place, props.coordinate] as const,
  () => {
    const place = props.place
    form.name = place?.name ?? ''
    form.category = place?.category ?? 'other'
    form.tags = place?.tags.join(', ') ?? ''
    form.note = place?.note ?? ''
    form.description = place?.description ?? ''
    form.lifecycle = place?.lifecycle ?? 'active'
    form.visibility = place?.visibility ?? 'private'
    form.longitude = place?.coordinate.longitude ?? props.coordinate.longitude
    form.latitude = place?.coordinate.latitude ?? props.coordinate.latitude
    form.timezone =
      place?.timezone ??
      Intl.DateTimeFormat().resolvedOptions().timeZone ??
      'UTC'
    form.openStart = place?.openingHours?.[0]?.intervals[0]?.start ?? ''
    form.openEnd = place?.openingHours?.[0]?.intervals[0]?.end ?? ''
    form.recommendedStart =
      place?.recommendedTimes?.[0]?.intervals[0]?.start ?? ''
    form.recommendedEnd = place?.recommendedTimes?.[0]?.intervals[0]?.end ?? ''
  },
  { immediate: true },
)

const heading = computed(() => (props.place ? 'Edit place' : 'Pin a place'))

function save(): void {
  const days = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ] as const
  const createRule = (start: string, end: string) =>
    start && end
      ? [
          {
            timezone: form.timezone,
            days: [...days],
            intervals: [{ start, end }],
            exceptions: [],
          },
        ]
      : undefined

  emit('save', {
    name: form.name,
    coordinate: {
      longitude: Number(form.longitude),
      latitude: Number(form.latitude),
    },
    category: form.category,
    tags: form.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
    note: form.note || undefined,
    description: form.description || undefined,
    lifecycle: form.lifecycle,
    visibility: form.visibility,
    timezone: form.timezone,
    openingHours: createRule(form.openStart, form.openEnd),
    recommendedTimes: createRule(form.recommendedStart, form.recommendedEnd),
  })
}
</script>

<template>
  <section class="sheet editor-sheet" aria-labelledby="place-editor-title">
    <div class="sheet-handle" />
    <header class="sheet-header">
      <div>
        <p class="eyebrow">PERSONAL ATLAS</p>
        <h2 id="place-editor-title">{{ heading }}</h2>
      </div>
      <button
        class="icon-button"
        aria-label="Close editor"
        @click="emit('cancel')"
      >
        ×
      </button>
    </header>

    <form class="editor-form" @submit.prevent="save">
      <label class="field">
        <span>Place name</span>
        <input
          v-model="form.name"
          autofocus
          required
          maxlength="160"
          placeholder="A place worth remembering"
        />
      </label>
      <div class="field-row">
        <label class="field">
          <span>Category</span>
          <select v-model="form.category">
            <option value="food">Food & drink</option>
            <option value="scenic">Scenic</option>
            <option value="transit">Transit</option>
            <option value="culture">Culture</option>
            <option value="nature">Nature</option>
            <option value="home">Home</option>
            <option value="work">Work</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label class="field">
          <span>Status</span>
          <select v-model="form.lifecycle">
            <option value="active">On my map</option>
            <option value="wishlist">Want to visit</option>
            <option value="archived">Archived</option>
          </select>
        </label>
      </div>
      <label class="field">
        <span>Tags <small>separated by commas</small></span>
        <input v-model="form.tags" placeholder="quiet, coffee, riverside" />
      </label>
      <div class="field-row coordinate-row">
        <label class="field"
          ><span>Longitude · WGS84</span
          ><input
            v-model.number="form.longitude"
            type="number"
            step="any"
            min="-180"
            max="180"
            required
        /></label>
        <label class="field"
          ><span>Latitude · WGS84</span
          ><input
            v-model.number="form.latitude"
            type="number"
            step="any"
            min="-90"
            max="90"
            required
        /></label>
      </div>
      <label class="field">
        <span>Timezone <small>IANA</small></span>
        <input v-model="form.timezone" placeholder="Asia/Shanghai" />
      </label>
      <div class="hours-card">
        <div class="hours-title">
          <span>Opening hours</span><span class="optional-label">OPTIONAL</span>
        </div>
        <div class="field-row">
          <label class="field"
            ><span>Opens</span><input v-model="form.openStart" type="time"
          /></label>
          <label class="field"
            ><span>Closes</span><input v-model="form.openEnd" type="time"
          /></label>
        </div>
      </div>
      <div class="hours-card">
        <div class="hours-title">
          <span>Recommended time</span
          ><span class="optional-label">OPTIONAL</span>
        </div>
        <div class="field-row">
          <label class="field"
            ><span>From</span
            ><input v-model="form.recommendedStart" type="time"
          /></label>
          <label class="field"
            ><span>Until</span><input v-model="form.recommendedEnd" type="time"
          /></label>
        </div>
      </div>
      <label class="field">
        <span>Private note</span>
        <textarea
          v-model="form.note"
          rows="3"
          placeholder="Your own tips and memories…"
        />
      </label>
      <label class="field">
        <span>Description</span>
        <textarea
          v-model="form.description"
          rows="2"
          placeholder="A short description"
        />
      </label>
      <label class="visibility-control"
        ><input
          v-model="form.visibility"
          type="checkbox"
          true-value="shareable"
          false-value="private"
        /><span>Mark as shareable in my atlas</span></label
      >
      <div class="form-actions">
        <button
          class="button button-quiet"
          type="button"
          @click="emit('cancel')"
        >
          Cancel
        </button>
        <button class="button button-primary" type="submit">
          {{ props.place ? 'Save changes' : 'Save place' }} <span>↗</span>
        </button>
      </div>
    </form>
  </section>
</template>
