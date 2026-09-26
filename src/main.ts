import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import './style.css'
import './styles/atlas.css'
import 'maplibre-gl/dist/maplibre-gl.css'

const pagesRedirect = sessionStorage.getItem('wander-map-pages-redirect')
if (pagesRedirect) {
  sessionStorage.removeItem('wander-map-pages-redirect')
  window.history.replaceState(
    null,
    '',
    `${import.meta.env.BASE_URL}${pagesRedirect}`,
  )
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'map', component: () => import('./views/MapView.vue') },
    {
      path: '/journeys',
      name: 'journeys',
      component: () => import('./views/JourneysView.vue'),
    },
    {
      path: '/graph',
      name: 'graph',
      component: () => import('./views/GraphView.vue'),
    },
    {
      path: '/library',
      name: 'library',
      component: () => import('./views/LibraryView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('./views/SettingsView.vue'),
    },
    {
      path: '/share',
      name: 'share',
      component: () => import('./views/ShareView.vue'),
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

createApp(App).use(createPinia()).use(router).mount('#app')
