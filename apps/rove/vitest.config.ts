import path from 'node:path'

import { defineConfig } from 'vitest/config'

// Two kinds of test: `.test.ts` is pure logic, in Node. `.test.tsx` renders
// into happy-dom with Testing Library, for behaviour and accessibility, not
// looks. They share only the `@` alias with vite.config.ts. The library's
// stories run in packages/ui.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    watch: {
      // The Rust build output and other sessions' worktrees aren't this
      // checkout's source; watching them exhausts inotify and kills the run.
      ignored: ['**/target/**', '**/src-tauri/target/**', '**/.claude/**'],
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
          setupFiles: ['src/testing/setup.ts'],
        },
      },
    ],
  },
})
