import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Unit tests for the UI's pure logic (utils, formatters). They run in Node, so
// they never touch the DOM, the bridge or the styles; only the `@` alias is
// shared with vite.config.ts.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
