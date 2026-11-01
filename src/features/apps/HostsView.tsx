import { memo, type RefObject } from 'react'
import type { AppHosts, HostConn, HostUsageSummary } from '@/types'
import { useHostUsage } from '@/features/apps/hooks/useHostUsage'
import { useNavigation } from '@/app/hooks/useNavigation'
import { appDomain } from '@/features/apps/utils/app-domain'
import { isPrivateIp } from '@/features/apps/utils/ip'
import { countryCodeToFlag, countryCodeToName } from '@/features/apps/utils/flag'
import { appGroupLabel, hostGlyphLabel } from '@/features/apps/utils/host-labels'
import { totalBytes } from '@/features/apps/utils/transfer'
import { useExpandedApps } from '@/features/apps/hooks/useExpandedApps'
import { useScrollToFocusedApp } from '@/features/apps/hooks/useScrollToFocusedApp'
import {
  ChevronDownIcon,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  EmptyState,
  ErrorBanner,
  GlobeIcon,
  HelpIcon,
  IconButton,
  IpIcon,
  LoadingState,
  PageHeader,
  POLLING_DESCRIPTION,
  Tooltip as UiTooltip,
} from '@/ui'
import { ServiceIcon } from '@/features/services/components/ServiceIcon'
import { RestartAsAdminAction } from '@/features/apps/components/RestartAsAdminAction'
import { cva, cx } from 'class-variance-authority'
import { UsageList } from '@/features/apps/components/UsageList'
import { ByteTotal } from '@/features/apps/components/ByteTotal'
import { TransferFigures } from '@/features/apps/components/TransferFigures'

/** An app group's disclosure chevron: points down when open, rotates to a right
 *  caret when closed. */
const chevronVariants = cva(
  'shrink-0 text-tertiary transition-transform duration-(--duration-normal) ease-out',
  {
    variants: {
      isOpen: { true: 'transform-[rotate(0deg)]', false: 'transform-[rotate(-90deg)]' },
    },
  },
)

// An app group sits flush against the card edge with no radius of its own, so a
// ring's corners (the nav-flash highlight's, or the focus ring's) would run
// square into the card's rounded ones and get shaved off by its overflow:hidden.
// It matches the card's curve on whichever edges it touches; with no fill, the
// radius is invisible the rest of the time. The header toggles the whole group,
// so focus frames the group (header and, when expanded, its hosts) rather than
// the header row alone. Scroll margin gives breathing room when a focused group
// is scrolled to the top of the list.
const GROUP = cx(
  'scroll-mt-12 first:rounded-t-lg last:rounded-b-lg',
)

// The group header is a full-width toggle that carries the row's inset, so the
// whole row is the click target, with a quiet hover to signal it. Expanded, the
// hosts sit 8px below it. Its own ring is drawn on the group instead.
const GROUP_HEADER = cx(
  'flex w-full items-center justify-between gap-12 px-(--card-body-padding) py-12 aria-expanded:pb-8',
  '[font:inherit] text-left text-inherit hover:text-primary focus-visible:outline-none',
  'transition-[color] duration-(--duration-fast) ease-in-out',
)

// Fixed-width flag slot so hostnames stay aligned whether or not a flag (or a
// fallback glyph) is present. Twemoji flag glyphs come first so the country flags
// render on Windows, which has no flag emoji; the SVG fallbacks aren't text and
// are unaffected. See the @font-face note in styles/base.css.
const FLAG_SLOT = cx(
  'inline-flex w-[18px] shrink-0 items-center justify-center',
  "text-md leading-none font-[family-name:'Twemoji_Country_Flags',var(--font-family-sans)]",
)

const HOST_COUNT = cx(
  'min-w-[18px] shrink-0 rounded-full bg-inset px-6 py-px',
  'text-center text-xs text-tertiary tabular-nums',
)

// The app's hosts, indented so each 18px flag sits centred under the 16px app
// icon above it (past the chevron gutter): chevron 14 + gap 8 + half of
// (16 − 18) ≈ 21px. The flag column then reads as a continuation of the
// app-icon column.
const HOSTS = cx(
  'flex flex-col gap-8',
  'pr-(--card-body-padding) pb-12 pl-[calc(var(--card-body-padding)+21px)]',
)

