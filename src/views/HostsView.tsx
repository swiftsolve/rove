import { useEffect, useRef, useState } from 'react'
import type { AppHosts, HostConn, HostUsageSummary } from '@/types'
import { formatBytes } from '@/lib/format'
import { appDomain } from '@/lib/appDomain'
import { isPrivateIp } from '@/lib/ip'
import { countryCodeToFlag, countryCodeToName } from '@/lib/flag'
import { flashHighlight } from '@/lib/highlight'
import { Tooltip as UiTooltip } from '@/components/ui/Tooltip'
import Subpage from '@/components/ui/Subpage'
import { ServiceIcon } from '@/components/ui/ServiceIcon'
import { MarqueeText } from '@/components/ui/MarqueeText'
import { MetricValue } from '@/components/ui/MetricValue'
import { ChevronDownIcon, GlobeIcon, HelpIcon, InfoIcon, IpIcon } from '@/components/ui/Icons'
import DirectionIcon from '@/components/ui/DirectionIcon'
import { EmptyState } from '@/components/ui/EmptyState'
import { RestartAsAdminAction } from '@/components/ui/RestartAsAdminAction'
import { Spinner } from '@/components/ui/Spinner'
import './HostsView.css'

const HOST_USAGE_INFO_HINT =
  'The remote hosts each app has connected to, from the OS per-socket peer ' +
  'addresses. Hostnames come from reverse DNS and flags from an IP-geolocation ' +
  'lookup, both filled in shortly after a host is first seen. Bytes cover TCP ' +
  'connections only and reset when Rove restarts.'

const HOST_USAGE_EMPTY_HINT = 'Hosts appear here as your apps open connections.'

const HOST_USAGE_UNSUPPORTED_HINT =
  'Run Rove as administrator to attribute hosts to apps on Windows.'

/** One remote host beneath its app: flag + hostname on the left, the download /
 *  upload split on the right — the country flag sitting alongside the host. */
function HostRow({ host }: { readonly host: HostConn }): JSX.Element {
  const flag = countryCodeToFlag(host.countryCode)
  const country = countryCodeToName(host.countryCode)
  const label = host.host ?? host.ip
  // A peer on the user's own network (private/LAN address — no country flag).
  // These get a node-graph glyph rather than the globe: the globe reads as "out
  // on the internet", the opposite of a local address, and it explains an
  // otherwise odd router-supplied hostname like "mynetwork".
  const isLocal = !flag && isPrivateIp(host.ip)
  // Left-of-name glyph: the country flag when geolocated, else a LAN or globe
  // (public but unresolved) fallback.
  const glyph = flag ?? (
    isLocal ? (
      <IpIcon size={12} className="host-flag-fallback" />
    ) : (
      <GlobeIcon size={12} className="host-flag-fallback" />
    )
  )
  const flagGlyph = (
    <span
      className="host-flag"
      aria-hidden={flag || isLocal ? undefined : true}
      aria-label={flag && country ? country : isLocal ? 'On your network' : undefined}
    >
      {glyph}
    </span>
  )
  // Tooltip on the glyph: the country name when geolocated, a "local network"
  // hint for a LAN peer, else nothing.
  const glyphTip = flag && country ? country : isLocal ? 'On your network' : null
  return (
    <div className="host-row">
      <span className="host-row-id">
        {glyphTip ? (
          <UiTooltip content={glyphTip} placement="top" align="left">
            {flagGlyph}
          </UiTooltip>
        ) : (
          flagGlyph
        )}
        {/* Reveal the underlying IP in the styled tooltip (matching the flag's),
            but only once a hostname has resolved — when the label already is the
            IP there's nothing to add. Kept as one always-mounted tree (disabled
            rather than conditionally rendered) so the node survives the poll that
            fills the hostname in: remounting here would restart the name's
            marquee mid-scroll. */}
        <UiTooltip
          content={host.ip}
          placement="top"
          align="left"
          className="host-name-tip"
          disabled={!host.host}
        >
          <MarqueeText className="host-name" text={label} />
        </UiTooltip>
      </span>
      <span className="host-row-figures">
        <span className="host-figure">
          <DirectionIcon series="down" size={11} />
          <MetricValue value={host.rxBytes} level="num" format={formatBytes} />
        </span>
        <span className="host-figure">
          <DirectionIcon series="up" size={11} />
          <MetricValue value={host.txBytes} level="num" format={formatBytes} />
        </span>
      </span>
    </div>
  )
}

