import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'

import { type Guidance, GUIDANCE_TOC } from '../../../.storybook/docs-page'
import { ChevronRightIcon, SpeedIcon } from '../icons/Icons'
import { StretchedLink } from './StretchedLink'

const meta = {
  title: 'Actions/StretchedLink',
  component: StretchedLink,
  args: { label: 'Open speed test', onClick: fn() },
  parameters: {
    docs: { subtitle: 'An invisible link stretched over a row, so the whole row opens a view.', toc: GUIDANCE_TOC },
    guidance: {
      whenToUse: [
        'A row that opens a view but holds a bar or figures, like Apps’ rows.',
        'A row or container that also holds a control of its own.',
      ],
      whenNotToUse: [
        'A simple row with a chevron: use `ListRow`.',
        'A whole card: use `Card` with `onOpen`, which draws its own.',
        'A link in a line of text: use `Link`.',
      ],
      accessibility: {
        handledByComponent: [
          'A `<button>` with `role="link"`, as it opens a view.',
          'Covers its container, so a click anywhere opens it.',
          'Its focus ring follows the container’s corners.',
        ],
        handledByYourCode: [
          'A `label`, or `aria-labelledby` pointing at a heading.',
          'A positioned container (`relative`) for it to cover.',
          'Controls raised above it (`relative z-2`), as siblings, never nested.',
          'A cue that it opens, like a caret.',
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
    <div className="group relative flex w-[280px] items-center gap-8 surface px-14 py-10 hover:bg-overlay-faint">
      <SpeedIcon size={16} className="text-tertiary" />
      <span className="type-body font-medium text-primary">Speed</span>
      <span className="type-body text-tertiary">412 Mbps</span>
      <StretchedLink {...args} />
      <ChevronRightIcon size={16} className="ml-auto text-tertiary group-hover:text-secondary" />
    </div>
  ),
}

/** The row opens from the keyboard, as a link, and from a click. */
export const Opening: Story = {
  ...OverRow,
  tags: ['!autodocs'],
  play: async ({ args, canvas, userEvent }) => {
    const link = canvas.getByRole('link', { name: 'Open speed test' })
    await userEvent.keyboard('{Tab}')
    await expect(link).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await userEvent.click(link)
    await expect(args.onClick).toHaveBeenCalledTimes(2)
  },
}

/** Focused from the keyboard: the ring shows the area the link covers. */
export const Focused: Story = {
  ...OverRow,
  // The ring keyboard focus draws, shown here for good: on a Docs page only
  // one story could hold real focus.
  args: { className: '[outline:var(--focus-outline)] outline-offset-(--focus-inset)' },
}