const HOST_USAGE_INFO_HINT =
  'Hosts each app connected to, named by reverse DNS. Bytes cover TCP only and reset when Rove restarts.'

const HOST_USAGE_EMPTY_HINT = 'Hosts appear here as your apps connect.'

const HOST_USAGE_UNSUPPORTED_HINT =
  'Run Rove as administrator to attribute hosts to apps on Windows.'

/** The glyph left of a host's name: the country flag when geolocated, else a
 *  LAN or globe (public but unresolved) fallback. */
function HostGlyph({ host }: { host: HostConn }): JSX.Element {
  const flag = countryCodeToFlag(host.countryCode)
  const country = countryCodeToName(host.countryCode)
  // A peer on the user's own network (private/LAN address — no country flag).
  // These get a node-graph glyph rather than the globe: the globe reads as "out
  // on the internet", the opposite of a local address, and it explains an
  // otherwise odd router-supplied hostname like "mynetwork".
  const isLocal = !flag && isPrivateIp(host.ip)
  const isDecorative = !flag && !isLocal
  const label = hostGlyphLabel(flag, country, isLocal)
  const FallbackIcon = isLocal ? IpIcon : GlobeIcon

  const glyph = (
    <span
      className={FLAG_SLOT}
      role={label ? 'img' : undefined}
      aria-hidden={isDecorative ? true : undefined}
      aria-label={label ?? undefined}
    >
      {flag ?? <FallbackIcon size={12} className="text-tertiary opacity-60" />}
    </span>
  )
  if (!label) return glyph
  return (
    <UiTooltip content={label} side="top" align="start">
      {glyph}
    </UiTooltip>
  )
}

/** The hostname (or bare IP), truncated with an ellipsis. Hovering reveals the
 *  whole thing — plus the underlying IP — in the styled tooltip. A tooltip rather
 *  than an in-place scroll: it shows the entire name at once, at any length, with
 *  no motion (an in-place marquee either scrolls forever or hides one end). Only
 *  meaningful once a hostname has resolved; when the label already is the IP
 *  there's nothing more to reveal, so it's disabled rather than unmounted, so the
 *  node survives the poll that fills the hostname in. */
function HostName({ host }: { host: HostConn }): JSX.Element {
  return (
    <UiTooltip
      content={
        <span className="flex flex-col gap-2">
          {/* Most hostnames fit the bubble's widened cap on one line, so the box
              hugs them; a longer one fills each line to the edge rather than
              breaking at a hyphen and leaving the box padded out to the cap. */}
          <span className="text-primary break-all">{host.host}</span>
          <span className="text-tertiary tabular-nums">{host.ip}</span>
        </span>
      }
      side="top"
      align="start"
      maxWidth={360}
      isDisabled={!host.host}
    >
      {/* Shrinks with the row, so the name truncates; the portalled bubble isn't clipped. */}
      <span className="min-w-0 truncate text-xs text-secondary">{host.host ?? host.ip}</span>
    </UiTooltip>
  )
}

/** One remote host beneath its app: flag + hostname on the left, the download /
 *  upload split on the right. Memoised, like `AppGroup`: each poll keeps an
 *  unchanged host's object, so only the hosts that moved re-render. */
const HostRow = memo(function HostRow({ host }: { host: HostConn }): JSX.Element {
  return (
    <li className="flex items-center justify-between gap-12">
      <span className="inline-flex min-w-0 items-center gap-[7px]">
        <HostGlyph host={host} />
        <HostName host={host} />
      </span>
      <TransferFigures transfer={host} className="shrink-0" />
    </li>
  )
})

/** One app group: an icon + name header with the app's total, then its hosts.
 *  Memoised: each poll keeps an idle app's object, so its group skips the render. */
