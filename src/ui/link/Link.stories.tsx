import type { Meta, StoryObj } from '@storybook/react-vite'
import { Link } from './Link'

const meta = {
  title: 'Actions/Link',
  component: Link,
  args: { href: 'https://github.com/swiftsolve/rove', children: 'github.com/swiftsolve/rove' },
  // A link sits in running text.
  render: (args) => (
    <span className="text-sm text-secondary">
      Source on <Link {...args} />
    </span>
  ),
} satisfies Meta<typeof Link>

export default meta
type Story = StoryObj<typeof meta>

/** Opens in a new window, and says so to a screen reader. */
export const External: Story = { args: { isExternal: true } }

/** Opens in the same window. */
export const SameWindow: Story = { args: { isExternal: false } }
