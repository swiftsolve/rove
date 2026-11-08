import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { Badge } from '../../badge/Badge'
import { IconButton } from '../../button/IconButton'
import { iconArg, iconElementControl } from '../../icons/icon-options'
import { RefreshIcon } from '../../icons/Icons'
import { Card } from '../Card'
import { CardBody } from './CardBody'
import { CardHeader } from './CardHeader'

const ACTIONS = {
  none: undefined,
  badge: <Badge tone="positive">VPN</Badge>,
  button: <IconButton label="Refresh" icon={RefreshIcon} onClick={fn()} />,
}

const meta = {
  title: 'Containers/Card/CardHeader',
  component: CardHeader,
  args: { title: 'Wi‑Fi', icon: iconArg('WifiIcon') },
  argTypes: {
    icon: iconElementControl(16),
    actions: { control: 'inline-radio', options: Object.keys(ACTIONS), mapping: ACTIONS },
  },
  // A header is the top row of a Card.
  decorators: [
    (Story) => (
      <div className="w-[360px]">
        <Card>
          <Story />
          <CardBody>
            <p className="type-body text-secondary">The card's content.</p>
          </CardBody>
        </Card>
      </div>
    ),
  ],
} satisfies Meta<typeof CardHeader>

export default meta
type Story = StoryObj<typeof meta>

/** An icon and the title. */
export const Default: Story = {}

/** A badge at the end of the row. */
export const WithBadge: Story = { args: { actions: ACTIONS.badge } }

/** A control at the end; the row keeps its 44px height. */
export const WithButton: Story = { args: { title: 'DNS', actions: ACTIONS.button } }
