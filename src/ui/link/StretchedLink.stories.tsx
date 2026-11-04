import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { type Guidance, GUIDANCE_TOC } from '../../../.storybook/docs-page'
import { ChevronRightIcon, SpeedIcon } from '../icons/Icons'
import { StretchedLink } from './StretchedLink'

const meta = {
  title: 'Actions/StretchedLink',
  component: StretchedLink,
  args: { label: 'Open speed test', onClick: fn() },
  parameters: {
    docs: { toc: GUIDANCE_TOC },
    guidance: {
      use: [
        'A row that opens its view, when its content can’t sit in a button (a bar, figures).',
        'A container that also holds a control of its own.',
      ],
      avoid: [
        'A simple row with a chevron: use `ListRow`.',
        'A whole card: use `Card` with `onOpen`, which draws its own.',
        'A link beside text: use `Link`.',
        'An action rather than a view: use `Button`.',
      ],
      accessibility: {
        builtIn: [
          'A `<button>` with `role="link"`, as it opens a view: Enter opens it.',
          'Covers its container, so a click anywhere opens it.',
          'Its focus ring follows the container’s corners.',
          '`data-stretched-link`, so the container can style itself while it has focus.',
        ],
        youHandle: [
          'A `label`, or `aria-labelledby` pointing at a heading.',
          'A positioned container (`relative`) for it to cover.',
          'Controls raised above it (`relative z-2`), as siblings, never nested.',
          'A cue that the row opens, like a caret.',
          'A rounded ring where the corners aren’t (a list’s first and last rows), with `className`.',
        ],
      },
    } satisfies Guidance,
  },
} satisfies Meta<typeof StretchedLink>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The link itself is invisible: it lies over the whole row, whose content
 * shows through, so a click anywhere on it opens what it summarises. A Card
 * draws its own with `onOpen`.
 */
export const OverRow: Story = {
  render: (args) => (
    <div className="surface group relative flex w-[280px] items-center gap-8 px-14 py-10 hover:bg-fill-faint">
      <SpeedIcon size={16} className="text-tertiary" />
      <span className="text-md font-medium text-primary">Speed</span>
      <span className="text-sm text-tertiary">412 Mbps</span>
      <StretchedLink {...args} />
      <ChevronRightIcon size={16} className="ml-auto text-tertiary group-hover:text-secondary" />
    </div>
  ),
}

/** Focused from the keyboard: the ring shows the area the link covers. */
export const Focused: Story = {
  ...OverRow,
  // The ring keyboard focus draws, shown here for good: on a Docs page only
  // one story could hold real focus.
  args: { className: '[outline:var(--focus-outline)] outline-offset-(--focus-inset)' },
}
