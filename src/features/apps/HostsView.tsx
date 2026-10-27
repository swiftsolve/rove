import { useId, type RefObject } from 'react'
import type { AppHosts, HostConn, HostUsageSummary } from '@/types'
import { formatBytes } from '@/lib/format'
import { useHostUsage } from '@/features/apps/hooks/useHostUsage'
import { useNavigation } from '@/app/hooks/useNavigation'
import { appDomain } from '@/features/apps/utils/app-domain'
import { isPrivateIp } from '@/features/apps/utils/ip'
import { countryCodeToFlag, countryCodeToName } from '@/features/apps/utils/flag'
import { useExpandedApps } from '@/features/apps/hooks/useExpandedApps'
import { useScrollToFocusedApp } from '@/features/apps/hooks/useScrollToFocusedApp'
import { Tooltip as UiTooltip } from '@/components/Tooltip'
import { Subpage } from '@/components/Subpage'
import { ServiceIcon } from '@/components/icons/ServiceIcon'
import { MetricValue } from '@/components/MetricValue'
import { ChevronDownIcon, GlobeIcon, HelpIcon, InfoIcon, IpIcon } from '@/components/icons/Icons'
import { DirectionIcon } from '@/components/icons/DirectionIcon'
import { EmptyState } from '@/components/EmptyState'
import { RestartAsAdminAction } from '@/components/RestartAsAdminAction'
import { Spinner } from '@/components/Spinner'
import { cva, cx } from 'class-variance-authority'
import { IconButton } from '@/components/IconButton'
import styles from './HostsView.module.css'

/** An app group's disclosure chevron: points right when closed, down when open. */
const chevronVariants = cva(styles.chevron, {
  variants: {
    isOpen: { true: styles.isOpen },
  },
})

const HOST_USAGE_INFO_HINT =
  'The remote hosts each app has connected to, from the OS per-socket peer ' +
  'addresses. Hostnames come from reverse DNS and flags from an IP-geolocation ' +
  'lookup, both filled in shortly after a host is first seen. Bytes cover TCP ' +
  'connections only and reset when Rove restarts.'

const HOST_USAGE_EMPTY_HINT = 'Hosts appear here as your apps open connections.'

const HOST_USAGE_UNSUPPORTED_HINT =
  'Run Rove as administrator to attribute hosts to apps on Windows.'

const LOCAL_PEER_LABEL = 'On your network'

/** Accessible name and tooltip for a host's glyph: the country name when
 *  geolocated, a "local network" hint for a LAN peer, else nothing. */
function hostGlyphLabel(flag: string | null, country: string | null, isLocal: boolean): string | null {
  if (flag && country) return country
  if (isLocal) return LOCAL_PEER_LABEL
  return null
}

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
      className={styles.flag}
      role={label ? 'img' : undefined}
      aria-hidden={isDecorative ? true : undefined}
      aria-label={label ?? undefined}
    >
      {flag ?? <FallbackIcon size={12} className={styles.flagFallback} />}
    </span>
  )
  if (!label) return glyph
  return (
    <UiTooltip content={label} placement="top" align="left">
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
        <span className={styles.tipContent}>
          <span className={styles.tipName}>{host.host}</span>
          <span className={styles.tipIp}>{host.ip}</span>
        </span>
      }
      placement="top"
      align="left"
      className={styles.nameTip}
      maxWidth={360}
      isDisabled={!host.host}
    >
      <span className={styles.hostName}>{host.host ?? host.ip}</span>
    </UiTooltip>
  )
}

/** One remote host beneath its app: flag + hostname on the left, the download /
 *  upload split on the right. */
function HostRow({ host }: { host: HostConn }): JSX.Element {
  return (
    <li className={styles.hostRow}>
      <span className={styles.hostId}>
        <HostGlyph host={host} />
        <HostName host={host} />
      </span>
      <span className={styles.hostFigures}>
        <span className={styles.figure}>
          <DirectionIcon series="down" size={11} />
          <span className="sr-only">Down</span>
          <MetricValue value={host.rxBytes} className="num" format={formatBytes} />
        </span>
        <span className={styles.figure}>
          <DirectionIcon series="up" size={11} />
          <span className="sr-only">Up</span>
          <MetricValue value={host.txBytes} className="num" format={formatBytes} />
        </span>
      </span>
    </li>
  )
}

