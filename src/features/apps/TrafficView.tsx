import type { TrafficType, TrafficUsageSummary } from '@/types'
import { useAppData } from '@/app/hooks/useAppData'
import { useNavigation } from '@/app/hooks/useNavigation'
import { formatBytes } from '@/lib/format'
import { Tooltip as UiTooltip } from '@/components/Tooltip'
import { Subpage } from '@/components/Subpage'
import { MetricValue } from '@/components/MetricValue'
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
} from '@/components/icons/Icons'
import { DirectionIcon } from '@/components/icons/DirectionIcon'
import { EmptyState } from '@/components/EmptyState'
import { RestartAsAdminAction } from '@/components/RestartAsAdminAction'
import { Spinner } from '@/components/Spinner'
import { cva } from 'class-variance-authority'
import { cx } from '@/lib/cx'
import { IconButton } from '@/components/IconButton'
import styles from './TrafficView.module.css'

/** One segment of a row's down/up bar, coloured by its series. */
const segVariants = cva(styles.seg, {
  variants: {
    series: { down: styles.seriesDown, up: styles.seriesUp },
  },
})

const TRAFFIC_INFO_HINT =
  'Your session’s traffic grouped by kind — the connection’s remote port ' +
  'names the service, so :443 is HTTPS, :53 is DNS, and so on. It’s the same ' +
  'traffic the Hosts view meters (TCP and connected UDP/QUIC), just bucketed by ' +
  'protocol instead of by host, and it resets when Rove restarts. Local ' +
  'broadcast chatter (mDNS, SSDP) isn’t counted — it has no remote host.'

const TRAFFIC_EMPTY_HINT = 'Traffic appears here as your apps send and receive.'

const TRAFFIC_UNSUPPORTED_HINT =
  'Run Rove as administrator to break traffic down by protocol on Windows.'

interface IconProps {
  size?: number
  className?: string
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
function TrafficRow({
  type,
  busiestTotal,
}: {
  type: TrafficType
  busiestTotal: number
}): JSX.Element {
  const total = type.rxBytes + type.txBytes
  // Split the bar into down/up segments, each scaled against the busiest type so
  // the rows are comparable at a glance. Guard the divide for the all-zero case.
  const scale = busiestTotal > 0 ? 100 / busiestTotal : 0
  const downPct = type.rxBytes * scale
  const upPct = type.txBytes * scale
  const Icon = TRAFFIC_ICONS[type.id] ?? LayersIcon
  return (
    <div className={styles.row}>
      <div className={styles.main}>
        <span className={styles.id}>
          <Icon size={15} className={styles.glyph} />
          <span className={styles.name} title={type.label}>
            {type.label}
          </span>
        </span>
        <MetricValue value={total} className={cx(styles.total, 'num')} format={formatBytes} />
      </div>
      <div
        className={styles.bar}
        role="img"
        aria-label={`${formatBytes(type.rxBytes)} down, ${formatBytes(type.txBytes)} up`}
      >
        <span className={segVariants({ series: 'down' })} style={{ width: `${downPct}%` }} />
        <span className={segVariants({ series: 'up' })} style={{ width: `${upPct}%` }} />
      </div>
      <div className={styles.figures}>
        <span className={styles.figure}>
          <DirectionIcon series="down" size={11} />
          <MetricValue value={type.rxBytes} className="num" format={formatBytes} />
        </span>
        <span className={styles.figure}>
          <DirectionIcon series="up" size={11} />
          <MetricValue value={type.txBytes} className="num" format={formatBytes} />
        </span>
      </div>
    </div>
  )
}

/** The page body: the admin prompt, a first-load spinner, an empty state, or
 *  the list of traffic types. */
function TrafficBody({
  usage,
  isFirstLoad,
}: {
  usage: TrafficUsageSummary
  isFirstLoad: boolean
}): JSX.Element {
  const { types, support } = usage
  if (support === 'unsupported') {
    return (
      <EmptyState
        icon={InfoIcon}
        title="Administrator access needed"
        hint={TRAFFIC_UNSUPPORTED_HINT}
        action={<RestartAsAdminAction />}
      />
    )
  }
  if (isFirstLoad) {
    return (
      <div className="view-empty">
        <Spinner />
        <p className="text-muted">Measuring traffic types…</p>
      </div>
    )
  }
  if (types.length === 0) {
    return <EmptyState icon={LayersIcon} title="No traffic yet" hint={TRAFFIC_EMPTY_HINT} />
  }

  const busiestTotal = types.reduce((max, type) => Math.max(max, type.rxBytes + type.txBytes), 0)
  return (
    <div className="ui-section">
      <div className={cx('ui-section-body', styles.list)}>
        {types.map((type) => (
          <TrafficRow key={type.id} type={type} busiestTotal={busiestTotal} />
        ))}
      </div>
    </div>
  )
}

export function TrafficView(): JSX.Element {
  const { usage, isLoading, error } = useAppData().screens.trafficUsage
  const { back } = useNavigation()
  const isFirstLoad = isLoading && usage.types.length === 0
  const subtitle = isFirstLoad ? 'Loading…' : 'Traffic by kind across every app, busiest first'

  return (
    <Subpage
      title="Traffic types"
      description={subtitle}
      onBack={back}
      action={
        <UiTooltip content={TRAFFIC_INFO_HINT}>
          <IconButton
            aria-label="About traffic types"
          >
            <HelpIcon size={16} />
          </IconButton>
        </UiTooltip>
      }
    >
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      <TrafficBody usage={usage} isFirstLoad={isFirstLoad} />
    </Subpage>
  )
}
