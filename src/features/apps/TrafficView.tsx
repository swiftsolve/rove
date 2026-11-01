import type { TrafficType, TrafficUsageSummary } from '@/types'
import { useTrafficUsage } from '@/features/apps/hooks/useTrafficUsage'
import { useNavigation } from '@/app/hooks/useNavigation'
import { formatBytes } from '@/lib/format'
import { busiestTotal, percentOf, totalBytes, transferLabel } from '@/features/apps/utils/transfer'
import {
  BellIcon,
  ClockIcon,
  ComputerIcon,
  ConnectionIcon,
  DatabaseIcon,
  DirectionIcon,
  DnsIcon,
  EmptyState,
  ErrorBanner,
  FileTransferIcon,
  GlobeIcon,
  HelpIcon,
  IconButton,
  LayersIcon,
  LoadingState,
  MailIcon,
  MessageIcon,
  MetricValue,
  NasIcon,
  PageHeader,
  PlayIcon,
  POLLING_DESCRIPTION,
  PulseIcon,
  ShareIcon,
  TerminalIcon,
} from '@/ui'
import { RestartAsAdminAction } from '@/features/apps/components/RestartAsAdminAction'
import { cva } from 'class-variance-authority'
import { UsageList } from '@/features/apps/components/UsageList'
import { ByteTotal } from '@/features/apps/components/ByteTotal'

/** One segment of a row's down/up bar, coloured by its series. Its width eases
 *  as the totals (and the busiest-type scale) change, so the bars glide in step
 *  with the count-up figures; the global reduced-motion rule neutralises it. */
const segVariants = cva('h-full transition-[width] duration-400 ease-out', {
  variants: {
    series: { down: 'bg-series-down', up: 'bg-series-up' },
  },
})

// Download/upload figures, right-aligned in a fixed-width box so the down and up
// columns line up across rows (matches the Apps and Hosts views).
const FIGURE = 'inline-flex items-center gap-[5px] text-xs text-tertiary'
const FIGURE_VALUE = 'num min-w-[46px] text-right'

const TRAFFIC_INFO_HINT =
  'Traffic by remote port, so :443 is HTTPS and :53 is DNS. TCP and connected UDP only; resets when Rove restarts.'

const TRAFFIC_EMPTY_HINT = 'Traffic appears here as your apps use the network.'

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
  busiest,
}: {
  type: TrafficType
  busiest: number
}): JSX.Element {
  const total = totalBytes(type)
  // Split the bar into down/up segments, each scaled against the busiest type so
  // the rows are comparable at a glance.
  const downPct = percentOf(type.rxBytes, busiest)
  const upPct = percentOf(type.txBytes, busiest)
  const Icon = TRAFFIC_ICONS[type.id] ?? LayersIcon
  return (
    <li className="flex flex-col gap-8 px-(--card-body-padding) py-12">
      <div className="flex items-center justify-between gap-12">
        <span className="inline-flex min-w-0 items-center gap-8">
          <Icon size={15} className="shrink-0 text-tertiary" />
          <span className="truncate text-sm text-primary" title={type.label}>
            {type.label}
          </span>
        </span>
        <ByteTotal bytes={total} />
      </div>
      {/* One track, two segments side by side, each scaled against the busiest
          type so rows read comparably; an empty segment collapses to zero width.
          Sits just inside the glyph's left edge, like the Apps bar. */}
      <div
        className="ml-[3px] flex h-[3px] overflow-hidden rounded-xs bg-inset"
        role="img"
        aria-label={transferLabel(type)}
      >
        <span className={segVariants({ series: 'down' })} style={{ width: `${downPct}%` }} />
        <span className={segVariants({ series: 'up' })} style={{ width: `${upPct}%` }} />
      </div>
      {/* The bar's label above already reads these figures out. The down arrow
          sits centred under the type glyph, echoing the Apps and Hosts views. */}
      <div className="flex items-center gap-12" aria-hidden>
        <span className={FIGURE}>
          <DirectionIcon series="down" size={11} />
          <MetricValue value={type.rxBytes} className={FIGURE_VALUE} format={formatBytes} />
        </span>
        <span className={FIGURE}>
          <DirectionIcon series="up" size={11} />
          <MetricValue value={type.txBytes} className={FIGURE_VALUE} format={formatBytes} />
        </span>
      </div>
    </li>
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
        isLocked
        title="Administrator access needed"
        description={TRAFFIC_UNSUPPORTED_HINT}
        actions={<RestartAsAdminAction />}
      />
    )
  }
  if (isFirstLoad) {
    return (
      <LoadingState label="Measuring traffic types…" />
    )
  }
  if (types.length === 0) {
    return <EmptyState title="No traffic yet" description={TRAFFIC_EMPTY_HINT} />
  }

  const busiest = busiestTotal(types)
  return (
    <UsageList label="Traffic types by usage">
      {types.map((type) => (
        <TrafficRow key={type.id} type={type} busiest={busiest} />
      ))}
    </UsageList>
  )
}

export function TrafficView(): JSX.Element {
  const { usage, isFirstLoad, error, reload } = useTrafficUsage()
  const { back } = useNavigation()
  return (
    <div className="page">
      <PageHeader
        title="Traffic types"
        description="Traffic by kind across every app, busiest first"
        status={isFirstLoad ? 'Loading…' : undefined}
        onBack={back}
        actions={
          <IconButton label="About traffic types" icon={HelpIcon} tooltip={TRAFFIC_INFO_HINT} />
        }
      />
      {error && <ErrorBanner title={error} description={POLLING_DESCRIPTION} onRetry={reload} />}

      <TrafficBody usage={usage} isFirstLoad={isFirstLoad} />
    </div>
  )
}
