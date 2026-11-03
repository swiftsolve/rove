import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import {
  AppsIcon,
  CloudIcon,
  DevicesIcon,
  EventsIcon,
  HomeIcon,
  LayersIcon,
  SettingsIcon,
  SpeedIcon,
  SunIcon,
  UsageIcon,
  type IconComponent,
} from '../icons/Icons'
import { ConnectionIcon } from '../icons/ConnectionIcon'
import { NavItem, NavRail } from './NavRail'

interface Page {
  label: string
  icon: IconComponent
}

const MAIN_PAGES: Page[] = [
  { label: 'Home', icon: HomeIcon },
  { label: 'Speed', icon: SpeedIcon },
  { label: 'Devices', icon: DevicesIcon },
  { label: 'Apps', icon: AppsIcon },
  { label: 'Services', icon: CloudIcon },
  { label: 'Timeline', icon: EventsIcon },
  { label: 'Interfaces', icon: LayersIcon },
  { label: 'Connection', icon: ConnectionIcon },
  { label: 'Usage', icon: UsageIcon },
]

const SETTINGS: Page = { label: 'Settings', icon: SettingsIcon }

const onNavigate = fn()
const onToggleTheme = fn()

/** Holds the current page, so clicking an item moves the active state. */
function ClickableRail({ label }: { label: string }): JSX.Element {
  const [page, setPage] = useState('Home')
  const item = ({ label: itemLabel, icon }: Page): JSX.Element => (
    <NavItem
      key={itemLabel}
      label={itemLabel}
      icon={icon}
      isActive={page === itemLabel}
      onClick={() => {
        setPage(itemLabel)
        onNavigate(itemLabel)
      }}
    />
  )
  return (
    <NavRail
      label={label}
      main={MAIN_PAGES.map(item)}
      footer={[
        <NavItem key="theme" label="Switch to light mode" icon={SunIcon} onClick={onToggleTheme} />,
        item(SETTINGS),
      ]}
    />
  )
}

const meta = {
  title: 'App frame/NavRail/NavRail',
  component: NavRail,
  subcomponents: { NavItem },
  // The story fills main and footer with the app's pages.
  args: { label: 'Main navigation', main: null, footer: null },
  argTypes: {
    main: { control: false },
    footer: { control: false },
  },
  parameters: { layout: 'fullscreen' },
  // The app window's height below the title bar.
  decorators: [
    (Story) => (
      <div className="flex h-[604px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof NavRail>

export default meta
type Story = StoryObj<typeof meta>

/** Home is the current page. Click an item to move the active state. */
export const Default: Story = {
  render: (args) => <ClickableRail label={args.label} />,
}
