import { type JSX, type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

import { mockQrSvg } from '../src/dev/mock-network-api'
import { ConnectionDetailsPanel } from '../src/features/connection/components/ConnectionDetailsPanel'
import { ConnectionStrip } from '../src/features/connection/components/ConnectionStrip'
import { ShareWifiButton } from '../src/features/connection/components/ShareWifiButton'
import type { NetworkInfo } from '../src/types'
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
  { label: 'Devices', icon: DevicesIcon },
  { label: 'Apps', icon: AppsIcon },
  { label: 'Services', icon: CloudIcon },
  { label: 'Timeline', icon: EventsIcon },
  { label: 'Interfaces', icon: LayersIcon },
  { label: 'Connection', icon: ConnectionIcon },
  { label: 'Usage', icon: UsageIcon },
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
  const { tab: activeTab, verdict } = FRAME_BEATS[useStep(FRAME_BEATS.length, BEAT)]
  const { tone, label } = verdict
  return (
    <div className="intro-window">
      <TitleBar
        brand={
          <>
            <span className="inline-flex shrink-0 items-center justify-center text-accent" aria-hidden>
              <BrandIcon size={22} />
            </span>
            <span className="type-heading-large leading-body-default text-primary">Rove</span>
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

function DataDisplayScene(): JSX.Element {
  // One reading a beat: download, then upload, in turn.
  const step = useStep(DOWNLOADS.length * 2, BEAT)
  const down = useCountUp(DOWNLOADS[Math.floor((step + 1) / 2) % DOWNLOADS.length])
  const up = useCountUp(UPLOADS[Math.floor(step / 2) % UPLOADS.length])
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
        <BarMeter value={down > 215 ? 4 : down > 175 ? 3 : 2} color="var(--status-good)" />
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
  const typed = beat === at('type') ? tick : beat === at('clear') ? 0 : TYPED.length
  const theme =
    beat >= at('light') && beat < at('system') ? 'light' : beat >= at('system') && beat < at('dark') ? 'system' : 'dark'
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
const QR_SRC = `data:image/svg+xml,${encodeURIComponent(mockQrSvg())}`

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
function OverlaysScene(): JSX.Element {
  // A beat at rest, the tooltip, the dialog generating, the QR code for two, then closed.
  const step = useStep(6, BEAT)
  const isTooltipOpen = step === 1
  const isDialogOpen = step >= 2 && step <= 4
  const isQrReady = step >= 3
  const sceneRef = useRef<HTMLDivElement>(null)
  const [tipAt, setTipAt] = useState<{ left: number; top: number } | null>(null)
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
                      <div className="type-heading-medium text-primary">Share Wi‑Fi</div>
                      <div className="mt-4 type-body-small text-secondary">Scan with a phone camera to join</div>
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
                    {isQrReady ? (
                      <div className="flex animate-fade-in justify-center rounded-lg border border-line bg-[#ffffff] p-16">
                        <img className="block size-[240px]" src={QR_SRC} alt="" width={240} height={240} />
                      </div>
                    ) : (
                      <div className="flex animate-fade-in flex-col items-center gap-12 py-16 text-center">
                        <Spinner />
                        <p className="type-body-small text-tertiary">Generating QR code…</p>
                      </div>
                    )}
                  </div>
                  {isQrReady && (
                    <div className="px-16 py-12">
                      <p className="animate-fade-in text-center type-heading-small leading-body-default text-primary wrap-anywhere">
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
  const { tone, label } = STATES[Math.max(0, step - LOADING_BEATS)]
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

// Home's Wi‑Fi connection, as the dev mock (src/dev/mock-network-api.ts) reports it.
const NETWORK: NetworkInfo = {
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

/** Accessibility: the accessibility mark on an accent tile, as the Principles cards draw their icons. */
function AccessibilityScene(): JSX.Element {
  return (
    <span className="intro-a11y-mark">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M17 4a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" />
        <path d="m18 19 1-7-6 1" />
        <path d="m5 8 3-3 5.5 3-2.36 3.5" />
        <path d="M4.24 14.5a5 5 0 0 0 6.88 6" />
        <path d="M13.76 17.5a5 5 0 0 0-6.88-6" />
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
