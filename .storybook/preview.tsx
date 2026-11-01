// First, so the cascade layers are declared before any CSS uses them.
import '../src/styles/tailwind.css'
import './preview.css'
import type { Preview } from '@storybook/react-vite'

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'The app theme',
      toolbar: {
        title: 'Theme',
        icon: 'mirror',
        items: [
          { value: 'dark', title: 'Dark' },
          { value: 'light', title: 'Light' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: 'dark' },
  decorators: [
    (Story, { globals }) => {
      // The app switches theme with this class on <html> (theme-transition.ts).
      document.documentElement.classList.toggle('theme-light', globals.theme === 'light')
      return <Story />
    },
  ],
  parameters: {
    layout: 'padded',
    // The groups in src/ui/index.ts's order.
    options: {
      storySort: {
        order: [
          'Actions',
          'Inputs',
          'Overlays',
          'Status and feedback',
          'Data display',
          'Containers',
          'App frame',
          'Foundations',
        ],
      },
    },
    controls: { expanded: true },
    a11y: {
      test: 'error',
      // Base UI's focus guards are hidden yet focusable by design; the app's
      // audit (scripts/a11y-audit.mjs) leaves them out too.
      context: { include: ['body'], exclude: ['[data-base-ui-focus-guard]'] },
    },
  },
  tags: ['autodocs'],
}

export default preview
