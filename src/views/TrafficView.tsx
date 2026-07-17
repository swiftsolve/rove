import type { TrafficType, TrafficUsageSummary } from '@/types'
import { formatBytes } from '@/lib/format'
import { Tooltip as UiTooltip } from '@/components/ui/Tooltip'
import Subpage from '@/components/ui/Subpage'
import { MetricValue } from '@/components/ui/MetricValue'
import {
  BellIcon,
  ClockIcon,
  ComputerIcon,
  ConnectionIcon,
  DatabaseIcon,
  DnsIcon,
  FileTransferIcon,
  GlobeIcon,
  HelpIcon,
  InfoIcon,
  LayersIcon,
  MailIcon,
  MessageIcon,
  NasIcon,
  PlayIcon,
  PulseIcon,
  ShareIcon,
  TerminalIcon,
} from '@/components/ui/Icons'
import DirectionIcon from '@/components/ui/DirectionIcon'
import { EmptyState } from '@/components/ui/EmptyState'
import { RestartAsAdminAction } from '@/components/ui/RestartAsAdminAction'
import { Spinner } from '@/components/ui/Spinner'
import './TrafficView.css'

const TRAFFIC_INFO_HINT =
  'Your session’s traffic grouped by kind — the connection’s remote port ' +
  'names the service, so :443 is HTTPS, :53 is DNS, and so on. It’s the same ' +
  'traffic the Hosts view meters (TCP and connected UDP/QUIC), just bucketed by ' +
  'protocol instead of by host, and it resets when Rove restarts. Local ' +
  'broadcast chatter (mDNS, SSDP) isn’t counted — it has no remote host.'

const TRAFFIC_EMPTY_HINT =
  'Traffic types appear here as your apps send and receive. Totals are gathered ' +
  'while Rove runs.'

const TRAFFIC_UNSUPPORTED_HINT =
  'On Windows, grouping traffic by protocol uses a network event-tracing ' +
  'session that needs administrator rights — run Rove as administrator to enable ' +
  'the Traffic Types view. It works without elevation on Linux and macOS.'

interface IconProps {
  readonly size?: number
  readonly className?: string
}

/** Glyph per traffic-type slug. Anything unmapped (including "other") falls back
 *  to the layers glyph, so a new backend bucket never renders blank. */
const TRAFFIC_ICONS: Record<string, (props: IconProps) => JSX.Element> = {
  https: GlobeIcon,
  http: GlobeIcon,
  dns: DnsIcon,
  ssh: TerminalIcon,
  ftp: FileTransferIcon,
  email: MailIcon,
  ntp: ClockIcon,
  stun: PulseIcon,
  push: BellIcon,
  database: DatabaseIcon,
  vpn: ConnectionIcon,
  media: PlayIcon,
  remote: ComputerIcon,
  fileshare: NasIcon,
  p2p: ShareIcon,
  messaging: MessageIcon,
}

/** One traffic-type row: glyph + name + total on the main line, then a
 *  proportional down/up bar and the byte figures beneath — the same visual
 *  language as an Apps row, minus the icon-fetch and the navigation caret (these
 *  rows aren't links). */
function TrafficRow({ type, max }: { readonly type: TrafficType; readonly max: number }): JSX.Element {
  const total = type.rxBytes + type.txBytes
  // Split the bar into down/up segments, each scaled against the busiest type so
  // the rows are comparable at a glance. Guard the divide for the all-zero case.
  const scale = max > 0 ? 100 / max : 0
  const downPct = type.rxBytes * scale
  const upPct = type.txBytes * scale
  const Icon = TRAFFIC_ICONS[type.id] ?? LayersIcon
  return (
    <div className="traffic-row">
      <div className="traffic-row-main">
        <span className="traffic-row-id">
          <Icon size={15} className="traffic-row-glyph" />
          <span className="traffic-row-name" title={type.label}>
            {type.label}
          </span>
        </span>
        <MetricValue value={total} level="traffic-row-total num" format={formatBytes} />
      </div>
      <div
        className="traffic-row-bar"
        role="img"
        aria-label={`${formatBytes(type.rxBytes)} down, ${formatBytes(type.txBytes)} up`}
      >
        <span className="traffic-row-seg traffic-row-seg--down" style={{ width: `${downPct}%` }} />
        <span className="traffic-row-seg traffic-row-seg--up" style={{ width: `${upPct}%` }} />
      </div>
      <div className="traffic-row-figures">
        <span className="traffic-row-figure">
          <DirectionIcon series="down" size={11} />
          <MetricValue value={type.rxBytes} level="num" format={formatBytes} />
        </span>
        <span className="traffic-row-figure">
          <DirectionIcon series="up" size={11} />
          <MetricValue value={type.txBytes} level="num" format={formatBytes} />
        </span>
      </div>
    </div>
  )
}

interface TrafficViewProps {
  readonly usage: TrafficUsageSummary
  readonly isLoading: boolean
  readonly error?: string | null
  /** Return to the Apps list (the subpage's Back button). */
  readonly onBack: () => void
}

export default function TrafficView({
  usage,
  isLoading,
  error,
  onBack,
}: TrafficViewProps): JSX.Element {
  const { types, support } = usage
  const hasData = types.length > 0
  const max = types.reduce((m, t) => Math.max(m, t.rxBytes + t.txBytes), 0)

  const subtitle =
    isLoading && !hasData ? 'Loading…' : 'Traffic by kind across every app, busiest first'

  return (
    <Subpage
      title="Traffic types"
      description={subtitle}
      onBack={onBack}
      action={
        <UiTooltip content={TRAFFIC_INFO_HINT}>
          <button
            type="button"
            className="btn-icon btn-icon-secondary"
            aria-label="About traffic types"
          >
            <HelpIcon size={16} />
          </button>
        </UiTooltip>
      }
    >
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      {support === 'unsupported' ? (
        <EmptyState
          icon={InfoIcon}
          title="Traffic types aren’t available"
          hint={TRAFFIC_UNSUPPORTED_HINT}
          action={<RestartAsAdminAction />}
        />
      ) : isLoading && !hasData ? (
        <div className="view-empty">
          <Spinner />
          <p className="text-muted">Measuring traffic types…</p>
        </div>
      ) : !hasData ? (
        <EmptyState icon={LayersIcon} title="No traffic yet" hint={TRAFFIC_EMPTY_HINT} />
      ) : (
        <div className="ui-section">
          <div className="ui-section-body traffic-list">
            {types.map((type) => (
              <TrafficRow key={type.id} type={type} max={max} />
            ))}
          </div>
        </div>
      )}
    </Subpage>
  )
}
