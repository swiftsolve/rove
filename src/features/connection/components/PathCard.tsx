import { cva } from 'class-variance-authority'
import { type CSSProperties, Fragment, type ReactNode, useState } from 'react'

import { UpdatedAgo } from '@/app/components/UpdatedAgo'
import { useInternetStatus } from '@/app/hooks/useInternetStatus'
import { useNavigation } from '@/app/hooks/useNavigation'
import { useNetwork } from '@/app/hooks/useNetwork'
import { GLINT_HIDDEN_POSITION, useLineGlint } from '@/features/connection/hooks/useLineGlint'
import { type InternetLinkState, internetLinkState, lastTestOnNetwork } from '@/features/connection/utils/path'
import { SignalMeter } from '@/features/current-network/components/SignalMeter'
import { formatLinkSpeed } from '@/features/current-network/utils/connection-display'
import { useDevices } from '@/features/devices/hooks/useDevices'
import { useElementWidth } from '@/features/live-throughput/hooks/useElementWidth'
import { useSpeedHistory } from '@/features/speed/hooks/useSpeedHistory'
import { useSpeedTest } from '@/features/speed/hooks/useSpeedTest'
import { useChangeCount } from '@/hooks/useChangeCount'
import type { NetworkDiagnostics, NetworkInfo, SpeedHistoryEntry, WifiNetworkInfo } from '@/types'
import { isWifiNetwork } from '@/types'
import {
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  ComputerIcon,
  DirectionIcon,
  GlobeIcon,
  HistoryIcon,
  IconTile,
  InlineMeta,
  Link,
  PathIcon,
  RouterIcon,
  type SpeedSeries,
} from '@/ui'
import { formatBand, splitSpeedMbps } from '@/utils/format'

// The two ends are the accent: the computer Rove runs on, as on the Devices
// tab, and the internet it measures. The router between them takes the
// network colour.
const COMPUTER_COLOR = 'var(--accent-default)'
const ROUTER_COLOR = 'var(--device-network)'
const INTERNET_COLOR = 'var(--accent-default)'

// A link's line says how it's doing: green when it works, the accent while a
// test runs on it, grey before it's known, red when it's down. Its box sets
// the colour, for the line and the glint over it.
const lineBoxVariants = cva('relative flex w-full', {
  variants: {
    tone: {
      working: 'text-status-positive',
      testing: 'text-accent',
      unknown: 'text-line',
      down: 'text-status-negative',
    },
  },
})

type LineTone = 'working' | 'testing' | 'unknown' | 'down'

// A change of state sweeps the new colour across from the computer.
const lineVariants = cva('h-px w-full overflow-visible', {
  variants: {
    isSweeping: { true: 'animate-line-sweep' },
  },
})

// When the card opens and when a check finishes, a soft highlight runs along
// the working lines, computer to internet, to show the path answered. Only a
// green line glints, so a link that's down, unknown or under test stays still.
const GLINTING_TONES: ReadonlySet<LineTone> = new Set(['working'])

// The line's own green, brighter: lighter and a touch more saturated in OKLCH,
// so the highlight stays green rather than washing toward white, with no glow.
// A webview without relative colours drops the rule, and the glint takes the
// line's colour: the sweep goes unseen, nothing else changes.
const GLINT_STYLE: CSSProperties = {
  color: 'oklch(from currentColor calc(l + 0.12) calc(c + 0.04) h)',
  maskImage: 'linear-gradient(90deg, transparent, black, transparent)',
  maskSize: '40% 100%',
  maskRepeat: 'no-repeat',
  maskPosition: GLINT_HIDDEN_POSITION,
}

// The second line's glint starts as the first one's head clears the router
// tile, about 70% into the first line's run plus the tile's width.
const GLINT_SECOND_LINE_DELAY_MS = 540

// Above and below each line, a row as tall as the caption, so both lines sit
// at the tiles' centre whatever the rows hold.
const CAPTION_ROW = 'type-caption flex h-16 items-center whitespace-nowrap text-primary'

// The caption itself, inside its row: it rises into place when a result lands.
const captionVariants = cva('flex items-center gap-2', {
  variants: {
    isEntering: { true: 'animate-fade-up' },
    // The second row trails the first, as the page's cards stagger in.
    isTrailing: { true: '[animation-delay:45ms]' },
  },
})

const columnVariants = cva('flex w-[120px] min-w-0 flex-col gap-4', {
  variants: {
    align: { start: 'items-start text-left', center: 'items-center text-center', end: 'items-end text-right' },
  },
})

const INTERNET_LINE_TONES: Record<InternetLinkState, LineTone> = {
  healthy: 'working',
  notTested: 'unknown',
  offline: 'down',
}

