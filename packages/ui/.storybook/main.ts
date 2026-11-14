import path from 'node:path'

import type { StorybookConfig } from '@storybook/react-vite'

// Storybook builds with the library's vite.config.ts: React and Tailwind.
const config: StorybookConfig = {
  stories: ['./introduction.stories.tsx', '../src/**/*.stories.tsx'],
  addons: [
    '@storybook/addon-docs',
    '@storybook/addon-a11y',
    '@storybook/addon-vitest',
    // Visual Tests: compares stories' pixels in Chromatic's cloud, once signed in.
    '@chromatic-com/storybook',
  ],
  framework: '@storybook/react-vite',
  // public/favicon.svg, the Rove Mark alone, is the tab's icon in place of Storybook's.
  staticDirs: [
    { from: './public', to: '/' },
    // The faces manager-head.html loads for the sidebar.
    { from: '../src/fonts', to: '/fonts' },
  ],
  core: { disableTelemetry: true },
  // Resolves prop types through the compiler, so a VariantOf prop lists its
  // values in the docs table rather than `NonNullable`.
  typescript: { reactDocgen: 'react-docgen-typescript' },
  viteFinal(viteConfig) {
    // Storybook sets its own watch options, dropping vite.config.ts's. Rust
    // build output and agent worktrees (.claude) aren't source, and watching
    // them exhausts inotify.
    viteConfig.server = {
      ...viteConfig.server,
      watch: { ...viteConfig.server?.watch, ignored: ['**/target/**', '**/.claude/**'] },
    }
    // The introduction shows a few of the app's own components, which import
    // the app's source through its `@/` alias. Only this docs site does: the
    // library itself never imports the app.
    viteConfig.resolve = {
      ...viteConfig.resolve,
      alias: { ...viteConfig.resolve?.alias, '@': path.resolve(import.meta.dirname, '../../../apps/rove/src') },
    }
    return viteConfig
  },
}

export default config
