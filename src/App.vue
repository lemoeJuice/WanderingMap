<script setup lang="ts">
import { defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'

const ShareView = defineAsyncComponent(() => import('./views/ShareView.vue'))

const isSharedView = ref(location.hash.startsWith('#data='))
function updateHashMode(): void {
  isSharedView.value = location.hash.startsWith('#data=')
}
onMounted(() => window.addEventListener('hashchange', updateHashMode))
onBeforeUnmount(() => window.removeEventListener('hashchange', updateHashMode))
</script>

<template>
  <ShareView v-if="isSharedView" />
  <RouterView v-else />
</template>
