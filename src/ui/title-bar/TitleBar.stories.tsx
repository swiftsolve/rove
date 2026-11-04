import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { type Guidance, GUIDANCE_TOC } from '../../../.storybook/docs-page'
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
  parameters: {
    layout: 'fullscreen',
    docs: { toc: GUIDANCE_TOC },
    guidance: {
      use: [
        'The window’s top edge, once: brand, connection status and window controls.',
        'A `TitleBarStatus` beside the brand: the connection, in words.',
        '`WindowButton`s for minimise and close, on a frameless window.',
      ],
      avoid: [
        'A page’s title and actions: use `PageHeader`.',
        'Moving between pages: use `NavRail`.',
        'A status anywhere else: a `StatusDot` beside its words.',
      ],
      states: [
        'Positive: connected, the dot pulsing green.',
        'Negative: connected, but something’s wrong beyond the link (“No internet”).',
        'Neutral: connecting or offline, with a still dot.',
        'Close turns red on hover. Minimise brightens.',
        'No window buttons on a window with native decorations.',
      ],
      accessibility: {
        builtIn: [
          'A `<header>` landmark, which also drags the window.',
          '`TitleBarStatus` is a status region: a change is read out.',
          'The status dot is decorative. The words carry it.',
          'Each `WindowButton` is a native button named “Minimize” or “Close”, out of the Tab order like a native title bar’s.',
        ],
        yours: [
          'A brand whose name is text, its mark hidden from screen readers.',
          'Status words that make sense alone: “No internet”, not “Error”.',
        ],
      },
    } satisfies Guidance,
  },
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
