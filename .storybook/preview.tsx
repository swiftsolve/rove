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
  // Storybook gives any type it can't map (`ReactNode`, event handlers) a JSON
  // control, and setting one passes `{}`, which React can't render. A
  // ReactNode prop gets a text control, or none when the story passes it JSX;
  // the rest get none.
  argTypesEnhancers: [
    ({ argTypes, initialArgs }) =>
      Object.fromEntries(
        Object.entries(argTypes).map(([name, argType]) => {
          if (argType.type?.name !== 'other' || argType.control !== undefined) return [name, argType]
          const arg = initialArgs[name]
          const isText = argType.type.value === 'ReactNode' && (arg == null || typeof arg !== 'object')
          // In the normalized form: enhancers run after Storybook expands `'text'` and `false`.
          return [name, { ...argType, control: isText ? { type: 'text' } : { disable: true } }]
        }),
      ),
  ],
  decorators: [
    (Story, { globals }) => {
      // The app switches theme with this class on <html> (theme-transition.ts).
      document.documentElement.classList.toggle('theme-light', globals.theme === 'light')
      return <Story />
    },
  ],
  parameters: {
    // Each story sits in the middle of its canvas, on a Docs page too.
    layout: 'centered',
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
          // A component with parts is a folder: the component first, then its parts.
          ['Card', ['Card', 'CardHeader', 'CardBody', 'CardFooter', 'CardList'], 'DotSeparator', ['DotSeparator', 'InlineMeta'], '*'],
          'App frame',
          ['NavRail', ['NavRail', 'NavItem'], 'TitleBar', ['TitleBar', 'TitleBarStatus', 'WindowButton'], '*'],
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
