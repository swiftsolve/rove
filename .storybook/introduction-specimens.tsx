import { type JSX, type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

import { mockQrSvg } from '../src/bridge/mock-network-api'
import { ConnectionDetailsPanel } from '../src/features/current-network/components/ConnectionDetailsPanel'
import { ConnectionStrip } from '../src/features/current-network/components/ConnectionStrip'
import { ShareWifiButton } from '../src/features/current-network/components/ShareWifiButton'
import { WifiQrCode } from '../src/features/current-network/components/WifiQrCode'
import type { WifiNetworkInfo } from '../src/types'
import {
  AppsIcon,
  Badge,
  BarMeter,
  BrandIcon,
  Button,
  Card,
  CloseIcon,
  CloudIcon,
  Collapsible,
  CollapsiblePanel,
  ComputerIcon,
  ConnectionIcon,
  DevicesIcon,
  DirectionIcon,
  EventsIcon,
  HistoryIcon,
  HomeIcon,
  IconButton,
  type IconComponent,
  LayersIcon,
  Link,
  LoadingState,
  MoonIcon,
  NavItem,
  NavRail,
  PlayIcon,
  Readout,
  RefreshIcon,
  SegmentedControl,
  SettingsIcon,
  SpeedIcon,
  Spinner,
  SplitBar,
  StatusDot,
  SunIcon,
  TextField,
  TextFieldAction,
  TitleBar,
  TitleBarStatus,
  Toggle,
  UsageIcon,
  useCountUp,
  WindowButton,
} from '../src/ui'
// The sizer's own hook: not in the library's public API, so reached by its path.
import { useContentHeight } from '../src/ui/hooks/useContentHeight'

const noop = (): void => {}

const prefersReducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * A step that loops through `count` steps, one every `ms`. Every scene runs on
 * one, so the page moves on its own; under reduced motion it holds at step 0.
 */
function useStep(count: number, ms: number): number {
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (prefersReducedMotion()) return undefined
    const id = setInterval(() => setStep((current) => (current + 1) % count), ms)
    return () => clearInterval(id)
  }, [count, ms])
  return step
}

/** The item at `index`, which the scenes keep inside the list by counting modulo its length. */
function itemAt<Item>(items: readonly Item[], index: number): Item {
  const item = items[index]
  if (item === undefined) throw new Error(`No item at ${index} in a list of ${items.length}`)
  return item
}

/**
 * The one tempo every scene keeps: each changes on a beat, or a few, so the
 * grid moves together, unhurried, and a scene changes one thing a beat, never
 * two at once. Typing goes a character a TYPE_BEAT.
 */
const BEAT = 1800
const TYPE_BEAT = 150
// A beat in typing ticks, so a scene that types keeps the same beat on one clock.
const TICKS_PER_BEAT = BEAT / TYPE_BEAT

