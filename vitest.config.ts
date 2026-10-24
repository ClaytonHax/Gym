import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts so the PWA plugin stays out of tests.
// tests/firestore.rules.test.mjs runs against the emulator via `npm run test:rules`.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
