import type { TrafficType, TrafficUsageSummary } from '@/types'
import { useTrafficUsage } from '@/features/apps/hooks/useTrafficUsage'
import { useNavigation } from '@/app/hooks/useNavigation'
import { busiestTotal, totalBytes, transferLabel } from '@/features/apps/utils/transfer'
import {
  BellIcon,
  ClockIcon,
  ComputerIcon,
  ConnectionIcon,
  DatabaseIcon,
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
  NasIcon,
  PageHeader,
  PlayIcon,
  POLLING_DESCRIPTION,
  PulseIcon,
  ShareIcon,
  TerminalIcon,
} from '@/ui'
import { RestartAsAdminAction } from '@/features/apps/components/RestartAsAdminAction'
import { UsageList } from '@/features/apps/components/UsageList'
import { ByteTotal } from '@/features/apps/components/ByteTotal'
import { RowName } from '@/features/apps/components/RowName'
import { SplitBar } from '@/features/apps/components/SplitBar'
import { TransferFigures } from '@/features/apps/components/TransferFigures'

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
  const Icon = TRAFFIC_ICONS[type.id] ?? LayersIcon
  return (
    <li className="flex flex-col gap-8 px-(--card-body-padding) py-12">
      <div className="flex items-center justify-between gap-12">
        <RowName icon={<Icon size={15} className="shrink-0 text-tertiary" />} name={type.label} />
        <ByteTotal bytes={total} />
      </div>
      {/* Scaled against the busiest type. Sits just inside the glyph's left
          edge, like the Apps bar. */}
      <SplitBar
        down={type.rxBytes}
        up={type.txBytes}
        max={busiest}
        label={transferLabel(type)}
        className="ml-[3px]"
      />
      {/* The bar's label above already reads these figures out. The down arrow
          sits centred under the type glyph, echoing the Apps and Hosts views. */}
      <TransferFigures transfer={type} isDecorative />
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