/**
 * Home's path to the internet as three nodes joined by two links: this
 * computer, the router, the internet. Wi‑Fi is a dotted line, a cable solid.
 * A link that's down turns red, and a link past it greys out.
 */
export function PathCard({
  diagnostics,
  isCheckRunning = false,
  isCheckFailing = false,
  finishedCheckCount = 0,
}: {
  diagnostics: NetworkDiagnostics | null
  /** A check is under way: opening on one, the card glints when it finishes instead. */
  isCheckRunning?: boolean
  /** The page's last check failed: the lines keep their colour but stop glinting. */
  isCheckFailing?: boolean
  /** The page's finished checks: each one runs a glint, so a Refresh shows the path answered. */
  finishedCheckCount?: number
}) {
  const { info } = useNetwork()
  const { entries } = useSpeedHistory()
  const isTesting = useSpeedTest((test) => test.isTesting)
  // The Connection check names this computer's maker itself; a device scan
  // from Home or Devices fills in while that check is still running.
  const scannedSelfVendor = useDevices().lastScan?.devices.find((device) => device.isSelf)?.vendor ?? null
  const selfVendor = diagnostics?.selfVendor ?? scannedSelfVendor
  const lastTest = lastTestOnNetwork(entries, info)
  // The app-wide heartbeat, the same verdict the title bar shows.
  const internetState = internetLinkState(useInternetStatus() ?? undefined, lastTest)
  const isConnected = info?.isConnected ?? false
  // Opening with a check under way would glint twice in a moment: on open,
  // then as the check lands. The check's glint alone shows the path answered.
  const [shouldGlintOnOpen] = useState(!isCheckRunning)
  // A speed test has its own flowing dashes, so the path holds still under it.
  const isGlintEnabled = !isCheckFailing && !isTesting

  return (
    <Card>
      <CardHeader title="Path" icon={<PathIcon size={15} />} />
      <CardBody>
        <p className="sr-only">{pathSummary(info, internetState, lastTest)}</p>
        <div className="flex flex-col gap-8" aria-hidden>
          <div className="flex items-center gap-2">
            <IconTile size="lg" color={COMPUTER_COLOR} icon={<ComputerIcon size={16} />} />
            <PathLink
              tone={isConnected ? 'working' : 'down'}
              isDotted={info != null && isWifiNetwork(info)}
              glintCount={finishedCheckCount}
              shouldGlintOnOpen={shouldGlintOnOpen}
              isGlintEnabled={isGlintEnabled}
              above={isConnected ? info && formatLinkSpeed(info) : <span className="text-negative">Not connected</span>}
              below={info && isWifiNetwork(info) ? <WifiSignal info={info} /> : null}
            />
            <IconTile size="lg" color={ROUTER_COLOR} icon={<RouterIcon size={16} />} />
            {/* While a test runs, its dashes flow outward until the result lands. */}
            <PathLink
              tone={internetLineTone(isConnected, isTesting, internetState)}
              isFlowing={isConnected && isTesting}
              glintCount={finishedCheckCount}
              shouldGlintOnOpen={shouldGlintOnOpen}
              isGlintEnabled={isGlintEnabled}
              glintDelayMs={GLINT_SECOND_LINE_DELAY_MS}
              captionKey={internetCaptionKey(isConnected, isTesting, internetState, lastTest)}
              above={isConnected ? internetLineCaption(isTesting, internetState, lastTest) : null}
              below={
                isConnected && !isTesting && internetState === 'healthy' && lastTest ? (
                  <Rate series="up" mbps={lastTest.uploadMbps} pairedMbps={lastTest.downloadMbps} />
                ) : null
              }
            />
            <IconTile size="lg" color={INTERNET_COLOR} icon={<GlobeIcon size={16} />} />
          </div>
          <div className="flex items-start justify-between gap-8">
            <Node align="start" name="Computer" detail={selfVendor} />
            <Node align="center" name="Router" detail={diagnostics?.gatewayVendor ?? null} />
            <Node align="end" name="Internet" detail={diagnostics?.isp?.name ?? null} />
          </div>
        </div>
      </CardBody>
      <CardFooter>
        <div className="type-caption flex items-center justify-between gap-12">
          {isConnected && <FooterStatus isTesting={isTesting} lastTest={lastTest} />}
          <SpeedTestLink />
        </div>
      </CardFooter>
    </Card>
  )
}

