import type { StorybookConfig } from '@storybook/react-vite'

// Storybook builds with the app's own vite.config.ts: Tailwind, the `@/` alias
// and CSS Modules come from there.
const config: StorybookConfig = {
  stories: ['./introduction.stories.tsx', '../src/ui/**/*.stories.tsx'],
  addons: [
    '@storybook/addon-docs',
    '@storybook/addon-a11y',
    '@storybook/addon-vitest',
    // Visual Tests: compares stories' pixels in Chromatic's cloud, once signed in.
    '@chromatic-com/storybook',
  ],
  framework: '@storybook/react-vite',
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
    return viteConfig
  },
}

export default config
