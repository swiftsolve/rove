import { cva } from 'class-variance-authority'
import type { ReactNode } from 'react'

import { UpdatedAgo } from '@/app/components/UpdatedAgo'
import { useInternetStatus } from '@/app/hooks/useInternetStatus'
import { useNavigation } from '@/app/hooks/useNavigation'
import { useNetwork } from '@/app/hooks/useNetwork'
import { SignalMeter } from '@/features/connection/components/SignalMeter'
import { formatLinkSpeed } from '@/features/connection/utils/connection-display'
import { useDevices } from '@/features/devices/hooks/useDevices'
import { type InternetLinkState, internetLinkState, lastTestOnNetwork } from '@/features/diagnostics/utils/path'
import { useSpeedHistory } from '@/features/speed/hooks/useSpeedHistory'
import { useSpeedTest } from '@/features/speed/hooks/useSpeedTest'
import { useChangeCount } from '@/hooks/useChangeCount'
import type { NetworkDiagnostics, NetworkInfo, SpeedHistoryEntry } from '@/types'
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

// The accent marks what's yours: the three ends of the path, and a link that works.
const NODE_COLOR = 'var(--accent-default)'

// A link's line: the accent when it works, grey before it's known, red when
// it's down. A change of state sweeps the new colour across from the computer.
const lineVariants = cva('h-px w-full overflow-visible', {
  variants: {
    tone: { working: 'text-accent', unknown: 'text-line', down: 'text-status-negative' },
    isSweeping: { true: 'animate-line-sweep' },
  },
})

type LineTone = 'working' | 'unknown' | 'down'

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

const INTERNET_LINE: Record<InternetLinkState, LineTone> = { healthy: 'working', notTested: 'unknown', offline: 'down' }

/**
 * Home's path to the internet as three nodes joined by two links: this
 * computer, the router, the internet. Wi‑Fi is a dotted line, a cable solid.
 * A link that's down turns red.
 */
export function PathCard({ diagnostics }: { diagnostics: NetworkDiagnostics | null }) {
  const { info } = useNetwork()
  const { entries } = useSpeedHistory()
  const isTesting = useSpeedTest((test) => test.isTesting)
  const selfVendor = useDevices().lastScan?.devices.find((device) => device.isSelf)?.vendor ?? null
  const lastTest = lastTestOnNetwork(entries, info)
  // The app-wide heartbeat, the same verdict the title bar shows.
  const internet = internetLinkState(useInternetStatus() ?? undefined, lastTest)
  const isConnected = info?.isConnected ?? false

  return (
    <Card>
      <CardHeader title="Path" icon={<PathIcon size={15} />} />
      <CardBody>
        <p className="sr-only">{pathSummary(info, internet, lastTest)}</p>
        <div className="flex flex-col gap-8" aria-hidden>
          <div className="flex items-center gap-2">
            <IconTile size="lg" color={NODE_COLOR} icon={<ComputerIcon size={16} />} />
            <PathLink
              tone={isConnected ? 'working' : 'down'}
              isDotted={info != null && isWifiNetwork(info)}
              above={isConnected ? info && formatLinkSpeed(info) : <span className="text-negative">Not connected</span>}
              below={info && isWifiNetwork(info) ? <WifiSignal info={info} /> : null}
            />
            <IconTile size="lg" color={NODE_COLOR} icon={<RouterIcon size={16} />} />
            {/* While a test runs, its dashes flow outward until the result lands. */}
            <PathLink
              tone={isTesting ? 'working' : INTERNET_LINE[internet]}
              isFlowing={isTesting}
              captionKey={isTesting ? 'testing' : `${internet}-${lastTest?.timestamp ?? 0}`}
              above={isTesting ? <span className="text-tertiary">Testing…</span> : internetAbove(internet, lastTest)}
              below={
                !isTesting && internet === 'healthy' && lastTest ? (
                  <Rate series="up" mbps={lastTest.uploadMbps} />
                ) : null
              }
            />
            <IconTile size="lg" color={NODE_COLOR} icon={<GlobeIcon size={16} />} />
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
          <FooterStatus isTesting={isTesting} lastTest={lastTest} />
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
  above,
  below,
}: {
  tone: LineTone
  isDotted?: boolean
  /** Dashes flowing outward: work under way on this link. */
  isFlowing?: boolean
  /** What the captions show; a change after mount fades them up. */
  captionKey?: string | null
  above: ReactNode
  below: ReactNode
}) {
  // Each keyed element is its wrapper's only child, so it remounts on a change
  // and replays its animation, and no two keys ever share a parent. Not on the
  // first render, so opening the page stays still.
  const changes = useChangeCount(tone)
  const results = useChangeCount(captionKey)
  const isEntering = results > 0
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-6">
      <div className={CAPTION_ROW}>
        <span key={results} className={captionVariants({ isEntering })}>
          {above}
        </span>
      </div>
      <div className="flex w-full">
        <svg key={changes} className={lineVariants({ tone, isSweeping: changes > 0 })}>
          {/* Round 1px dots 4px apart for Wi‑Fi, a solid line for a cable, and
            2px dashes, one period of the flow, while it flows. */}
          <line
            x1="0.5"
            y1="0.5"
            x2="100%"
            y2="0.5"
            stroke="currentColor"
            // Dots carry less ink than a solid line, and at 1x a 1px dot smears
            // across two pixel rows, so they're a touch heavier.
            strokeWidth={isDotted && !isFlowing ? 1.5 : 1}
            strokeLinecap="round"
            strokeDasharray={isFlowing ? '2 4' : isDotted ? '0.01 4' : undefined}
            className={isFlowing ? 'animate-line-flow' : undefined}
          />
        </svg>
      </div>
      <div className={CAPTION_ROW}>
        <span key={results} className={captionVariants({ isEntering, isTrailing: isEntering })}>
          {below}
        </span>
      </div>
    </div>
  )
}

