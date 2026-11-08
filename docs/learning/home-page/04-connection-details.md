# What opens below it: `ConnectionDetailsPanel` and `SignalMeter`

Part 4 of [The Home page, line by line](README.md).

[← The network card](03-connection-card.md) · [The Traffic card →](05-traffic-card.md)

The details list slides open when you click the network card. The signal bars appear both in the strip and in that list.

Lines starting `// →` are this guide's notes; every other line is the real code, including its own comments.

## ConnectionDetailsPanel.tsx

[`src/features/connection/components/ConnectionDetailsPanel.tsx`](../../../src/features/connection/components/ConnectionDetailsPanel.tsx)

The details list.

```tsx
// → "Anything React can draw", used as a return type below.
import type { ReactNode } from 'react'

// → Shows text as written but lets a screen reader say it more naturally, for
// → example without brackets.
import { SpeakableText } from '@/app/components/SpeakableText'
// → The security badge, the signal bars, the link-speed formatter, and
// → signalWord, which turns a percent into a word like "Excellent".
import { SecurityBadge } from '@/features/connection/components/SecurityBadge'
import { SignalMeter } from '@/features/connection/components/SignalMeter'
import { formatLinkSpeed } from '@/features/connection/utils/connection-display'
import { signalWord } from '@/features/connection/utils/wifi-signal'
// → The shapes of Wi-Fi, Ethernet and general network info, and the "is it
// → Wi-Fi / Ethernet?" checks.
import type { EthernetNetworkInfo, NetworkInfo, WifiNetworkInfo } from '@/types'
import { isEthernetNetwork, isWifiNetwork } from '@/types'
// → Library pieces: a list of label/value rows, a stack of such lists with
// → dividers, one row, dot-joined items, and the dash shown for a missing
// → value.
import { DataList, DataListStack, DataRow, InlineMeta, NoValue } from '@/ui'
// → Formatters that turn raw values into readable text: band, channel, "Wi-Fi
// → 6", "Full duplex".
import { formatBand, formatChannel, formatDisplayValue, formatDuplex, formatWifiStandard } from '@/utils/format'

// → What the panel is given: network info, the public IP (text or nothing),
// → and whether that IP is still loading.
type ConnectionDetailsPanelProps = {
  info: NetworkInfo
  publicIp: string | null
  isPublicIpLoading: boolean
}

/**
 * The expanded details, grouped by topic: the link itself, then the addresses
 * from the device outward.
 */
// → Starts the panel.
export function ConnectionDetailsPanel({ info, publicIp, isPublicIpLoading }: ConnectionDetailsPanelProps) {
  return (
    // Keeps its padding when closed, so the rows hold their inset through the
    // height animation; the wrapper does the clipping. 12px, the air around
    // each divider, so the edges match the gaps between groups.
    // → A sunken grey background with 12px above and below.
    <div className="bg-inset py-12">
      // → Stacks the groups with a divider line between each.
      <DataListStack>
        // → On Wi-Fi, the Wi-Fi rows; on Ethernet, the Ethernet rows instead.
        {isWifiNetwork(info) && <WifiLinkRows info={info} />}
        {isEthernetNetwork(info) && <EthernetLinkRows info={info} />}
        // → Always, the address rows.
        <AddressRows info={info} publicIp={publicIp} isPublicIpLoading={isPublicIpLoading} />
      </DataListStack>
    </div>
  )
}

// → The Wi-Fi group. First it works out the link speed text.
function WifiLinkRows({ info }: { info: WifiNetworkInfo }) {
  const linkSpeed = formatLinkSpeed(info)
  return (
    // → A list with tighter row spacing.
    <DataList density="compact">
      {/* The OS can withhold the name (e.g. without location permission). */}
      // → The network name. If the computer hides it, null shows a dash.
      <DataRow label="Network name" value={info.ssid || null} />
      // → The Signal row, its contents centred vertically.
      <DataRow label="Signal" align="center">
        {/* Block flex: inline-flex adds strut height that misaligns the bars. With
            no text, the bars sit on the baseline and at 9px reach cap height. */}
        // → Lines the bars and words up on the text's baseline, pushed right,
        // → 6px apart.
        <div className="flex items-baseline justify-end gap-6">
          {/* The words beside it say the rating. */}
          // → The bars, silent for screen readers because the words beside
          // → them already say the rating.
          {info.signalStrength != null && <SignalMeter strength={info.signalStrength} shouldAnnounce={false} />}
          // → The words, such as "Excellent • 84% (−47 dBm)" (see
          // → formatSignalDetail below).
          {formatSignalDetail(info)}
        </div>
      </DataRow>
      // → The link speed row, only if it's known.
      {linkSpeed && <DataRow label="Link speed" value={linkSpeed} />}
      // → "5 GHz" and so on.
      <DataRow label="Band" value={formatBand(info.frequency)} />
      // → Channel with its frequency, and the Wi-Fi generation, both read
      // → cleanly by screen readers.
      <DataRow label="Channel">{speakable(formatChannel(info.channel, info.frequency))}</DataRow>
      <DataRow label="Standard">{speakable(formatWifiStandard(info.wifiStandard))}</DataRow>
      // → If the security type is known, a badge; if not, a dash.
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

// → The Ethernet group: adapter name, link speed, and duplex. `?? <NoValue
// → />` means "if this is empty, show a dash".
function EthernetLinkRows({ info }: { info: EthernetNetworkInfo }) {
  const linkSpeed = formatLinkSpeed(info)
  return (
    <DataList density="compact">
      {/* First, like Wi-Fi's network name: what this link is. The interface name
          and MAC are on the Interfaces screen. */}
      <DataRow label="Adapter">{formatDisplayValue(info.product) ?? <NoValue />}</DataRow>
      {linkSpeed && <DataRow label="Link speed" value={linkSpeed} />}
      <DataRow label="Duplex">{formatDisplayValue(formatDuplex(info.duplex)) ?? <NoValue />}</DataRow>
    </DataList>
  )
}

