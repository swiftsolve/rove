import { defineConfig } from 'vitest/config'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import { playwright } from '@vitest/browser-playwright'
import path from 'node:path'

// Three kinds of test. `.test.ts` is pure logic (utils, formatters) and runs
// in Node, never touching the DOM, the bridge or the styles. `.test.tsx`
// renders components and hooks into happy-dom with Testing Library: behaviour
// and accessibility, not looks (the stable screenshots cover those). Every
// story is also a test: it renders in headless Chromium with the real styles,
// runs its `play` function and the a11y addon's checks. The unit and DOM tests
// share only the `@` alias with vite.config.ts; the stories build with all of it.
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
      {
        // Tailwind, CSS Modules and the React plugin, as `npm run storybook` builds with.
        extends: './vite.config.ts',
        plugins: [storybookTest({ configDir: path.join(__dirname, '.storybook') })],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
})
