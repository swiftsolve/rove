import react from '@vitejs/plugin-react'

// A Storybook of the tokens: every page is styled with tokens.css and lists
// the tokens from the DTCG files in dist/tokens/, so it follows each build.
/** @type {import('@storybook/react-vite').StorybookConfig} */
const config = {
  stories: ['../stories/*.stories.jsx'],
  addons: ['@storybook/addon-docs'],
  // public/favicon.svg, the Rove Mark alone, is the tab's icon in place of Storybook's.
  staticDirs: [{ from: './public', to: '/' }],
  framework: '@storybook/react-vite',
  core: { disableTelemetry: true, disableWhatsNewNotifications: true },
  // Pages of tokens, not components: no onboarding, "new" badges, or canvas tools that do nothing here.
  features: {
    sidebarOnboardingChecklist: false,
    changeDetection: false,
    actions: false,
    interactions: false,
    backgrounds: false,
    measure: false,
    outline: false,
    viewport: false,
  },
  // The package has no vite.config.js of its own to bring the JSX transform.
  viteFinal: (viteConfig) => ({ ...viteConfig, plugins: [...(viteConfig.plugins ?? []), react()] }),
}

export default config
