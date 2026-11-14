import {
  BellIcon,
  ClockIcon,
  ComputerIcon,
  ConnectionIcon,
  DatabaseIcon,
  DnsIcon,
  FileTransferIcon,
  GlobeIcon,
  type IconComponent,
  LayersIcon,
  MailIcon,
  MessageIcon,
  NasIcon,
  PlayIcon,
  PulseIcon,
  ShareIcon,
  TerminalIcon,
} from '@swiftsolve/rove-ui'

import type { TrafficType } from '@/types'

/** Anything unmapped (including "other") falls back to the layers icon, so a new backend bucket never renders blank. */
const TRAFFIC_ICONS: Record<string, IconComponent> = {
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

/** A traffic type's line icon, in the row's icon slot. */
export function TrafficIcon({ type }: { type: TrafficType }) {
  const Icon = TRAFFIC_ICONS[type.id] ?? LayersIcon
  return <Icon size={15} className="shrink-0 text-tertiary" />
}
