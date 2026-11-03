import type { Meta, StoryObj } from '@storybook/react-vite'

import { CardList } from './Card'

const meta = {
  title: 'Containers/Card/CardList',
  component: CardList,
  args: { label: 'Devices' },
  argTypes: { children: { control: false } },
  render: (args) => (
    <div className="w-[360px]">
      <CardList {...args}>
        {['MacBook Pro', 'Living room TV', 'Pixel 8'].map((name) => (
          <li key={name} className="px-12 py-10 text-sm text-primary">
            {name}
          </li>
        ))}
      </CardList>
    </div>
  ),
} satisfies Meta<typeof CardList>

export default meta
type Story = StoryObj<typeof meta>

/** A list that is one card, with a hairline between its rows. */
export const Default: Story = {}
