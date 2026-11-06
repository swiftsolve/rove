import type { ReactNode } from 'react'

import { SecurityBadge } from '@/features/connection/components/SecurityBadge'
import { SignalMeter } from '@/features/connection/components/SignalMeter'
import { formatLinkSpeed } from '@/features/connection/utils/connection-display'
import { signalWord } from '@/features/connection/utils/wifi-signal'
import type { EthernetNetworkInfo, NetworkInfo, WifiNetworkInfo } from '@/types'
import { isEthernetNetwork, isWifiNetwork } from '@/types'
import { DataList, DataListStack, DataRow, InlineMeta, NoValue } from '@/ui'
import { formatBand, formatChannel, formatDisplayValue, formatDuplex, formatWifiStandard } from '@/utils/format'

type ConnectionDetailsPanelProps = {
  info: NetworkInfo
  publicIp: string | null
  isPublicIpLoading: boolean
}

/**
 * The expanded details, grouped by topic: the link itself, then the addresses
 * from the device outward, then, on Ethernet, the adapter it runs over.
 */
export function ConnectionDetailsPanel({ info, publicIp, isPublicIpLoading }: ConnectionDetailsPanelProps) {
  return (
    // Keeps its padding when closed, so the rows hold their inset through the
    // height animation; the wrapper does the clipping. 12px, the air around
    // each divider, so the edges match the gaps between groups.
    <div className="bg-inset py-12">
      <DataListStack>
        {isWifiNetwork(info) && <WifiLinkRows info={info} />}
        {isEthernetNetwork(info) && <EthernetLinkRows info={info} />}
        <AddressRows info={info} publicIp={publicIp} isPublicIpLoading={isPublicIpLoading} />
        {isEthernetNetwork(info) && <AdapterRows info={info} />}
      </DataListStack>
    </div>
  )
}

function WifiLinkRows({ info }: { info: WifiNetworkInfo }) {
  const linkSpeed = formatLinkSpeed(info)
  return (
    <DataList density="compact">
      {/* The OS can withhold the name (e.g. without location permission). */}
      <DataRow label="Network name" value={info.ssid || null} />
      <DataRow label="Signal" align="center">
        {/* Block flex: inline-flex adds strut height that misaligns the bars. With
            no text, the bars sit on the baseline and at 10px reach cap height. */}
        <div className="flex items-baseline justify-end gap-6">
          {info.signalStrength != null && <SignalMeter strength={info.signalStrength} placement="details" />}
          {formatSignalDetail(info)}
        </div>
      </DataRow>
      {linkSpeed && <DataRow label="Link speed" value={linkSpeed} />}
      <DataRow label="Band" value={formatBand(info.frequency)} />
      <DataRow label="Channel" value={formatChannel(info.channel, info.frequency)} />
      <DataRow label="Standard" value={formatWifiStandard(info.wifiStandard)} />
      {info.security != null ? (
        <DataRow label="Security" align="center">
          <SecurityBadge security={info.security} />
        </DataRow>
      ) : (
        <DataRow label="Security">
          <NoValue />
        </DataRow>
      )}
    </DataList>
  )
}

function EthernetLinkRows({ info }: { info: EthernetNetworkInfo }) {
  const linkSpeed = formatLinkSpeed(info)
  return (
    <DataList density="compact">
      {linkSpeed && <DataRow label="Link speed" value={linkSpeed} />}
      <DataRow label="Duplex">{formatDisplayValue(formatDuplex(info.duplex)) ?? <NoValue />}</DataRow>
    </DataList>
  )
}

type AddressRowsProps = Pick<ConnectionDetailsPanelProps, 'info' | 'publicIp' | 'isPublicIpLoading'>

function AddressRows({ info, publicIp, isPublicIpLoading }: AddressRowsProps) {
  return (
    <DataList density="compact">
      <DataRow label="IP address">{formatDisplayValue(info.ipAddress) ?? <NoValue />}</DataRow>
      <DataRow label="Gateway">{formatDisplayValue(info.gateway) ?? <NoValue />}</DataRow>
      <DataRow label="Public IP" value={publicIp ?? (isPublicIpLoading ? 'Checking…' : null)} />
    </DataList>
  )
}

// The interface name and MAC are on the Interfaces screen, so only Ethernet
// adds a hardware group here.
function AdapterRows({ info }: { info: EthernetNetworkInfo }) {
  return (
    <DataList density="compact">
      <DataRow label="Adapter">{formatDisplayValue(info.product) ?? <NoValue />}</DataRow>
      <DataRow label="Vendor">{formatDisplayValue(info.vendor) ?? <NoValue />}</DataRow>
    </DataList>
  )
}

/** Signal as its rating and percent (plus dBm when known), else dBm alone, else a NoValue bar. */
function formatSignalDetail(info: WifiNetworkInfo): ReactNode {
  const { signalStrength, signalDbm } = info
  if (signalStrength != null && Number.isFinite(signalStrength)) {
    const percent = signalDbm != null ? `${signalStrength}% (${signalDbm} dBm)` : `${signalStrength}%`
    return <InlineMeta items={[signalWord(signalStrength), percent]} />
  }
  if (signalDbm != null && Number.isFinite(signalDbm)) return `${signalDbm} dBm`
  return <NoValue />
}