function PathLink({
  tone,
  isDotted = false,
  isFlowing = false,
  captionKey = null,
  glintCount = 0,
  shouldGlintOnOpen = false,
  isGlintEnabled = true,
  glintDelayMs = 0,
  above,
  below,
}: {
  tone: LineTone
  isDotted?: boolean
  /** Dashes flowing outward: work under way on this link. */
  isFlowing?: boolean
  /** What the captions show; a change after mount fades them up. */
  captionKey?: string | null
  /** Each rise runs one glint along a green line. */
  glintCount?: number
  /** A green line glints as the card opens, too. */
  shouldGlintOnOpen?: boolean
  isGlintEnabled?: boolean
  /** How long the glint waits, so the second line's follows the first's. */
  glintDelayMs?: number
  above: ReactNode
  below: ReactNode
}) {
  // Each keyed element is its wrapper's only child, so it remounts on a change
  // and replays its animation, and no two keys ever share a parent. Not on the
  // first render, so opening the page stays still.
  const toneChanges = useChangeCount(tone)
  const captionChanges = useChangeCount(captionKey)
  const isEntering = captionChanges > 0
  const [lineElement, setLineElement] = useState<HTMLDivElement | null>(null)
  const lineWidth = useElementWidth(lineElement)
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-6">
      <div className={CAPTION_ROW}>
        <span key={captionChanges} className={captionVariants({ isEntering })}>
          {above}
        </span>
      </div>
      <div ref={setLineElement} className={lineBoxVariants({ tone })}>
        {/* The glint remounts with the line, so their flowing dashes start together. */}
        <Fragment key={toneChanges}>
          <svg className={lineVariants({ isSweeping: toneChanges > 0 })}>
            <LineStroke isFlowing={isFlowing} isDotted={isDotted} lineWidth={lineWidth} />
          </svg>
          {GLINTING_TONES.has(tone) && (
            <GlintLine
              glintCount={glintCount}
              delayMs={glintDelayMs}
              // A line that turned green on its own waits for the next check.
              shouldGlintOnMount={shouldGlintOnOpen && toneChanges === 0}
              isEnabled={isGlintEnabled}
            >
              <LineStroke isFlowing={isFlowing} isDotted={isDotted} lineWidth={lineWidth} />
            </GlintLine>
          )}
        </Fragment>
      </div>
      <div className={CAPTION_ROW}>
        <span key={captionChanges} className={captionVariants({ isEntering, isTrailing: isEntering })}>
          {below}
        </span>
      </div>
    </div>
  )
}

/**
 * The line drawn once: square 3px dashes for Wi‑Fi (1px dots smear to grey at
 * 1x), a solid line for a cable, and 2px dashes, one period of the flow,
 * while it flows.
 */
function LineStroke({
  isFlowing,
  isDotted,
  lineWidth,
}: {
  isFlowing: boolean
  isDotted: boolean
  lineWidth: number | null
}) {
  const isWifiDashes = isDotted && !isFlowing
  return (
    <line
      x1={isWifiDashes ? 0 : 0.5}
      y1="0.5"
      x2="100%"
      y2="0.5"
      stroke="currentColor"
      strokeWidth={1}
      strokeLinecap={isWifiDashes ? 'butt' : 'round'}
      strokeDasharray={lineDashes(isFlowing, isDotted, lineWidth)}
      className={isFlowing ? 'animate-line-flow' : undefined}
    />
  )
}

/** A copy of the line over it, shown only where the moving glint mask lets it through. */
function GlintLine({
  glintCount,
  delayMs,
  shouldGlintOnMount,
  isEnabled,
  children,
}: {
  glintCount: number
  delayMs: number
  shouldGlintOnMount: boolean
  isEnabled: boolean
  children: ReactNode
}) {
  const [glintLine, setGlintLine] = useState<SVGSVGElement | null>(null)
  useLineGlint({ glintLine, glintCount, delayMs, shouldGlintOnMount, isEnabled })
  return (
    <svg ref={setGlintLine} className="absolute inset-0 h-px w-full overflow-visible" style={GLINT_STYLE}>
      {children}
    </svg>
  )
}

// Wi‑Fi's dashes: 3px on, about 3px off.
const WIFI_DASH_PX = 3
const WIFI_GAP_PX = 3

/**
 * Wi‑Fi's dashes, spaced so the first and last touch the line's two ends, as
 * the solid line does: the width left past the last whole dash is shared
 * equally between the gaps. A plain 3 3 pattern stops wherever the width
 * leaves it, up to 6px short of the router; giving some gaps a whole extra
 * pixel instead shows as uneven spacing on a scaled display.
 */
function wifiDashes(lineWidth: number | null): string {
  if (lineWidth == null) return `${WIFI_DASH_PX} ${WIFI_GAP_PX}`
  const dashCount = Math.max(2, Math.floor((lineWidth + WIFI_GAP_PX) / (WIFI_DASH_PX + WIFI_GAP_PX)))
  const gapWidth = (lineWidth - dashCount * WIFI_DASH_PX) / (dashCount - 1)
  return `${WIFI_DASH_PX} ${gapWidth}`
}

function lineDashes(isFlowing: boolean, isDotted: boolean, lineWidth: number | null): string | undefined {
  if (isFlowing) return '2 4'
  if (isDotted) return wifiDashes(lineWidth)
  return undefined
}

