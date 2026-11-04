import type { Meta, StoryObj } from '@storybook/react-vite'

import { type Guidance, GUIDANCE_TOC } from '../../../.storybook/docs-page'
import { ButtonSpinner } from './ButtonSpinner'

const meta = {
  title: 'Status and feedback/ButtonSpinner',
  component: ButtonSpinner,
  args: { size: 14 },
  argTypes: {
    size: { control: { type: 'number', min: 10, max: 32, step: 1 } },
    color: { control: 'text' },
  },
  // It takes its colour from the text around it, as it does in a button.
  parameters: {
    docs: { toc: GUIDANCE_TOC },
    guidance: {
      use: [
        'A loading `Button` or `IconButton` draws it for you.',
        'A small busy mark outside a button, like a card header’s while a test runs.',
        '`size` in px, to match the icon it stands in for.',
      ],
      avoid: [
        'A button’s own wait: set `isLoading` on `Button` instead.',
        'A page’s first load: use `LoadingState`.',
        'A wait with room for the full indicator: use `Spinner`.',
      ],
      accessibility: {
        builtIn: [
          'Hidden from screen readers (`aria-hidden`).',
          'An inline `<svg>`, so it’s valid inside a `<button>`.',
          'Stops moving under reduced motion.',
        ],
        youHandle: [
          'Outside a button, a name for the wait: words beside it, or `role="img"` and an `aria-label` on its wrapper.',
          'Inside a button, a `loadingLabel` when the wait needs words.',
        ],
      },
    } satisfies Guidance,
  },
  render: (args) => (
    <span className="inline-flex text-secondary">
      <ButtonSpinner {...args} />
    </span>
  ),
} satisfies Meta<typeof ButtonSpinner>

export default meta
type Story = StoryObj<typeof meta>

/** The text colour around it. A loading Button draws this for you. */
export const Default: Story = {}

/** Outside a button, in the accent. */
export const Accent: Story = { args: { size: 16, color: 'var(--accent-default)' } }

/** Beside the words it stands for, outside a button. */
export const WithLabel: Story = {
  render: (args) => (
    <span className="inline-flex items-center gap-6 type-caption text-secondary">
      <ButtonSpinner {...args} />
      Retrying…
    </span>
  ),
}
