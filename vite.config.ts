import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'x192.png', 'x512.png'],
      manifest: {
        name: 'GrossBuch - Expense Tracker',
        short_name: 'GrossBuch',
        description: 'Personal expense and income tracking app',
        theme_color: '#3b82f6',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: '/dark-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/dark-512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/dark-144.png',
            sizes: '144x144',
            type: 'image/png'
          },
          {
            src: '/dark-1024.png',
            sizes: '1024x1024',
            type: 'image/png'
          },
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 3000000,
        globPatterns: ['**/*.{js,mjs,css,html,ico,png,svg,wasm}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: /\/sync\//,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https?.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'external-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60
              }
            }
          }
        ]

      },
      devOptions: {
        enabled: true
      }
    })
  ],
  build: {
    minify: false,
    sourcemap: true
  },

  // Required for SQLite WASM with OPFS
  server: {
    host: '0.0.0.0',
    allowedHosts: ['dev.grossbuh.lan'],
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    },
  },

  preview: {
    host: '0.0.0.0',
    allowedHosts: ['grossbuh.lan'],
    port: 8001,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    },
  },

  // Exclude sqlite-wasm from optimization
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm', 'src/sqlite-wasm']
  },

  worker: {
    format: 'es',
    plugins: () => [react()]
  }
})
