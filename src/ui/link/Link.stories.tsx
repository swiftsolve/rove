import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'

import { type Guidance, GUIDANCE_TOC } from '../../../.storybook/docs-page'
import { iconArg, iconComponentControl } from '../icons/icon-options'
import { GlobeIcon, PlayIcon } from '../icons/Icons'
import { Link } from './Link'

const meta = {
  title: 'Actions/Link',
  component: Link,
  args: { children: 'All hosts', icon: iconArg('GlobeIcon'), onClick: fn() },
  argTypes: { icon: iconComponentControl },
  parameters: {
    docs: { toc: GUIDANCE_TOC },
    guidance: {
      use: [
        'Opening another view from a card or a row: “All hosts”, “View timeline”.',
        'An address outside the app, with `href`. It opens in a new window.',
        'Beside text, at the size of the text around it.',
      ],
      avoid: [
        'An action that changes something: use `Button`.',
        'A whole row that opens a view: use `ListRow`, or `StretchedLink` for richer rows.',
        'A whole card that opens a view: use `Card` with `onOpen`.',
      ],
      accessibility: {
        builtIn: [
          'In the app, a `<button>` with `role="link"`: Enter opens its view.',
          'Outside it, an `<a>` that opens a new window and tells screen readers so.',
          'Keyboard focus looks like hover, accent and underline, in place of a ring.',
          'Disabled stays focusable, ignores every press and tells screen readers (`aria-disabled`).',
          'Its icons are hidden from screen readers.',
        ],
        yours: [
          'Words that name where it goes: “All hosts”, not “Click here”.',
          'On a disabled link, a tooltip that says why.',
        ],
      },
    } satisfies Guidance,
  },
  // At the size of the text it sits in.
  render: (args) => (
    <span className="type-caption text-tertiary">
      <Link {...args} />
    </span>
  ),
} satisfies Meta<typeof Link>

export default meta
type Story = StoryObj<typeof meta>

/** Opens another view, and ends in a caret. */
export const WithIcon: Story = {}

export const WithoutIcon: Story = { args: { icon: undefined, children: 'View timeline' } }

/** Opens a real address in a new window, ends in an arrow, and says so to a screen reader. */
export const External: Story = {
  args: { icon: undefined, href: 'https://github.com/swiftsolve/rove', children: 'github.com/swiftsolve/rove' },
}

/** An in-app link is a link to a screen reader, and Enter opens its view. */
export const OpeningWithKeyboard: Story = {
  tags: ['!autodocs'],
  play: async ({ args, canvas, userEvent }) => {
    const link = canvas.getByRole('link', { name: 'All hosts' })
    await userEvent.keyboard('{Tab}')
    await expect(link).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await expect(args.onClick).toHaveBeenCalledOnce()
  },
}

/** Still focusable, so a tooltip can say why. */
export const Disabled: Story = { args: { isDisabled: true } }

/** It takes the size of the text around it. */
export const SmallText: Story = {
  args: { icon: iconArg('HistoryIcon'), children: 'History' },
  render: (args) => (
    <span className="text-xs">
      <Link {...args} />
    </span>
  ),
}

/** Every state, at two text sizes. */
export const AllStates: Story = {
  render: () => (
    <div className="flex flex-col gap-12">
      <span className="inline-flex items-center gap-12 type-caption text-tertiary">
        <Link icon={GlobeIcon}>All hosts</Link>
        <Link>View timeline</Link>
        <Link href="https://github.com/swiftsolve/rove">External</Link>
        <Link icon={GlobeIcon} isDisabled>
          Disabled
        </Link>
      </span>
      <span className="inline-flex items-center gap-12 text-xs">
        <Link icon={PlayIcon}>Small text</Link>
        <Link href="https://github.com/swiftsolve/rove">External</Link>
        <Link icon={PlayIcon} isDisabled>
          Disabled
        </Link>
      </span>
    </div>
  ),
}
