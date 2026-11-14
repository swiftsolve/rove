import path from 'node:path'

import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

/**
 * Three kinds of test: `.test.ts` is pure logic, in Node. `.test.tsx` renders
 * into happy-dom with Testing Library, for behaviour and accessibility, not
 * looks. Every story runs in headless Chromium with the real styles, its `play`
 * function and the a11y checks.
 */
export default defineConfig({
  server: {
    watch: {
      // Other sessions' worktrees aren't this checkout's source; watching
      // them exhausts inotify and kills the run.
      ignored: ['**/target/**', '**/.claude/**'],
    },
  },
  test: {
    projects: [
      { extends: true, test: { name: 'unit', include: ['src/**/*.test.ts', 'cli/**/*.test.ts'], environment: 'node' } },
      {
        extends: true,
        test: {
          name: 'dom',
          include: ['src/**/*.test.tsx'],
          environment: 'happy-dom',
          setupFiles: ['src/testing/setup.ts'],
        },
      },
      {
        // React and Tailwind, as `npm run storybook` builds with.
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
