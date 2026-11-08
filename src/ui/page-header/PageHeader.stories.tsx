import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ComponentProps, ComponentType, ReactNode } from 'react'
import { expect, fn } from 'storybook/test'

import { type Guidance, GUIDANCE_TOC } from '../../../.storybook/docs-page'
import { Button } from '../button/Button'
import { iconElementControl } from '../icons/icon-options'
import { GlobeIcon, PlusIcon, SearchIcon } from '../icons/Icons'
import { PageHeader } from './PageHeader'

// PageHeader takes `icon` or `onBack`, never both: a union Storybook's StoryObj
// can't derive story args from (they come out `never`). The stories type their
// args flat, with both optional, and pass one or the other.
type PageHeaderArgs = Omit<ComponentProps<typeof PageHeader>, 'icon' | 'onBack'> & {
  icon?: ReactNode
  onBack?: () => void
}

const actions = (
  <Button variant="solid" icon={PlusIcon} onClick={fn()}>
    Add service
  </Button>
)

const info = { label: 'About service checks', hint: 'Checks each service every minute.' }
const hostsInfo = { label: 'About per-app hosts', hint: 'Hosts each app talks to.' }

const meta = {
  title: 'App frame/PageHeader',
  // For the docs' props table; the render below does the passing.
  component: PageHeader as ComponentType<PageHeaderArgs>,
  args: { title: 'Services', icon: 'GlobeIcon', description: '12 services, all up' },
  argTypes: {
    icon: iconElementControl(18),
    actions: { control: false },
    info: { control: false },
    onBack: { control: false },
  },
  parameters: {
    docs: {
      subtitle: 'The top of a page: an icon or back button, the title and its line, info, and actions.',
      toc: GUIDANCE_TOC,
    },
    guidance: {
      whenToUse: [
        'The top of each tab’s page, like Devices or Usage.',
        'A page over a tab, `onBack` in place of `icon`: Hosts.',
        'Something running on the page, in `status`: “Checking…”.',
        'A page’s hint, in `info`: it sits before the actions’ divider, never after it.',
      ],
      whenNotToUse: ['A card’s title: use `CardHeader`.', 'An error about the page: use `Banner` below it.'],
      accessibility: {
        builtIn: [
          'The title is the page’s `<h1>`, in a `<header>`.',
          'The info button is named by `info.label`, its hint in a tooltip.',
          'A new `status` is announced to screen readers.',
          'The back button is named “Back”, with a matching tooltip.',
        ],
        toHandle: ['Labels and tooltips on the actions you pass.', '`status` words that make sense heard alone.'],
      },
    } satisfies Guidance,
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

/** A top-level page: its nav icon in the chip, info, and its actions after a divider. */
export const TopLevel: Story = { args: { actions, info } }

/** While something runs, the status takes the description's place. */
export const Status: Story = { args: { title: 'Devices', icon: 'SearchIcon', status: 'Scanning…' } }

/** A page layered over a tab: a back button in the chip's place, and info with no divider. */
export const Subpage: Story = {
  args: {
    title: 'Hosts',
    icon: undefined,
    onBack: fn(),
    description: 'Remote hosts by application, busiest first',
    info: hostsInfo,
  },
}

/** The back button, named “Back”, returns to the tab, from a click or the keyboard. */
export const GoingBack: Story = {
  ...Subpage,
  tags: ['!autodocs'],
  play: async ({ args, canvas, userEvent }) => {
    const back = canvas.getByRole('button', { name: 'Back' })
    await userEvent.click(back)
    await expect(args.onBack).toHaveBeenCalledOnce()
    await userEvent.keyboard('{Enter}')
    await expect(args.onBack).toHaveBeenCalledTimes(2)
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
      <PageHeader
        title="Services"
        icon={<GlobeIcon size={18} />}
        description="12 services, all up"
        actions={actions}
        info={info}
      />
      <PageHeader title="Devices" icon={<SearchIcon size={18} />} status="Scanning…" />
      <PageHeader
        title="Hosts"
        onBack={fn()}
        description="Remote hosts by application, busiest first"
        info={hostsInfo}
      />
      <PageHeader title="Services" icon={<GlobeIcon size={18} />} />
    </div>
  ),
}
