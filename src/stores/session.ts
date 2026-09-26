import { defineStore } from 'pinia'

export const useSessionStore = defineStore('session', {
  state: () => ({
    selectedPlaceId: null as string | null,
    createMode: false,
    currentTime: new Date().toISOString(),
    activeView: 'map' as 'map' | 'graph' | 'journeys' | 'library' | 'settings',
  }),
})
