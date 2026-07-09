/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    // e2e/ holds Playwright specs, run via `npm run test:e2e`, not vitest.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
