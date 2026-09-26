import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

const base = process.env.VITE_BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Wander Map',
        short_name: 'Wander Map',
        description: 'A personal map for places, routes and everyday movement.',
        theme_color: '#102522',
        background_color: '#f3f1eb',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          {
            src: `${base}favicon.svg`,
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: { navigateFallback: 'index.html' },
    }),
  ],
})