function WifiSignal({ info }: { info: Extract<NetworkInfo, { connectionType: 'wifi' }> }) {
  const strength =
    info.signalStrength != null ? (
      <span className="inline-flex items-center gap-4">
        <SignalMeter strength={info.signalStrength} />
        {info.signalStrength}%
      </span>
    ) : null
  return <InlineMeta items={[strength, formatBand(info.frequency)]} />
}

function internetAbove(state: InternetLinkState, lastTest: SpeedHistoryEntry | null): ReactNode {
  if (state === 'offline') return <span className="text-negative">No internet</span>
  if (state === 'notTested' || !lastTest) return <span className="text-tertiary">Not tested</span>
  return <Rate series="down" mbps={lastTest.downloadMbps} />
}

function Rate({ series, mbps }: { series: SpeedSeries; mbps: number }) {
  const { value, unit } = splitSpeedMbps(mbps)
  return (
    <>
      <DirectionIcon series={series} size={13} />
      {value} {unit}
    </>
  )
}

function Node({ align, name, detail }: { align: 'start' | 'center' | 'end'; name: string; detail: string | null }) {
  return (
    <div className={columnVariants({ align })}>
      <span className="type-label-default text-primary">{name}</span>
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

/** What the diagram shows, for screen readers, which skip the drawing. */
function pathSummary(
  info: NetworkInfo | null,
  internet: InternetLinkState,
  lastTest: SpeedHistoryEntry | null,
): string {
  const linkSpeed = info ? formatLinkSpeed(info) : null
  const local = !info?.isConnected
    ? 'Not connected to a router.'
    : `${isWifiNetwork(info) ? 'Wi‑Fi' : 'Wired'} to the router${linkSpeed ? ` at ${linkSpeed}` : ''}.`
  if (internet === 'offline') return `${local} No internet.`
  if (internet === 'notTested' || !lastTest) return `${local} Internet speed not tested yet.`
  const down = splitSpeedMbps(lastTest.downloadMbps)
  const up = splitSpeedMbps(lastTest.uploadMbps)
  return `${local} Internet at ${down.value} ${down.unit} down and ${up.value} ${up.unit} up.`
}
