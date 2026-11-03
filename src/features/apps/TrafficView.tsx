import type { JSX } from 'react'
import type { TrafficType } from '@/types'
import { useTrafficUsage } from '@/features/apps/hooks/useTrafficUsage'
import { useNavigation } from '@/app/hooks/useNavigation'
import { busiestTotal } from '@/features/apps/utils/transfer'
import {
  BellIcon,
  CardList,
  ClockIcon,
  ComputerIcon,
  ConnectionIcon,
  DatabaseIcon,
  DnsIcon,
  Banner,
  FileTransferIcon,
  GlobeIcon,
  HelpIcon,
  IconButton,
  LayersIcon,
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
import { UsageBody, type UsageBodyCopy } from '@/features/apps/components/UsageBody'
import { UsageRow } from '@/features/apps/components/UsageRow'

const TRAFFIC_INFO_HINT =
  'Traffic by remote port, so :443 is HTTPS and :53 is DNS. TCP and connected UDP only; resets when Rove restarts.'

const BODY_COPY: UsageBodyCopy = {
  unsupported: 'Run Rove as administrator to break traffic down by protocol on Windows.',
  loading: 'Measuring traffic types…',
  emptyTitle: 'No traffic yet',
  empty: 'Traffic appears here as your apps use the network.',
}

type IconProps = {
  size?: number
  className?: string
}

/** Icon per traffic-type slug. Anything unmapped (including "other") falls back
 *  to the layers icon, so a new backend bucket never renders blank. */
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

function TrafficIcon({ type }: { type: TrafficType }) {
  const Icon = TRAFFIC_ICONS[type.id] ?? LayersIcon
  return <Icon size={15} className="shrink-0 text-tertiary" />
}

export function TrafficView() {
  const { usage, isFirstLoad, error, reload } = useTrafficUsage()
  const { back } = useNavigation()
  const { types } = usage
  const busiest = busiestTotal(types)

  return (
    <div className="page">
      <PageHeader
        title="Traffic types"
        description="Traffic by kind across every app, busiest first"
        status={isFirstLoad ? 'Loading…' : undefined}
        onBack={back}
        actions={<IconButton label="About traffic types" icon={HelpIcon} tooltip={TRAFFIC_INFO_HINT} />}
      />
      {error && <Banner variant="error" title={error} description={POLLING_DESCRIPTION} onRetry={reload} />}

      <UsageBody support={usage.support} isFirstLoad={isFirstLoad} isEmpty={types.length === 0} copy={BODY_COPY}>
        <CardList label="Traffic types by usage">
          {/* The same rows as the Apps view's, minus the icon fetch and the caret:
              these aren't links. */}
          {types.map((type) => (
            <UsageRow
              key={type.id}
              icon={<TrafficIcon type={type} />}
              iconKind="line"
              name={type.label}
              transfer={type}
              busiest={busiest}
            />
          ))}
        </CardList>
      </UsageBody>
    </div>
  )
}