/** One app group: an icon + name header with the app's total, then its hosts. */
function AppGroup({
  app,
  expanded,
  onToggle,
}: {
  readonly app: AppHosts
  readonly expanded: boolean
  readonly onToggle: () => void
}): JSX.Element {
  const total = app.rxBytes + app.txBytes
  const count = app.hosts.length
  return (
    <div className="host-app" data-app={app.name}>
      <button
        type="button"
        className="host-app-header"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={`${app.name}, ${count} ${count === 1 ? 'host' : 'hosts'}`}
      >
        <span className="host-app-id">
          <ChevronDownIcon
            size={14}
            className={`host-app-chevron ${expanded ? 'open' : ''}`}
            aria-hidden
          />
          <ServiceIcon src={app.icon} host={appDomain(app.name)} name={app.name} />
          <span className="host-app-name" title={app.name}>
            {app.name}
          </span>
          <span className="host-app-count">{count}</span>
        </span>
        <MetricValue value={total} level="host-app-total num" format={formatBytes} />
      </button>
      {expanded && (
        <div className="host-app-hosts">
          {app.hosts.map((host) => (
            <HostRow key={host.ip} host={host} />
          ))}
        </div>
      )}
    </div>
  )
}

interface HostsViewProps {
  readonly usage: HostUsageSummary
  readonly isLoading: boolean
  readonly error?: string | null
  /** When set (arrived by clicking an app), open only this app's group and
   *  collapse the rest; when null, every group starts collapsed. */
  readonly focusApp?: string | null
  /** Return to the Apps list (the subpage's Back button). */
  readonly onBack: () => void
}

export default function HostsView({
  usage,
  isLoading,
  error,
  focusApp,
  onBack,
}: HostsViewProps): JSX.Element {
  const { apps, support } = usage
  const hasData = apps.length > 0

  // Which groups are expanded, by app name. Arriving via an app click opens that
  // one; arriving via "All hosts" opens none, leaving the list scannable rather
  // than dumping every host at once. Either way groups that appear on a later
  // poll stay collapsed. The view remounts on each navigation, so seeding from
  // `focusApp` here is enough.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() =>
    focusApp ? new Set([focusApp]) : new Set(),
  )
  const isExpanded = (name: string): boolean => expanded.has(name)
  const toggle = (name: string): void =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })

  // On arriving focused on an app, bring its group to the top of the list. Runs
  // when the data arrives (it lands a poll or two after mount), then just once —
  // later polls mustn't yank the scroll. Deferred a task so it lands *after* the
  // app's scroll-to-top-on-navigation reset (a sibling effect that would
  // otherwise clobber it). Scrolls the `.app-scroll` container directly rather
  // than scrollIntoView, which walks up and scrolls every ancestor — reaching
  // the host page when the app is embedded in an iframe (the marketing demo).
  const listRef = useRef<HTMLDivElement>(null)
  const scrolledRef = useRef(false)
  useEffect(() => {
    if (!focusApp || scrolledRef.current) return
    const group = listRef.current?.querySelector<HTMLElement>(
      `[data-app="${CSS.escape(focusApp)}"]`,
    )
    if (!group) return // data not in yet; a later poll re-runs this
    const id = setTimeout(() => {
      const scroller = group.closest<HTMLElement>('.app-scroll')
      if (!scroller) return
      const margin = parseFloat(getComputedStyle(group).scrollMarginTop) || 0
      const delta = group.getBoundingClientRect().top - scroller.getBoundingClientRect().top
      scroller.scrollTo({ top: scroller.scrollTop + delta - margin })
      flashHighlight(group)
      scrolledRef.current = true
    }, 0)
    return () => clearTimeout(id)
  }, [focusApp, apps])

  const subtitle =
    isLoading && !hasData ? 'Loading…' : 'Remote hosts by application, busiest first'

  return (
    <Subpage
      title="Hosts"
      description={subtitle}
      onBack={onBack}
      action={
        <UiTooltip content={HOST_USAGE_INFO_HINT}>
          <button
            type="button"
            className="btn-icon btn-icon-secondary"
            aria-label="About per-app hosts"
          >
            <HelpIcon size={16} />
          </button>
        </UiTooltip>
      }
    >
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      {support === 'unsupported' ? (
        <EmptyState
          icon={InfoIcon}
          title="Administrator access needed"
          hint={HOST_USAGE_UNSUPPORTED_HINT}
          action={<RestartAsAdminAction />}
        />
      ) : isLoading && !hasData ? (
        <div className="view-empty">
          <Spinner />
          <p className="text-muted">Measuring per-app hosts…</p>
        </div>
      ) : !hasData ? (
        <EmptyState icon={GlobeIcon} title="No hosts yet" hint={HOST_USAGE_EMPTY_HINT} />
      ) : (
        <div className="ui-section">
          <div className="ui-section-body host-list" ref={listRef}>
            {apps.map((app) => (
              <AppGroup
                key={app.name}
                app={app}
                expanded={isExpanded(app.name)}
                onToggle={() => toggle(app.name)}
              />
            ))}
          </div>
        </div>
      )}
    </Subpage>
  )
}