function WifiSignal({ info }: { info: WifiNetworkInfo }) {
  const strength =
    info.signalStrength != null ? (
      <span className="inline-flex items-center gap-4">
        <SignalMeter strength={info.signalStrength} />
        {info.signalStrength}%
      </span>
    ) : null
  return <InlineMeta items={[strength, formatBand(info.frequency)]} />
}

// Off a router, nothing past it can be known: the internet line greys out
// rather than doubling the red of the link that actually failed.
function internetLineTone(isConnected: boolean, isTesting: boolean, state: InternetLinkState): LineTone {
  if (!isConnected) return 'unknown'
  if (isTesting) return 'testing'
  return INTERNET_LINE_TONES[state]
}

function internetCaptionKey(
  isConnected: boolean,
  isTesting: boolean,
  state: InternetLinkState,
  lastTest: SpeedHistoryEntry | null,
): string {
  if (!isConnected) return 'disconnected'
  if (isTesting) return 'testing'
  return `${state}-${lastTest?.timestamp ?? 0}`
}

function internetLineCaption(
  isTesting: boolean,
  state: InternetLinkState,
  lastTest: SpeedHistoryEntry | null,
): ReactNode {
  if (isTesting) return <span className="text-tertiary">Testing…</span>
  if (state === 'offline') return <span className="text-negative">No internet</span>
  if (state === 'notTested' || !lastTest) return <span className="text-tertiary">Not tested</span>
  return <Rate series="down" mbps={lastTest.downloadMbps} pairedMbps={lastTest.uploadMbps} />
}

/**
 * A test's rate in one direction, with its arrow. The text holds the width of
 * the wider of it and `pairedMbps`, the other direction's rate, so the down
 * and up rows centre alike: their arrows line up on the left, their units on
 * the right.
 */
function Rate({ series, mbps, pairedMbps }: { series: SpeedSeries; mbps: number; pairedMbps: number }) {
  return (
    <>
      <DirectionIcon series={series} size={13} />
      <span className="grid text-right num">
        <span className="col-start-1 row-start-1">{rateText(mbps)}</span>
        <span className="invisible col-start-1 row-start-1">{rateText(pairedMbps)}</span>
      </span>
    </>
  )
}

function rateText(mbps: number): string {
  const { value, unit } = splitSpeedMbps(mbps)
  return `${value} ${unit}`
}

function Node({ align, name, detail }: { align: 'start' | 'center' | 'end'; name: string; detail: string | null }) {
  return (
    <div className={columnVariants({ align })}>
      <span className="type-body-semibold text-primary">{name}</span>
      {detail && <span className="type-caption w-full truncate text-tertiary">{detail}</span>}
    </div>
  )
}

function FooterStatus({ isTesting, lastTest }: { isTesting: boolean; lastTest: SpeedHistoryEntry | null }) {
  const STATUS = 'inline-flex min-w-0 items-center gap-4 truncate text-tertiary'
  if (isTesting) return <span className={STATUS}>Testing…</span>
  if (!lastTest) return <span className={STATUS}>Not tested yet</span>
  return (
    <span className={STATUS}>
      <HistoryIcon size={13} />
      <UpdatedAgo timestamp={lastTest.timestamp} verb="Tested" />
    </span>
  )
}

function SpeedTestLink() {
  const { navigate } = useNavigation()
  return (
    // The pill's padding hangs over the footer's own, so the footer keeps its height.
    <Link className="-my-2 ml-auto" onClick={() => navigate({ tab: 'speed' })}>
      Speed test
    </Link>
  )
}

function localLinkSummary(info: NetworkInfo | null): string {
  if (!info?.isConnected) return 'Not connected to a router.'
  const medium = isWifiNetwork(info) ? 'Wi‑Fi' : 'Wired'
  const linkSpeed = formatLinkSpeed(info)
  if (!linkSpeed) return `${medium} to the router.`
  return `${medium} to the router at ${linkSpeed}.`
}

/** What the diagram shows, for screen readers, which skip the drawing. */
function pathSummary(
  info: NetworkInfo | null,
  internetState: InternetLinkState,
  lastTest: SpeedHistoryEntry | null,
): string {
  const localSummary = localLinkSummary(info)
  if (!info?.isConnected) return localSummary
  if (internetState === 'offline') return `${localSummary} No internet.`
  if (internetState === 'notTested' || !lastTest) return `${localSummary} Internet speed not tested yet.`
  const down = splitSpeedMbps(lastTest.downloadMbps)
  const up = splitSpeedMbps(lastTest.uploadMbps)
  return `${localSummary} Internet at ${down.value} ${down.unit} down and ${up.value} ${up.unit} up.`
}
