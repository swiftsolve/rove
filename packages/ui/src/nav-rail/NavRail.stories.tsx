import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn } from 'storybook/test'

import { type Guidance, GUIDANCE_TOC } from '../../.storybook/docs-page'
import { ConnectionIcon } from '../icons/ConnectionIcon'
import {
  AppsIcon,
  CloudIcon,
  DevicesIcon,
  EventsIcon,
  HomeIcon,
  type IconComponent,
  LayersIcon,
  SettingsIcon,
  SpeedIcon,
  SunIcon,
  UsageIcon,
} from '../icons/Icons'
import { NavItem } from './components/NavItem'
import { NavRail } from './NavRail'

type Page = {
  label: string
  icon: IconComponent
}

const MAIN_PAGES: Page[] = [
  { label: 'Home', icon: HomeIcon },
  { label: 'Speed', icon: SpeedIcon },
  { label: 'Connection', icon: ConnectionIcon },
  { label: 'Devices', icon: DevicesIcon },
  { label: 'Online services', icon: CloudIcon },
  { label: 'Apps', icon: AppsIcon },
  { label: 'Usage', icon: UsageIcon },
  { label: 'Timeline', icon: EventsIcon },
  { label: 'Interfaces', icon: LayersIcon },
]

const SETTINGS: Page = { label: 'Settings', icon: SettingsIcon }

const onNavigate = fn()
const onToggleTheme = fn()

/** Holds the current page, so clicking an item moves the active state. */
function ClickableRail({ label }: { label: string }) {
  const [page, setPage] = useState('Home')
  const item = ({ label: itemLabel, icon }: Page) => (
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
  parameters: {
    layout: 'fullscreen',
    docs: { subtitle: 'The icon rail down the window’s left side, one item per page.', toc: GUIDANCE_TOC },
    guidance: {
      whenToUse: [
        'The app’s pages, down the window’s left side, once.',
        'Settings and the theme switch, at the bottom in `footer`.',
      ],
      whenNotToUse: [
        'A page’s own actions: use `PageHeader`’s `actions`.',
        'An icon action anywhere else: use `IconButton`.',
      ],
      accessibility: {
        builtIn: [
          'A `<nav>` landmark named by `label`, its items in lists.',
          'Each item is a native button named by its `label`, also its tooltip.',
          'The current page’s item has `aria-current="page"`.',
          'One Tab stop, on the current page’s item. Up and Down move between items, Home and End to the ends.',
        ],
        toHandle: [
          'A `label` naming the rail: “Main navigation”.',
          '`isActive` on the current page’s item, and only that one.',
          'An action item’s label says what it does: “Switch to light mode”.',
        ],
      },
    } satisfies Guidance,
  },
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

/** One Tab stop, on the current page: the arrow keys move between items, and Tab leaves the rail. */
export const ArrowKeys: Story = {
  tags: ['!autodocs'],
  render: (args) => (
    <>
      <ClickableRail label={args.label} />
      <button type="button">After the rail</button>
    </>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.tab()
    await expect(canvas.getByRole('button', { name: 'Home' })).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    await expect(canvas.getByRole('button', { name: 'Speed' })).toHaveFocus()
    await userEvent.keyboard('{End}')
    await expect(canvas.getByRole('button', { name: 'Settings' })).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    await expect(canvas.getByRole('button', { name: 'Home' })).toHaveFocus()
    await userEvent.tab()
    await expect(canvas.getByRole('button', { name: 'After the rail' })).toHaveFocus()
  },
}
