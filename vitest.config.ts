import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Two kinds of test, split by extension. `.test.ts` is pure logic (utils,
// formatters) and runs in Node, never touching the DOM, the bridge or the
// styles. `.test.tsx` renders components and hooks into happy-dom with Testing
// Library: behaviour and accessibility, not looks (the stable screenshots
// cover those). Only the `@` alias is shared with vite.config.ts.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    projects: [
      { extends: true, test: { name: 'unit', include: ['src/**/*.test.ts'], environment: 'node' } },
      {
        extends: true,
        test: {
          name: 'dom',
          include: ['src/**/*.test.tsx'],
          environment: 'happy-dom',
          setupFiles: ['src/ui/testing/setup.ts'],
        },
      },
    ],
  },
})
