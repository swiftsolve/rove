import type { ComponentProps, ComponentType, ReactNode } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { Button } from '../button/Button'
import { IconButton } from '../button/IconButton'
import { GlobeIcon, HelpIcon, PlusIcon, SearchIcon } from '../icons/Icons'
import { iconElementControl } from '../icons/icon-options'
import { PageHeader } from './PageHeader'

// PageHeader takes `icon` or `onBack`, never both: a union Storybook's StoryObj
// can't derive story args from (they come out `never`). The stories type their
// args flat, with both optional, and pass one or the other.
type PageHeaderArgs = Omit<ComponentProps<typeof PageHeader>, 'icon' | 'onBack'> & {
  icon?: ReactNode
  onBack?: () => void
}

const actions = (
  <>
    <IconButton label="Help" icon={HelpIcon} />
    <Button variant="solid" icon={PlusIcon} onClick={fn()}>
      Add service
    </Button>
  </>
)

const meta = {
  title: 'App frame/PageHeader',
  // For the docs' props table; the render below does the passing.
  component: PageHeader as ComponentType<PageHeaderArgs>,
  args: { title: 'Services', icon: 'GlobeIcon', description: '12 services, all up' },
  argTypes: {
    icon: iconElementControl(18),
    actions: { control: false },
    onBack: { control: false },
  },
  render: ({ icon, onBack, ...args }) =>
    onBack ? <PageHeader {...args} onBack={onBack} /> : <PageHeader {...args} icon={icon} />,
  // The content column, with the scroll area's padding, which the header's
  // divider bleeds into.
  decorators: [
    (Story) => (
      <div className="w-[482px] pt-12 pr-(--content-inset-right) pl-12">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<PageHeaderArgs>

export default meta
type Story = StoryObj<typeof meta>

/** A top-level page: its nav icon in the chip, and its actions. */
export const TopLevel: Story = { args: { actions } }

/** While something runs, the status takes the description's place. */
export const Status: Story = { args: { title: 'Devices', icon: 'SearchIcon', status: 'Scanning…' } }

/** A page layered over a tab: a back button in the chip's place, and its hint. */
export const Subpage: Story = {
  args: {
    title: 'Hosts',
    icon: undefined,
    onBack: fn(),
    description: 'Remote hosts by application, busiest first',
    actions: <IconButton label="About per-app hosts" icon={HelpIcon} />,
  },
}

/** No line under the title. */
export const TitleOnly: Story = { args: { description: undefined } }

/** Every form together. */
export const AllStates: Story = {
  // Several headers on one page is this overview only; the app has one.
  parameters: {
    a11y: {
      config: {
        rules: [
          { id: 'landmark-no-duplicate-banner', enabled: false },
          { id: 'landmark-unique', enabled: false },
        ],
      },
    },
  },
  render: () => (
    <div className="flex flex-col gap-20">
      <PageHeader title="Services" icon={<GlobeIcon size={18} />} description="12 services, all up" actions={actions} />
      <PageHeader title="Devices" icon={<SearchIcon size={18} />} status="Scanning…" />
      <PageHeader
        title="Hosts"
        onBack={fn()}
        description="Remote hosts by application, busiest first"
        actions={<IconButton label="About per-app hosts" icon={HelpIcon} />}
      />
      <PageHeader title="Services" icon={<GlobeIcon size={18} />} />
    </div>
  ),
}