/** One app group: an icon + name header with the app's total, then its hosts. */
function AppGroup({
  app,
  isExpanded,
  onToggle,
}: {
  app: AppHosts
  isExpanded: boolean
  onToggle: () => void
}): JSX.Element {
  const hostsId = useId()
  const total = app.rxBytes + app.txBytes
  const hostCount = app.hosts.length
  return (
    <li className={styles.group} data-app={app.name}>
      {/* An accordion header: the heading names the group, the button inside it
          toggles the hosts beneath. */}
      <h2 className={styles.groupHeading}>
        <button
          type="button"
          className={styles.header}
          onClick={onToggle}
          aria-expanded={isExpanded}
          aria-controls={isExpanded ? hostsId : undefined}
          aria-label={`${app.name}, ${hostCount} ${hostCount === 1 ? 'host' : 'hosts'}, ${formatBytes(total)}`}
        >
          <span className={styles.appId}>
            <ChevronDownIcon
              size={14}
              className={chevronVariants({ isOpen: isExpanded })}
              aria-hidden
            />
            <ServiceIcon src={app.icon} host={appDomain(app.name)} name={app.name} />
            <span className={styles.appName} title={app.name}>
              {app.name}
            </span>
            <span className={styles.count}>{hostCount}</span>
          </span>
          <MetricValue value={total} className={cx(styles.appTotal, 'num')} format={formatBytes} />
        </button>
      </h2>
      {isExpanded && (
        <ul role="list" id={hostsId} aria-label={`Hosts for ${app.name}`} className={styles.hosts}>
          {app.hosts.map((host) => (
            <HostRow key={host.ip} host={host} />
          ))}
        </ul>
      )}
    </li>
  )
}

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
        icon={InfoIcon}
        title="Administrator access needed"
        hint={HOST_USAGE_UNSUPPORTED_HINT}
        action={<RestartAsAdminAction />}
      />
    )
  }
  if (isFirstLoad) {
    return (
      <div className="view-empty" role="status">
        <Spinner />
        <p className="text-muted">Measuring per-app hosts…</p>
      </div>
    )
  }
  if (apps.length === 0) {
    return <EmptyState icon={GlobeIcon} title="No hosts yet" hint={HOST_USAGE_EMPTY_HINT} />
  }
  return (
    <div className="ui-section">
      <ul role="list" aria-label="Apps" className={cx('ui-section-body', styles.list)} ref={listRef}>
        {apps.map((app) => (
          <AppGroup
            key={app.name}
            app={app}
            isExpanded={isExpanded(app.name)}
            onToggle={() => onToggle(app.name)}
          />
        ))}
      </ul>
    </div>
  )
}

export function HostsView(): JSX.Element {
  const { usage, isLoading, error } = useHostUsage()
  const { location, back } = useNavigation()
  // Arrived by clicking an app: open only that app's group and collapse the
  // rest. Otherwise every group starts collapsed.
  const focusApp = location.appsSub?.view === 'hosts' ? location.appsSub.app ?? null : null
  const isFirstLoad = isLoading && usage.apps.length === 0
  const { isExpanded, toggle } = useExpandedApps(focusApp)
  const listRef = useScrollToFocusedApp(focusApp, usage.apps)

  return (
    <Subpage
      title="Hosts"
      description={isFirstLoad ? 'Loading…' : 'Remote hosts by application, busiest first'}
      onBack={back}
      action={
        <UiTooltip content={HOST_USAGE_INFO_HINT}>
          <IconButton
            aria-label="About per-app hosts"
          >
            <HelpIcon size={16} />
          </IconButton>
        </UiTooltip>
      }
    >
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      <HostsBody
        usage={usage}
        isFirstLoad={isFirstLoad}
        listRef={listRef}
        isExpanded={isExpanded}
        onToggle={toggle}
      />
    </Subpage>
  )
}