// The rail's main tabs and their icons, as the app's tab registry (src/app/utils/tab-registry.ts) lists them.
const TABS: { label: string; icon: IconComponent }[] = [
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

// The title bar's verdicts, in the words of src/app/utils/connection-status.ts.
const CONNECTING = { tone: 'neutral', label: 'Connecting…' } as const
const WIFI = { tone: 'positive', label: 'Wi‑Fi' } as const
const NO_INTERNET = { tone: 'negative', label: 'No internet' } as const

// One change a beat, the rail's tab or the title bar's status, never both, and back to the start.
const FRAME_BEATS = [
  { tab: 0, verdict: CONNECTING },
  { tab: 0, verdict: WIFI },
  { tab: 1, verdict: WIFI },
  { tab: 2, verdict: WIFI },
  { tab: 2, verdict: NO_INTERNET },
  { tab: 2, verdict: WIFI },
  { tab: 3, verdict: WIFI },
  { tab: 0, verdict: WIFI },
]

/**
 * App frame: the window's corner as the app draws it: AppTitleBar's brand,
 * status and controls over TabBar's rail, moving tab to tab, then the status changing.
 */
function AppFrameScene(): JSX.Element {
  const { tab: activeTab, verdict } = itemAt(FRAME_BEATS, useStep(FRAME_BEATS.length, BEAT))
  const { tone, label } = verdict
  return (
    <div className="intro-window">
      <TitleBar
        brand={
          <>
            <span className="inline-flex shrink-0 items-center justify-center text-accent" aria-hidden>
              <BrandIcon size={22} />
            </span>
            <span className="type-title leading-body text-primary">Rove</span>
          </>
        }
        status={<TitleBarStatus tone={tone}>{label}</TitleBarStatus>}
        controls={
          <>
            <WindowButton action="minimize" onClick={noop} />
            <WindowButton action="close" onClick={noop} />
          </>
        }
      />
      <div className="intro-window-body">
        <NavRail
          label="Main navigation"
          main={TABS.map(({ label: tab, icon }, index) => (
            <NavItem key={tab} label={tab} icon={icon} isActive={index === activeTab} onClick={noop} />
          ))}
          footer={[
            <NavItem key="theme" label="Switch to light mode" icon={SunIcon} onClick={noop} />,
            <NavItem key="settings" label="Settings" icon={SettingsIcon} onClick={noop} />,
          ]}
        />
      </div>
    </div>
  )
}

/** Data display: a live speed test, its numbers easing to each new sample. */
const DOWNLOADS = [182, 204, 168, 231, 196]
const UPLOADS = [24, 31, 22, 36, 27]

/** The rating's lit bars for a download speed in Mbps, 2 to 4. */
function signalBarsFor(downloadMbps: number): number {
  if (downloadMbps > 215) return 4
  if (downloadMbps > 175) return 3
  return 2
}

function DataDisplayScene(): JSX.Element {
  // One reading a beat: download, then upload, in turn.
  const step = useStep(DOWNLOADS.length * 2, BEAT)
  const down = useCountUp(itemAt(DOWNLOADS, Math.floor((step + 1) / 2) % DOWNLOADS.length))
  const up = useCountUp(itemAt(UPLOADS, Math.floor(step / 2) % UPLOADS.length))
  return (
    <div className="intro-stack is-data">
      <div className="intro-row is-wide">
        <Readout
          label="Download"
          icon={<DirectionIcon series="down" />}
          value={String(Math.round(down))}
          unit="Mbps"
          spokenValue="182"
        />
        <Readout
          label="Upload"
          icon={<DirectionIcon series="up" />}
          value={String(Math.round(up))}
          unit="Mbps"
          spokenValue="24"
        />
        <BarMeter value={signalBarsFor(down)} color="var(--status-good)" />
      </div>
      <SplitBar label="Download and upload" down={down} up={up} max={280} />
    </div>
  )
}

/** Actions: the button runs a test, spins while it does, then is ready again. */
const ACTION_BEATS = ['rest', 'run', 'rest', 'refresh', 'rest', 'link'] as const

function ActionsScene(): JSX.Element {
  // One thing at a time: the test runs, the refresh, then the link under the pointer.
  const step = ACTION_BEATS[useStep(ACTION_BEATS.length, BEAT)]
  return (
    // One row across the wide cell: the main action, its icon button, then the link.
    <div className="intro-row is-actions">
      <Button variant="solid" icon={PlayIcon} isLoading={step === 'run'} loadingLabel="Testing…">
        Run test
      </Button>
      <IconButton label="Refresh" icon={RefreshIcon} isLoading={step === 'refresh'} onClick={noop} />
      {/* Hover can't be set from code, so the scene adds the look Link gives on hover. */}
      <Link icon={HistoryIcon} onClick={noop} className={`intro-link ${step === 'link' ? 'is-hovered' : ''}`}>
        View history
      </Link>
    </div>
  )
}

/**
 * Inputs: the app's own: the Add service dialog's Address field, typed into and
 * tested, and Settings' theme picker and its sound toggle.
 */
const TYPED = 'github.com'

// A beat each, one change at a time: type, test, Light, System, the toggle on,
// Dark again, the toggle off, the field cleared, then over.
const INPUT_BEATS = ['type', 'test', 'light', 'system', 'sound-on', 'dark', 'sound-off', 'clear'] as const

// Settings' THEME_OPTIONS (src/features/settings/SettingsView.tsx).
const THEMES = [
  { value: 'dark', label: 'Dark', icon: <MoonIcon size={15} className="shrink-0" /> },
  { value: 'light', label: 'Light', icon: <SunIcon size={15} className="shrink-0" /> },
  { value: 'system', label: 'System', icon: <ComputerIcon size={15} className="shrink-0" /> },
]

function InputsScene(): JSX.Element {
  // One clock in typing ticks, so the characters and the beats stay in step.
  const tick = useStep(INPUT_BEATS.length * TICKS_PER_BEAT, TYPE_BEAT)
  const beat = Math.floor(tick / TICKS_PER_BEAT)
  const at = (name: (typeof INPUT_BEATS)[number]): number => INPUT_BEATS.indexOf(name)
  let typed = TYPED.length
  if (beat === at('type')) typed = tick
  if (beat === at('clear')) typed = 0
  let theme = 'dark'
  if (beat >= at('light') && beat < at('system')) theme = 'light'
  if (beat >= at('system') && beat < at('dark')) theme = 'system'
  const isSoundOn = beat >= at('sound-on') && beat < at('sound-off')
  return (
    <div className="intro-form">
      <TextField
        label="Address"
        value={TYPED.slice(0, typed)}
        placeholder="example.com or 192.168.1.1"
        onChange={noop}
        action={
          <TextFieldAction onClick={noop} isLoading={beat === at('test')} loadingLabel="Testing">
            Test
          </TextFieldAction>
        }
      />
      <div className="intro-stack">
        <SegmentedControl label="Theme" value={theme} onChange={noop} options={THEMES} />
        <Toggle isChecked={isSoundOn} label="Theme switch sound" onChange={noop} />
      </div>
    </div>
  )
}

// The share dialog's QR code, as the dev mock draws it.
const QR_SVG = mockQrSvg()

// The library's own classes for the parts drawn in place: Tooltip's bubble
// (tooltip/Tooltip.tsx) and Dialog's layers, panel, sizer and header
// (dialog/Dialog.tsx), with their open and close animations. The real ones are
// modal and portal out of the page, which a looping scene can't be, so the
// scene sets the `data-open` / `data-closed` that Base UI would.
const BUBBLE = 'w-max px-10 py-8 rounded-sm bg-popover border border-line type-caption leading-hint text-secondary'
const LAYER =
  'absolute inset-0 data-open:animate-overlay-in data-closed:pointer-events-none data-closed:animate-overlay-out'
const PANEL =
  'w-full max-w-[340px] overflow-hidden rounded-lg border border-line bg-surface data-open:animate-dialog-in data-closed:animate-dialog-out'
const SIZER = 'overflow-hidden transition-[height] duration-(--duration-spring) ease-spring'
const HEADER = 'flex items-start justify-between gap-8 p-16'

/**
 * Overlays: the app's Share Wi‑Fi button, its tooltip, then the dialog it opens
 * over the scrim: generating its QR code, then easing open to show it, as the
 * real dialog's sizer does.
 */
/** Where the tooltip sits in the scene, in px from its top left. */
type TipPosition = { left: number; top: number }

function OverlaysScene(): JSX.Element {
  // A beat at rest, the tooltip, the dialog generating, the QR code for two, then closed.
  const step = useStep(6, BEAT)
  const isTooltipOpen = step === 1
  const isDialogOpen = step >= 2 && step <= 4
  const isQrReady = step >= 3
  const sceneRef = useRef<HTMLDivElement>(null)
  const [tipAt, setTipAt] = useState<TipPosition | null>(null)
  // Mounted from the first open, as DialogRoot mounts it, so it never plays its close on load.
  const [hasOpened, setHasOpened] = useState(false)
  if (isDialogOpen && !hasOpened) setHasOpened(true)
  const [content, setContent] = useState<HTMLDivElement | null>(null)
  const contentHeight = useContentHeight(content)
  const state = isDialogOpen ? { 'data-open': '' } : { 'data-closed': '' }

  // The tooltip opens under the real share button, wherever it's laid out.
  useLayoutEffect(() => {
    const scene = sceneRef.current
    const button = scene?.querySelector('button[aria-label="Share Wi‑Fi"]')
    if (!scene || !button) return undefined
    const place = (): void => {
      const from = scene.getBoundingClientRect()
      const at = button.getBoundingClientRect()
      setTipAt({ left: at.left - from.left + at.width / 2, top: at.bottom - from.top + 6 })
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(scene)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={sceneRef} className="intro-overlay">
      <div className="intro-overlay-page">
        <ShareWifiButton />
      </div>
      {tipAt && (
        <span
          className={`intro-tooltip ${BUBBLE} ${isTooltipOpen ? 'is-open' : ''}`}
          style={{ left: tipAt.left, top: tipAt.top }}
        >
          Share Wi‑Fi
        </span>
      )}
      {hasOpened && (
        <>
          <div className={`${LAYER} intro-overlay-layer bg-scrim`} {...state} />
          <div className={`${LAYER} intro-overlay-layer flex items-center justify-center p-20`} {...state}>
            <div className={`${PANEL} intro-overlay-dialog`} {...state}>
              <div className={SIZER} style={{ height: contentHeight ?? undefined }}>
                <div ref={setContent}>
                  <div className={HEADER}>
                    <div className="min-w-0">
                      <div className="type-title text-primary">Share Wi‑Fi</div>
                      <div className="type-body mt-4 text-secondary">Scan with a phone camera to join</div>
                    </div>
                    <IconButton
                      className="-mt-4 -mr-4 shrink-0 self-start"
                      variant="ghost"
                      label="Close"
                      icon={CloseIcon}
                      onClick={noop}
                    />
                  </div>
                  <div className="bg-base p-16">
                    {/* Centred as WifiShareDialog centres it, so the plate fits its code. */}
                    <div className="flex w-full flex-col items-center text-center">
                      {isQrReady ? (
                        <WifiQrCode svg={QR_SVG} alt="" />
                      ) : (
                        <div className="flex animate-fade-in flex-col items-center gap-12 py-16 text-center">
                          <Spinner />
                          <p className="type-body text-tertiary">Generating QR code…</p>
                        </div>
                      )}
                    </div>
                  </div>
                  {isQrReady && (
                    <div className="px-16 py-12">
                      <p className="type-heading animate-fade-in text-center leading-body wrap-anywhere text-primary">
                        {NETWORK.ssid}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/** Status and feedback: a page's loading state, in the Connection page's words, then the connection's badge as it changes. */
const STATES = [
  { tone: 'positive', label: 'Online' },
  { tone: 'warning', label: 'Slow' },
  { tone: 'negative', label: 'Offline' },
] as const

// Two beats loading, then a beat for each verdict.
const LOADING_BEATS = 2

function StatusScene(): JSX.Element {
  const step = useStep(LOADING_BEATS + STATES.length, BEAT)
  const isLoading = step < LOADING_BEATS
  const { tone, label } = itemAt(STATES, Math.max(0, step - LOADING_BEATS))
  return (
    // One cell, both states: they cross-fade without the stage changing size.
    <span className="intro-slot">
      <span className={`intro-arrive ${isLoading ? 'is-in' : ''}`}>
        <LoadingState label="Checking your connection…" />
      </span>
      <span className={`intro-arrive ${isLoading ? '' : 'is-in'}`}>
        {/* Keyed by verdict, so each new one rises in. */}
        <span key={label} className="intro-swap">
          {/* Live, the dot beats beside it; slow or offline, the badge says so alone. */}
          {tone === 'positive' && <StatusDot tone="positive" pulse="live" />}
          <Badge tone={tone}>{label}</Badge>
        </span>
      </span>
    </span>
  )
}

// Home's Wi‑Fi connection, as the dev mock (src/bridge/mock-network-api.ts) reports it.
const NETWORK: WifiNetworkInfo = {
  connectionType: 'wifi',
  interfaceName: 'en0',
  isConnected: true,
  ipAddress: '192.168.1.42',
  gateway: '192.168.1.1',
  macAddress: 'a4:c3:f0:1b:2d:9e',
  dns: ['192.168.1.1', '1.1.1.1'],
  ssid: 'Starlight_5G',
  signalStrength: 84,
  signalDbm: -47,
  channel: 149,
  frequency: 5745,
  channelWidthMhz: 80,
  security: 'WPA3',
  wifiStandard: 'Wi-Fi 6 (802.11ax)',
  linkSpeedMbps: 1200,
}

/**
 * Containers: Home's own connection card, built from its real parts as
 * ConnectionCard builds it, opening into its details and closing again.
 */
function ContainersScene(): JSX.Element {
  const isExpanded = useStep(4, BEAT) >= 2
  const titleId = useId()
  return (
    <Card as="div" aria-labelledby={titleId} className="intro-mini-card">
      <Collapsible isOpen={isExpanded} onOpenChange={noop} hasFocusFrame className="rounded-[inherit]">
        <ConnectionStrip info={NETWORK} titleId={titleId} isExpanded={isExpanded} />
        <CollapsiblePanel>
          <ConnectionDetailsPanel info={NETWORK} publicIp="203.0.113.57" isPublicIpLoading={false} />
        </CollapsiblePanel>
      </Collapsible>
    </Card>
  )
}

// Lucide's line icons, drawn as the library's are: seeing, the accessibility
// mark, and a voice, for the ways a page reaches someone.
const A11Y_MARKS = [
  {
    name: 'eye',
    paths: [
      'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0',
      'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
    ],
  },
  {
    name: 'accessibility',
    paths: [
      'M17 4a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z',
      'm18 19 1-7-6 1',
      'm5 8 3-3 5.5 3-2.36 3.5',
      'M4.24 14.5a5 5 0 0 0 6.88 6',
      'M13.76 17.5a5 5 0 0 0-6.88-6',
    ],
  },
  {
    name: 'speaker',
    paths: [
      'M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z',
      'M16 9a5 5 0 0 1 0 6',
      'M19.364 18.364a9 9 0 0 0 0-12.728',
    ],
  },
]

/** Accessibility: one mark on an accent tile, changing a beat at a time: seeing, the accessibility mark, a voice. */
function AccessibilityScene(): JSX.Element {
  const { name, paths } = itemAt(A11Y_MARKS, useStep(A11Y_MARKS.length, BEAT))
  return (
    <span className="intro-a11y-mark">
      {/* Keyed by mark, so each new one rises in. */}
      <svg
        key={name}
        className="intro-swap"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {paths.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    </span>
  )
}

/** A group's card: what's in it, its place in the grid, and a scene made of its own components. */
export const GROUPS: Record<string, { body: string; area: string; specimen: ReactNode }> = {
  Actions: { body: 'Buttons, links and menus.', area: 'actions', specimen: <ActionsScene /> },
  Inputs: { body: 'Text fields, toggles and segmented choices.', area: 'inputs', specimen: <InputsScene /> },
  Overlays: { body: 'Dialogs and tooltips, over the page.', area: 'overlays', specimen: <OverlaysScene /> },
  'Status and feedback': {
    body: 'Badges, loading, banners.',
    area: 'status',
    specimen: <StatusScene />,
  },
  'Data display': { body: 'Readouts, data rows, meters and bars.', area: 'data', specimen: <DataDisplayScene /> },
  Containers: { body: 'Cards, collapsibles and inline metadata.', area: 'containers', specimen: <ContainersScene /> },
  'App frame': {
    body: 'The title bar, the nav rail and page headers.',
    area: 'frame',
    specimen: <AppFrameScene />,
  },
  Accessibility: {
    body: 'For screen readers, unseen.',
    area: 'a11y',
    specimen: <AccessibilityScene />,
  },
}
