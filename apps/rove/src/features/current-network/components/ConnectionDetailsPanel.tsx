import { DataList, DataRow, InlineMeta, NoValue } from '@swiftsolve/rove-ui'
import type { ReactNode } from 'react'

import { SpeakableText } from '@/app/components/SpeakableText'
import { SecurityBadge } from '@/features/current-network/components/SecurityBadge'
import { SignalMeter } from '@/features/current-network/components/SignalMeter'
import { formatLinkSpeed } from '@/features/current-network/utils/connection-display'
import { signalWord } from '@/features/current-network/utils/wifi-signal'
import type { EthernetNetworkInfo, NetworkInfo, WifiNetworkInfo } from '@/types'
import { isEthernetNetwork, isWifiNetwork } from '@/types'
import { formatBand, formatConnectionType, formatDisplayValue, formatDuplex, formatWifiStandard } from '@/utils/format'

type ConnectionDetailsPanelProps = {
  info: NetworkInfo
}

/**
 * The expanded details of the link itself. Its addresses are elsewhere: the
 * IP address on Interfaces, the gateway and public IP on Connection.
 */
export function ConnectionDetailsPanel({ info }: ConnectionDetailsPanelProps) {
  return (
    // Keeps its padding when closed, so the rows hold their inset through the
    // height animation; the wrapper does the clipping. The sides take the
    // card's own inset, so the rows line up with the strip above.
    <div className="bg-inset px-(--card-body-padding) py-12">
      {isWifiNetwork(info) && <WifiLinkRows info={info} />}
      {isEthernetNetwork(info) && <EthernetLinkRows info={info} />}
    </div>
  )
}

function WifiLinkRows({ info }: { info: WifiNetworkInfo }) {
  const linkSpeed = formatLinkSpeed(info)
  return (
    <DataList density="compact">
      {/* The OS can withhold the name (e.g. without location permission). */}
      <DataRow label="Network name" value={info.ssid || null} />
      {/* Which kind of link this is, as the title bar says only whether you're online. */}
      <DataRow label="Connection" value={formatConnectionType(info.connectionType)} />
      <DataRow label="Signal" align="center">
        {/* Block flex: inline-flex adds strut height that misaligns the bars. With
            no text, the bars sit on the baseline and at 9px reach cap height. */}
        <div className="flex items-baseline justify-end gap-6">
          {/* The words beside it say the rating. */}
          {info.signalStrength != null && <SignalMeter strength={info.signalStrength} shouldAnnounce={false} />}
          {formatSignalDetail(info)}
        </div>
      </DataRow>
      {linkSpeed && <DataRow label="Link speed" value={linkSpeed} />}
      <DataRow label="Band" value={formatBand(info.frequency)} />
      <DataRow label="Channel">{formatChannelDetail(info)}</DataRow>
      <DataRow label="Standard">{speakable(formatWifiStandard(info.wifiStandard))}</DataRow>
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
      {/* First, like Wi-Fi's network name: what this link is. The interface name
          and MAC are on the Interfaces screen. */}
      <DataRow label="Adapter">{formatDisplayValue(info.product) ?? <NoValue />}</DataRow>
      <DataRow label="Connection" value={formatConnectionType(info.connectionType)} />
      {linkSpeed && <DataRow label="Link speed" value={linkSpeed} />}
      <DataRow label="Duplex">{formatDisplayValue(formatDuplex(info.duplex)) ?? <NoValue />}</DataRow>
    </DataList>
  )
}

/** Signal as its rating and percent (plus dBm when known), else dBm alone, else a NoValue bar. */
function formatSignalDetail(info: WifiNetworkInfo): ReactNode {
  const { signalStrength, signalDbm } = info
  if (signalStrength != null && Number.isFinite(signalStrength)) {
    const strengthText = signalDbm != null ? `${signalStrength}% (${signalDbm} dBm)` : `${signalStrength}%`
    return <InlineMeta items={[signalWord(signalStrength), <SpeakableText key="percent" text={strengthText} />]} />
  }
  if (signalDbm != null && Number.isFinite(signalDbm)) return `${signalDbm} dBm`
  return <NoValue />
}

/** The channel number and, when known, its width: "101 • 160 MHz". Null leaves the row out. */
function formatChannelDetail(info: WifiNetworkInfo): ReactNode {
  const { channel, channelWidthMhz } = info
  if (channel == null || !Number.isFinite(channel)) return null
  const widthText = channelWidthMhz != null && Number.isFinite(channelWidthMhz) ? `${channelWidthMhz} MHz` : null
  return <InlineMeta items={[String(channel), widthText]} />
}

/** A value a screen reader says without its brackets, or null to leave the row out. */
function speakable(text: string | null): ReactNode {
  return text == null ? null : <SpeakableText text={text} />
}
