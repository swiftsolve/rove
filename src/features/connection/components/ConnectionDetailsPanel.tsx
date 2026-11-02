import type { ReactNode } from 'react'
import type { EthernetNetworkInfo, NetworkInfo, WifiNetworkInfo } from '@/types'
import { isEthernetNetwork, isWifiNetwork } from '@/types'
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
import { DataList, DataListStack, DataRow, InlineMeta } from '@/ui'
import { SecurityBadge } from '@/features/connection/components/SecurityBadge'
import { SignalMeter } from '@/features/connection/components/SignalMeter'

type ConnectionDetailsPanelProps = {
  info: NetworkInfo
  publicIp: string | null
  isPublicIpLoading: boolean
}

/**
 * The expanded details, grouped by topic: the link itself, then the addresses
 * from the device outward, then the hardware it runs over.
 */
export function ConnectionDetailsPanel({
  info,
  publicIp,
  isPublicIpLoading,
}: ConnectionDetailsPanelProps): JSX.Element {
  return (
    // A dark inset panel below the strip (like the live chart and bench
    // footer): full card width, square top edge, and the card's overflow rounds
    // the bottom. It keeps its padding whether open or not, so the rows hold
    // their inset for the whole height animation; the wrapper around it does
    // the clipping. DataListStack splits the groups with a full-width hairline.
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

function WifiLinkRows({ info }: { info: WifiNetworkInfo }): JSX.Element {
  const linkSpeed = formatLinkSpeed(info)
  return (
    <DataList density="compact">
      {/* The strip's title falls back to "WiFi Network" when the OS withholds
          the name (e.g. without location permission); here the row just drops. */}
      <DataRow label="Network name" value={info.ssid || null} />
      <DataRow label="Signal" align="center">
        {/* Block flex (not inline-flex) avoids extra line-box strut height inside
            .type-number-default, which would misalign the bars with the label text. The
            bars have no text, so baseline alignment sits their bottom on the
            text's baseline, and at 10px they reach its capitals. */}
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

function EthernetLinkRows({ info }: { info: EthernetNetworkInfo }): JSX.Element {
  const linkSpeed = formatLinkSpeed(info)
  return (
    <DataList density="compact">
      {linkSpeed && <DataRow label="Link speed" value={linkSpeed} />}
      <DataRow label="Duplex" value={formatDisplayValue(formatDuplex(info.duplex))} />
    </DataList>
  )
}

type AddressRowsProps = Pick<ConnectionDetailsPanelProps, 'info' | 'publicIp' | 'isPublicIpLoading'>

function AddressRows({ info, publicIp, isPublicIpLoading }: AddressRowsProps): JSX.Element {
  return (
    <DataList density="compact">
      <DataRow label="IP address" value={formatDisplayValue(info.ipAddress)} />
      <DataRow label="Gateway" value={formatDisplayValue(info.gateway)} />
      {info.dns.length > 0 && <DataRow label="DNS" value={formatDisplayValue(info.dns.join(', '))} />}
      <DataRow label="Public IP" value={publicIp ?? (isPublicIpLoading ? 'Checking…' : null)} />
    </DataList>
  )
}

function HardwareRows({ info }: { info: NetworkInfo }): JSX.Element {
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
