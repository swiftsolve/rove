import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { BrandIcon } from '../icons/BrandIcon'
import { TitleBar, TitleBarStatus, WindowButton } from './TitleBar'

const brand = (
  <>
    <span className="inline-flex shrink-0 items-center justify-center text-accent" aria-hidden>
      <BrandIcon size={22} />
    </span>
    <span className="text-2xl font-semibold tracking-heading-large text-primary">Rove</span>
  </>
)

const controls = (
  <>
    <WindowButton action="minimize" onClick={fn()} />
    <WindowButton action="close" onClick={fn()} />
  </>
)

const meta = {
  title: 'App frame/TitleBar/TitleBar',
  component: TitleBar,
  subcomponents: { TitleBarStatus, WindowButton },
  args: { brand, status: <TitleBarStatus tone="positive">Wi‑Fi</TitleBarStatus>, controls },
  argTypes: {
    brand: { control: false },
    status: { control: false },
    controls: { control: false },
  },
  parameters: { layout: 'fullscreen' },
  // The app window's width.
  decorators: [
    (Story) => (
      <div className="w-[545px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TitleBar>

export default meta
type Story = StoryObj<typeof meta>

/** Online: the dot pulses green. */
export const Connected: Story = {}

/** Connected, but the internet is down. */
export const NoInternet: Story = { args: { status: <TitleBarStatus tone="negative">No internet</TitleBarStatus> } }

/** No network info yet. */
export const Connecting: Story = { args: { status: <TitleBarStatus tone="neutral">Connecting…</TitleBarStatus> } }

/** No network at all. */
export const Offline: Story = { args: { status: <TitleBarStatus tone="neutral">Offline</TitleBarStatus> } }

/** A window with native decorations has no WindowButtons. */
export const WithoutControls: Story = { args: { controls: undefined } }

/** Every status together. */
export const AllStates: Story = {
  // Several title bars, each a banner landmark, is this overview only; the app
  // has one.
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
    <div className="flex flex-col">
      <TitleBar brand={brand} status={<TitleBarStatus tone="positive">Wi‑Fi</TitleBarStatus>} controls={controls} />
      <TitleBar
        brand={brand}
        status={<TitleBarStatus tone="negative">No internet</TitleBarStatus>}
        controls={controls}
      />
      <TitleBar
        brand={brand}
        status={<TitleBarStatus tone="neutral">Connecting…</TitleBarStatus>}
        controls={controls}
      />
      <TitleBar brand={brand} status={<TitleBarStatus tone="neutral">Offline</TitleBarStatus>} />
    </div>
  ),
}
