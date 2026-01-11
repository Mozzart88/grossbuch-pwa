import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    include: ['src/tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/tests/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/sqlite-wasm/**',
        'src/services/database/worker.ts',
        'src/services/database/connection.ts',
        'src/types/**',
      ],
      thresholds: {
        statements: 96,
        branches: 93,
        functions: 93,
        lines: 96,
      },
    },
  },
})