// → Reuses three fields from the panel's own props instead of writing them
// → again.
type AddressRowsProps = Pick<ConnectionDetailsPanelProps, 'info' | 'publicIp' | 'isPublicIpLoading'>

// → The address group: your IP, the gateway (router) address, and your public
// → IP, which says "Checking…" while it loads.
function AddressRows({ info, publicIp, isPublicIpLoading }: AddressRowsProps) {
  return (
    <DataList density="compact">
      <DataRow label="IP address">{formatDisplayValue(info.ipAddress) ?? <NoValue />}</DataRow>
      <DataRow label="Gateway">{formatDisplayValue(info.gateway) ?? <NoValue />}</DataRow>
      <DataRow label="Public IP" value={publicIp ?? (isPublicIpLoading ? 'Checking…' : null)} />
    </DataList>
  )
}

/** Signal as its rating and percent (plus dBm when known), else dBm alone, else a NoValue bar. */
// → Builds the Signal words: the word and percent (plus dBm when known), else
// → dBm alone, else a dash. Number.isFinite guards against broken numbers.
function formatSignalDetail(info: WifiNetworkInfo): ReactNode {
  const { signalStrength, signalDbm } = info
  if (signalStrength != null && Number.isFinite(signalStrength)) {
    const strengthText = signalDbm != null ? `${signalStrength}% (${signalDbm} dBm)` : `${signalStrength}%`
    return <InlineMeta items={[signalWord(signalStrength), <SpeakableText key="percent" text={strengthText} />]} />
  }
  if (signalDbm != null && Number.isFinite(signalDbm)) return `${signalDbm} dBm`
  return <NoValue />
}

/** A value a screen reader says without its brackets, or null to leave the row out. */
// → If there's text, wrap it so screen readers say it cleanly; if not, return
// → null so the row shows a dash.
function speakable(text: string | null): ReactNode {
  return text == null ? null : <SpeakableText text={text} />
}
```

## SignalMeter.tsx

[`src/features/connection/components/SignalMeter.tsx`](../../../src/features/connection/components/SignalMeter.tsx)

The four signal bars.

```tsx
import { cva, cx } from 'class-variance-authority'

// → Helpers that turn a 0–100 strength into a bar count (0–4), a level (good,
// → fair, poor) and a word.
import { signalBarCount, signalLevel, signalWord } from '@/features/connection/utils/wifi-signal'
// → The library component that draws four rising bars.
import { BarMeter } from '@/ui'

// → The colour recipe: green for good, amber for fair, red for poor. The bars
// → take the text colour.
const signalMeterVariants = cva('signal-meter flex items-center', {
  variants: {
    level: { good: 'text-status-positive', fair: 'text-status-warning', poor: 'text-status-negative' },
  },
})

// → What it's given: the strength, whether screen readers should announce it,
// → and optional extra classes.
type SignalMeterProps = {
  /** 0–100. */
  strength: number
  /** False beside words that already say the rating, so a screen reader doesn't read it twice. */
  shouldAnnounce?: boolean
  className?: string
}

/**
 * The Wi‑Fi signal as four bars, coloured by how good it is. As tall as the
 * text's capitals, on the strip's meta line and in the Signal row.
 */
// → Starts the meter. `shouldAnnounce = true` means announce unless told
// → otherwise.
export function SignalMeter({ strength, shouldAnnounce = true, className }: SignalMeterProps) {
  // → Picks the colour for this strength and adds any extra classes.
  const meterClassName = cx(signalMeterVariants({ level: signalLevel(strength) }), className)
  // → Silent version: just the bars.
  if (!shouldAnnounce) {
    return (
      <span className={meterClassName}>
        <BarMeter value={signalBarCount(strength)} />
      </span>
    )
  }
  // → Announced version: screen readers hear "Wi-Fi signal: Excellent", a
  // → meter at, say, 84 out of 100.
  return (
    <span
      className={meterClassName}
      role="meter"
      aria-label={`Wi‑Fi signal: ${signalWord(strength)}`}
      aria-valuenow={strength}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      // → The bars, with the right number lit.
      <BarMeter value={signalBarCount(strength)} />
    </span>
  )
}
```

[← The network card](03-connection-card.md) · [The Traffic card →](05-traffic-card.md)
