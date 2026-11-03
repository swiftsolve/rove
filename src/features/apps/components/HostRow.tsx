import { cx } from 'class-variance-authority'
import { memo } from 'react'

import { TransferFigures } from '@/features/apps/components/TransferFigures'
import { countryCodeToFlag, countryCodeToName } from '@/features/apps/utils/flag'
import { hostIconLabel } from '@/features/apps/utils/host-labels'
import { isPrivateIp } from '@/lib/ip'
import type { HostConn } from '@/types'
import { GlobeIcon, IpIcon, Tooltip as UiTooltip } from '@/ui'

// Fixed width keeps hostnames aligned with or without a flag. Twemoji comes first
// because Windows has no flag emoji (see the @font-face note in styles/base.css).
const FLAG_SLOT = cx(
  'inline-flex w-[18px] shrink-0 items-center justify-center',
  "text-md leading-none font-[family-name:'Twemoji_Country_Flags',var(--font-family-sans)]",
)

/**
 * The icon left of a host's name: the country flag when geolocated, else a
 * LAN or globe (public but unresolved) fallback.
 */
function HostIcon({ host }: { host: HostConn }) {
  const flag = countryCodeToFlag(host.countryCode)
  const country = countryCodeToName(host.countryCode)
  // A LAN peer gets a node-graph icon, not the globe, which reads as "out on the
  // internet". It also explains a router-supplied hostname like "mynetwork".
  const isLocal = !flag && isPrivateIp(host.ip)
  const isDecorative = !flag && !isLocal
  const label = hostIconLabel(flag, country, isLocal)
  const FallbackIcon = isLocal ? IpIcon : GlobeIcon

  const icon = (
    <span
      className={FLAG_SLOT}
      role={label ? 'img' : undefined}
      aria-hidden={isDecorative ? true : undefined}
      aria-label={label ?? undefined}
    >
      {flag ?? <FallbackIcon size={12} className="text-tertiary opacity-60" />}
    </span>
  )
  if (!label) return icon
  return (
    <UiTooltip content={label} side="top">
      {icon}
    </UiTooltip>
  )
}

/**
 * The hostname (or bare IP), truncated; a tooltip shows the full name and IP.
 * With no hostname yet there's nothing to reveal, so the tooltip is disabled
 * rather than unmounted, keeping the node across the poll that resolves it.
 */
function HostName({ host }: { host: HostConn }) {
  return (
    <UiTooltip
      content={
        <span className="flex flex-col gap-2">
          {/* break-all fills each line to the edge, rather than breaking at a
              hyphen and leaving the box padded out to its cap. */}
          <span className="text-primary break-all">{host.host}</span>
          <span className="text-tertiary tabular-nums">{host.ip}</span>
        </span>
      }
      side="top"
      maxWidth={360}
      isDisabled={!host.host}
    >
      <span className="min-w-0 truncate text-xs text-secondary">{host.host ?? host.ip}</span>
    </UiTooltip>
  )
}

/** Memoised: each poll keeps an unchanged host's object, so only hosts that moved re-render. */
export const HostRow = memo(function HostRow({ host }: { host: HostConn }) {
  return (
    <li className="flex items-center justify-between gap-12">
      <span className="inline-flex min-w-0 items-center gap-[7px]">
        <HostIcon host={host} />
        <HostName host={host} />
      </span>
      <TransferFigures transfer={host} className="shrink-0" />
    </li>
  )
})
