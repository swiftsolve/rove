import { cva, cx } from 'class-variance-authority'
import { memo } from 'react'

import { useNavigation } from '@/app/hooks/useNavigation'
import { AppIcon } from '@/features/apps/components/AppIcon'
import { ByteTotal } from '@/features/apps/components/ByteTotal'
import { RowName } from '@/features/apps/components/RowName'
import { TransferFigures } from '@/features/apps/components/TransferFigures'
import { UsageBody, type UsageBodyCopy } from '@/features/apps/components/UsageBody'
import { useExpandedApps } from '@/features/apps/hooks/useExpandedApps'
import { useHostUsage } from '@/features/apps/hooks/useHostUsage'
import { useScrollToFocusedApp } from '@/features/apps/hooks/useScrollToFocusedApp'
import { countryCodeToFlag, countryCodeToName } from '@/features/apps/utils/flag'
import { appGroupLabel, hostIconLabel } from '@/features/apps/utils/host-labels'
import { isPrivateIp } from '@/features/apps/utils/ip'
import { totalBytes } from '@/features/apps/utils/transfer'
import { POLLING_DESCRIPTION } from '@/lib/copy'
import type { AppHosts, HostConn } from '@/types'
import {
  Banner,
  CardList,
  ChevronDownIcon,
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
  GlobeIcon,
  HelpIcon,
  IconButton,
  IpIcon,
  PageHeader,
  Tooltip as UiTooltip,
} from '@/ui'

/** Points down when open, right when closed. */
const chevronVariants = cva('shrink-0 text-tertiary transition-transform duration-(--duration-normal) ease-out', {
  variants: {
    isOpen: { true: 'transform-[rotate(0deg)]', false: 'transform-[rotate(-90deg)]' },
  },
  defaultVariants: { isOpen: false },
})

// Matches the card's curve on the edges it touches, so the nav-flash and focus
// rings aren't shaved square by the card's overflow:hidden. With no fill, the
// radius is otherwise invisible. Scroll margin leaves room above a focused group.
const GROUP = cx('scroll-mt-12 first:rounded-t-lg last:rounded-b-lg')

// Carries the row's inset so the whole row is the click target. Its focus ring
// is drawn on the group instead.
const GROUP_HEADER = cx(
  'flex w-full items-center justify-between gap-12 px-(--card-body-padding) py-12 aria-expanded:pb-8',
  '[font:inherit] text-left text-inherit hover:text-primary focus-visible:text-primary',
  'transition-[color] duration-(--duration-fast) ease-in-out',
)

// Fixed width keeps hostnames aligned with or without a flag. Twemoji comes first
// because Windows has no flag emoji (see the @font-face note in styles/base.css).
const FLAG_SLOT = cx(
  'inline-flex w-[18px] shrink-0 items-center justify-center',
  "text-md leading-none font-[family-name:'Twemoji_Country_Flags',var(--font-family-sans)]",
)

const HOST_COUNT = cx(
  'min-w-[18px] shrink-0 rounded-full bg-inset px-6 py-px',
  'text-center text-xs text-tertiary tabular-nums',
)

// Indented so each 18px flag centres under the 16px app icon: chevron 14 + gap 8
// + half of (16 − 18) ≈ 21px.
const HOSTS = cx('flex flex-col gap-8', 'pr-(--card-body-padding) pb-12 pl-[calc(var(--card-body-padding)+21px)]')

const HOST_USAGE_INFO_HINT =
  'Hosts each app connected to, named by reverse DNS. Bytes cover TCP only and reset when Rove restarts.'

const BODY_COPY: UsageBodyCopy = {
  unsupported: 'Run Rove as administrator to attribute hosts to apps on Windows.',
  loading: 'Measuring per-app hosts…',
  emptyTitle: 'No hosts yet',
  empty: 'Hosts appear here as your apps connect.',
}

/** The icon left of a host's name: the country flag when geolocated, else a
 *  LAN or globe (public but unresolved) fallback. */
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

/** The hostname (or bare IP), truncated; a tooltip shows the full name and IP.
 *  With no hostname yet there's nothing to reveal, so the tooltip is disabled
 *  rather than unmounted, keeping the node across the poll that resolves it. */
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

/** Memoised: each poll keeps an unchanged host's object, so only hosts that moved
 *  re-render. */
const HostRow = memo(function HostRow({ host }: { host: HostConn }) {
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

/** Memoised: each poll keeps an idle app's object, so its group skips the render. */
const AppGroup = memo(function AppGroup({
  app,
  isExpanded,
  onToggle,
}: {
  app: AppHosts
  isExpanded: boolean
  onToggle: (name: string) => void
}) {
  const total = totalBytes(app)
  const hostCount = app.hosts.length
  return (
    <Collapsible
      as="li"
      hasFocusFrame
      className={GROUP}
      data-app={app.name}
      isOpen={isExpanded}
      onOpenChange={() => onToggle(app.name)}
    >
      {/* The accordion heading pattern. The heading takes the row's font, so it
          adds semantics without restyling the button. */}
      <h2 className="[font:inherit]">
        <CollapsibleTrigger className={GROUP_HEADER} aria-label={appGroupLabel(app.name, hostCount, total)}>
          <RowName
            icon={
              <>
                <ChevronDownIcon size={14} className={chevronVariants({ isOpen: isExpanded })} aria-hidden />
                <AppIcon app={app} />
              </>
            }
            name={app.name}
          >
            <span className={HOST_COUNT}>{hostCount}</span>
          </RowName>
          <ByteTotal bytes={total} />
        </CollapsibleTrigger>
      </h2>
      <CollapsiblePanel>
        <ul role="list" aria-label={`Hosts for ${app.name}`} className={HOSTS}>
          {app.hosts.map((host) => (
            <HostRow key={host.ip} host={host} />
          ))}
        </ul>
      </CollapsiblePanel>
    </Collapsible>
  )
})

export function HostsView() {
  const { usage, isFirstLoad, error, reload } = useHostUsage()
  const { location, back } = useNavigation()
  const { apps } = usage
  // Arriving from an app opens only its group; otherwise all start collapsed.
  const focusApp = location.appsSub?.view === 'hosts' ? (location.appsSub.app ?? null) : null
  const { isExpanded, toggle } = useExpandedApps(focusApp)
  const listRef = useScrollToFocusedApp(focusApp, apps)

  return (
    <div className="page">
      <PageHeader
        title="Hosts"
        description="Remote hosts by application, busiest first"
        status={isFirstLoad ? 'Loading…' : undefined}
        onBack={back}
        actions={<IconButton label="About per-app hosts" icon={HelpIcon} tooltip={HOST_USAGE_INFO_HINT} />}
      />
      {error && <Banner variant="error" title={error} description={POLLING_DESCRIPTION} onRetry={reload} />}

      <UsageBody support={usage.support} isFirstLoad={isFirstLoad} isEmpty={apps.length === 0} copy={BODY_COPY}>
        <CardList label="Apps" ref={listRef}>
          {apps.map((app) => (
            <AppGroup key={app.name} app={app} isExpanded={isExpanded(app.name)} onToggle={toggle} />
          ))}
        </CardList>
      </UsageBody>
    </div>
  )
}
