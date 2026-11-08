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
    docs: { subtitle: 'A small spinning ring for a wait inside a button or a header.', toc: GUIDANCE_TOC },
    guidance: {
      whenToUse: [
        'A small wait in a card header: the speed test running.',
        'A small wait in a card body: the home Devices card’s scan.',
      ],
      whenNotToUse: [
        'A button’s wait: set `isLoading` on `Button` or `IconButton`.',
        'A page’s first load: use `LoadingState`.',
        'A wait in a dialog or page area: use `Spinner`.',
      ],
      accessibility: {
        handledByComponent: [
          'Hidden from screen readers (`aria-hidden`).',
          'An inline `<svg>`, valid inside a `<button>`.',
        ],
        handledByYourCode: ['A name for the wait: `role="img"` and an `aria-label` on a wrapper.'],
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
    <span className="type-caption inline-flex items-center gap-6 text-secondary">
      <ButtonSpinner {...args} />
      Retrying…
    </span>
  ),
}
