import type { ReactNode } from 'react'

import { SecurityBadge } from '@/features/connection/components/SecurityBadge'
import { SignalMeter } from '@/features/connection/components/SignalMeter'
import { formatLinkSpeed } from '@/features/connection/utils/connection-display'
import {
  formatBand,
  formatChannel,
  formatDisplayValue,
  formatDuplex,
  formatMac,
  formatSignalStrength,
  formatWifiStandard,
} from '@/lib/format'
import type { EthernetNetworkInfo, NetworkInfo, WifiNetworkInfo } from '@/types'
import { isEthernetNetwork, isWifiNetwork } from '@/types'
import { DataList, DataListStack, DataRow, InlineMeta } from '@/ui'

type ConnectionDetailsPanelProps = {
  info: NetworkInfo
  publicIp: string | null
  isPublicIpLoading: boolean
}

/**
 * The expanded details, grouped by topic: the link itself, then the addresses
 * from the device outward, then the hardware it runs over.
 */
export function ConnectionDetailsPanel({ info, publicIp, isPublicIpLoading }: ConnectionDetailsPanelProps) {
  return (
    // Keeps its padding when closed, so the rows hold their inset through the
    // height animation; the wrapper does the clipping.
    <div className="bg-inset py-(--card-header-padding-y)">
      <DataListStack>
        {isWifiNetwork(info) && <WifiLinkRows info={info} />}
        {isEthernetNetwork(info) && <EthernetLinkRows info={info} />}
        <AddressRows info={info} publicIp={publicIp} isPublicIpLoading={isPublicIpLoading} />
        <HardwareRows info={info} />
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
        <DataRow label="Security" value="—" />
      )}
    </DataList>
  )
}

function EthernetLinkRows({ info }: { info: EthernetNetworkInfo }) {
  const linkSpeed = formatLinkSpeed(info)
  return (
    <DataList density="compact">
      {linkSpeed && <DataRow label="Link speed" value={linkSpeed} />}
      <DataRow label="Duplex" value={formatDisplayValue(formatDuplex(info.duplex))} />
    </DataList>
  )
}

type AddressRowsProps = Pick<ConnectionDetailsPanelProps, 'info' | 'publicIp' | 'isPublicIpLoading'>

function AddressRows({ info, publicIp, isPublicIpLoading }: AddressRowsProps) {
  return (
    <DataList density="compact">
      <DataRow label="IP address" value={formatDisplayValue(info.ipAddress)} />
      <DataRow label="Gateway" value={formatDisplayValue(info.gateway)} />
      {info.dns.length > 0 && <DataRow label="DNS" value={formatDisplayValue(info.dns.join(', '))} />}
      <DataRow label="Public IP" value={publicIp ?? (isPublicIpLoading ? 'Checking…' : null)} />
    </DataList>
  )
}

function HardwareRows({ info }: { info: NetworkInfo }) {
  return (
    <DataList density="compact">
      {isEthernetNetwork(info) && (
        <>
          <DataRow label="Adapter" value={formatDisplayValue(info.product)} />
          <DataRow label="Vendor" value={formatDisplayValue(info.vendor)} />
        </>
      )}
      <DataRow label="Interface" value={formatDisplayValue(info.interfaceName)} />
      <DataRow label="MAC" value={formatMac(info.macAddress)} />
    </DataList>
  )
}

/** Signal as its rating and percent (plus dBm when known), else dBm alone, else a dash. */
function formatSignalDetail(info: WifiNetworkInfo): ReactNode {
  const { signalStrength, signalDbm } = info
  if (signalStrength != null && Number.isFinite(signalStrength)) {
    const percent = signalDbm != null ? `${signalStrength}% (${signalDbm} dBm)` : `${signalStrength}%`
    return <InlineMeta items={[formatSignalStrength(signalStrength), percent]} />
  }
  if (signalDbm != null && Number.isFinite(signalDbm)) return `${signalDbm} dBm`
  return '—'
}
