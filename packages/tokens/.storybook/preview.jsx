import '../dist/tokens.css'
import '../dist/text-styles.css'
import './preview.css'
import '../stories/stories.css'

/** @type {import('@storybook/react-vite').Preview} */
const preview = {
  globalTypes: {
    theme: {
      description: 'The theme',
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
  // Light, as the Figma file's doc pages are; the tables show both themes either way.
  initialGlobals: { theme: 'light' },
  decorators: [
    (Story, { globals }) => {
      // tokens.css puts Light on :root.theme-light.
      document.documentElement.classList.toggle('theme-light', globals.theme === 'light')
      return <Story />
    },
  ],
  parameters: {
    layout: 'fullscreen',
    // In the order of the Figma file's Foundations pages, one story each; Motion is code-only.
    options: {
      storySort: {
        order: ['Introduction', 'Colour', 'Typography', 'Spacing, radius & effects', 'Motion'],
      },
    },
  },
}

export default preview
