<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{
  save: [input: { visitedAt: string; dwellMinutes?: number; note?: string }]
  cancel: []
}>()
const localNow = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
  .toISOString()
  .slice(0, 16)
const visitedAt = ref(localNow)
const dwell = ref('')
const note = ref('')

function submit(): void {
  emit('save', {
    visitedAt: new Date(visitedAt.value).toISOString(),
    dwellMinutes: dwell.value ? Number(dwell.value) : undefined,
    note: note.value || undefined,
  })
}
</script>

<template>
  <div class="dialog-backdrop" @click.self="emit('cancel')">
    <form class="visit-dialog" @submit.prevent="submit">
      <p class="eyebrow">VISIT RECORD</p>
      <h2>Save this moment</h2>
      <p class="dialog-copy">
        A visit is a personal record, separate from your place details.
      </p>
      <label class="field"
        ><span>When</span
        ><input v-model="visitedAt" type="datetime-local" required
      /></label>
      <label class="field"
        ><span>Time spent <small>minutes · optional</small></span
        ><input v-model="dwell" type="number" min="0" step="1" placeholder="45"
      /></label>
      <label class="field"
        ><span>Visit note <small>private</small></span
        ><textarea
          v-model="note"
          rows="3"
          placeholder="What do you want to remember?"
        />
      </label>
      <div class="form-actions">
        <button
          class="button button-quiet"
          type="button"
          @click="emit('cancel')"
        >
          Cancel
        </button>
        <button class="button button-primary" type="submit">
          Record visit <span>↗</span>
        </button>
      </div>
    </form>
  </div>
</template>
