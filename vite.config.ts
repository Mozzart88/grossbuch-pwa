/// <reference types="vitest" />
/// <reference types="vite/client" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// import fs from 'node:fs'
import { VitePWA } from 'vite-plugin-pwa'

const baseUrl = process.env.NODE_ENV === 'gh-preview' ? '/grossbuch-pwa/' : '/'
// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: [
        'robots.txt'
      ],
      manifest: {
        name: 'GrossBuch',
        short_name: 'GB',
        description: 'Track your finance privatelly',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait',
        scope: baseUrl,
        start_url: baseUrl,
        icons: [
          { src: baseUrl + 'pwax144.png', sizes: '144x144', type: 'image/png' },
          { src: baseUrl + 'pwax192.png', sizes: '192x192', type: 'image/png' },
          { src: baseUrl + 'pwax512.png', sizes: '512x512', type: 'image/png' },
          { src: baseUrl + 'pwax1024.png', sizes: '1024x1024', type: 'image/png' },
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^http[s]?:\/\/192\.168\.0\.175:4173[\/]?.*$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60
              }
            }
          },
          {
            urlPattern: /^http[s]?:\/\/localhost:4173[\/]?.*$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 50,
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
  server: {
    host: '0.0.0.0',
    // https: {
    //   key: fs.readFileSync('./cert/server.key'),
    //   cert: fs.readFileSync('./cert/server.crt'),
    // },
    port: 4173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    },
  },
  // preview: {
  //   host: '0.0.0.0',
  //   https: {
  //     key: fs.readFileSync('./cert/server.key'),
  //     cert: fs.readFileSync('./cert/server.crt'),
  //   },
  //   headers: {
  //     'Cross-Origin-Opener-Policy': 'same-origin',
  //     'Cross-Origin-Embedder-Policy': 'require-corp'
  //   },
  // },
  preview: {
    host: '0.0.0.0',
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    },
  },
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm']
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    include: ['src/**/*.test.{ts,tsx}']
  },
  base: baseUrl
})