const AppGroup = memo(function AppGroup({
  app,
  isExpanded,
  onToggle,
}: {
  app: AppHosts
  isExpanded: boolean
  onToggle: (name: string) => void
}): JSX.Element {
  const total = totalBytes(app)
  const hostCount = app.hosts.length
  return (
    <Disclosure
      as="li"
      hasFocusFrame
      className={GROUP}
      data-app={app.name}
      isOpen={isExpanded}
      onOpenChange={() => onToggle(app.name)}
    >
      {/* An accordion header: the heading names the group, the button inside it
          toggles the hosts beneath. The heading carries meaning only: it takes
          the row's own font, so the button inside (font: inherit) renders as
          before. */}
      <h2 className="[font:inherit]">
        <DisclosureTrigger
          className={GROUP_HEADER}
          aria-label={appGroupLabel(app.name, hostCount, total)}
        >
          <span className="inline-flex min-w-0 items-center gap-8">
            <ChevronDownIcon
              size={14}
              className={chevronVariants({ isOpen: isExpanded })}
              aria-hidden
            />
            <ServiceIcon src={app.icon} host={appDomain(app.name)} name={app.name} />
            <span className="truncate text-sm text-primary" title={app.name}>
              {app.name}
            </span>
            {/* Small muted count of hosts in the group, after the app name. */}
            <span className={HOST_COUNT}>{hostCount}</span>
          </span>
          <ByteTotal bytes={total} />
        </DisclosureTrigger>
      </h2>
      <DisclosurePanel>
        <ul role="list" aria-label={`Hosts for ${app.name}`} className={HOSTS}>
          {app.hosts.map((host) => (
            <HostRow key={host.ip} host={host} />
          ))}
        </ul>
      </DisclosurePanel>
    </Disclosure>
  )
})

/** The page body: the admin prompt, a first-load spinner, an empty state, or
 *  the grouped host list. */
function HostsBody({
  usage,
  isFirstLoad,
  listRef,
  isExpanded,
  onToggle,
}: {
  usage: HostUsageSummary
  isFirstLoad: boolean
  listRef: RefObject<HTMLUListElement>
  isExpanded: (name: string) => boolean
  onToggle: (name: string) => void
}): JSX.Element {
  const { apps, support } = usage
  if (support === 'unsupported') {
    return (
      <EmptyState
        isLocked
        title="Administrator access needed"
        description={HOST_USAGE_UNSUPPORTED_HINT}
        actions={<RestartAsAdminAction />}
      />
    )
  }
  if (isFirstLoad) {
    return (
      <LoadingState label="Measuring per-app hosts…" />
    )
  }
  if (apps.length === 0) {
    return <EmptyState title="No hosts yet" description={HOST_USAGE_EMPTY_HINT} />
  }
  return (
    <UsageList label="Apps" ref={listRef}>
      {apps.map((app) => (
        <AppGroup
          key={app.name}
          app={app}
          isExpanded={isExpanded(app.name)}
          onToggle={onToggle}
        />
      ))}
    </UsageList>
  )
}

export function HostsView(): JSX.Element {
  const { usage, isFirstLoad, error, reload } = useHostUsage()
  const { location, back } = useNavigation()
  // Arrived by clicking an app: open only that app's group and collapse the
  // rest. Otherwise every group starts collapsed.
  const focusApp = location.appsSub?.view === 'hosts' ? location.appsSub.app ?? null : null
  const { isExpanded, toggle } = useExpandedApps(focusApp)
  const listRef = useScrollToFocusedApp(focusApp, usage.apps)

  return (
    <div className="page">
      <PageHeader
        title="Hosts"
        description="Remote hosts by application, busiest first"
        status={isFirstLoad ? 'Loading…' : undefined}
        onBack={back}
        actions={
          <IconButton label="About per-app hosts" icon={HelpIcon} tooltip={HOST_USAGE_INFO_HINT} />
        }
      />
      {error && <ErrorBanner title={error} description={POLLING_DESCRIPTION} onRetry={reload} />}

      <HostsBody
        usage={usage}
        isFirstLoad={isFirstLoad}
        listRef={listRef}
        isExpanded={isExpanded}
        onToggle={toggle}
      />
    </div>
  )
}
