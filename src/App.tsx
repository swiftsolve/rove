import { useEffect, useRef, useState } from 'react'
import { checkForUpdates, type PendingUpdate } from '@/lib/updater'
import { getLinkCapacityMbps, isConnectedNetwork, type InternetStatus } from '@/types'
import { useNetworkInfo } from '@/hooks/useNetworkInfo'
import { useLiveThroughputSource } from '@/hooks/useLiveThroughput'
import { usePageVisible } from '@/hooks/usePageVisible'
import { useNetworkInterfaces } from '@/hooks/useNetworkInterfaces'
import { useDevices } from '@/hooks/useDevices'
import { useNetworkEvents } from '@/hooks/useNetworkEvents'
import { useDataUsage } from '@/hooks/useDataUsage'
import { useAppUsage } from '@/hooks/useAppUsage'
import { useHostUsage } from '@/hooks/useHostUsage'
import { useTrafficUsage } from '@/hooks/useTrafficUsage'
import { useDiagnostics } from '@/hooks/useDiagnostics'
import { useServiceReachability } from '@/hooks/useServiceReachability'
import { useInternetStatus } from '@/hooks/useInternetStatus'
import { AlertIcon, BrandIcon, CloseIcon, MinimizeIcon, OfflineIcon, RefreshIcon } from '@/components/ui/Icons'
import TabBar from '@/components/ui/TabBar'
import UpdateDialog from '@/components/ui/UpdateDialog'
import { Spinner } from '@/components/ui/Spinner'
import HomeView from '@/views/HomeView'
import SpeedView from '@/views/SpeedView'
import InterfacesView from '@/views/InterfacesView'
import DevicesView from '@/views/DevicesView'
import EventsView from '@/views/EventsView'
import UsageView from '@/views/UsageView'
import AppUsageView from '@/views/AppUsageView'
import HostsView from '@/views/HostsView'
import TrafficView from '@/views/TrafficView'
import DiagnosticsView from '@/views/DiagnosticsView'
import { ManageServicesPage } from '@/components/diagnostics/ManageServicesPage'
import { ServicesTimelinePage } from '@/components/diagnostics/ServicesTimelinePage'
import { recordLatency } from '@/components/diagnostics/service-latency'
import SettingsView from '@/views/SettingsView'
import AboutView from '@/views/AboutView'
import { formatConnectionType } from '@/lib/format'
import { IS_MAC } from '@/lib/platform'
import { locationKey, useNavigation } from '@/navigation/useNavigation'
import { getSetting, useSetting } from '@/hooks/useSetting'
import { useTheme } from '@/hooks/useTheme'
import './App.css'

interface NetworkErrorInfo {
  kind: 'timeout' | 'backend' | 'offline'
  title: string
  hint: string
}

// Turn a raw error string into a title + plain-language hint so a stalled
// detection reads as a recoverable state, not a cryptic red line. A timeout in
// particular isn't the same as "no network" — the connection may be fine while
// the OS query is just slow — so it gets its own, calmer framing.
function describeNetworkError(message: string): NetworkErrorInfo {
  if (/timed out/i.test(message)) {
    return {
      kind: 'timeout',
      title: 'Network detection is taking too long',
      hint: 'This is usually temporary. Make sure you’re connected, then try again.',
    }
  }
  if (/backend|restart/i.test(message)) {
    return { kind: 'backend', title: 'Can’t reach the app', hint: message }
  }
  return { kind: 'offline', title: 'Can’t reach your network', hint: message }
}

function NetworkErrorIcon({ kind, size }: { kind: NetworkErrorInfo['kind']; size: number }): JSX.Element {
  return kind === 'offline' ? <OfflineIcon size={size} /> : <AlertIcon size={size} />
}

function LoadingScreen({
  error,
  onRetry,
}: {
  error: string | null
  onRetry: () => void
}): JSX.Element {
  const info = error ? describeNetworkError(error) : null

  // A slow OS query is "still detecting", not a failure. The hook already
  // re-runs on a 15s poll and on routing-table changes, so keep the spinner
  // and skip the retry button — there's nothing for the user to do but wait.
  if (!info || info.kind === 'timeout') {
    return (
      <div className="loading-screen">
        <Spinner />
        <p>Looking for your network…</p>
        {info && <p className="loading-screen-slow">This is taking longer than usual.</p>}
      </div>
    )
  }

  const { kind, title, hint } = info
  return (
    <div className="loading-screen loading-screen-error" role="alert">
      <span className="loading-screen-icon" aria-hidden>
        <NetworkErrorIcon kind={kind} size={24} />
      </span>
      <div className="loading-screen-text">
        <p className="loading-screen-title">{title}</p>
        <p className="loading-screen-msg">{hint}</p>
      </div>
      <button type="button" className="btn-secondary loading-screen-retry" onClick={onRetry}>
        <RefreshIcon size={14} />
        Try again
      </button>
    </div>
  )
}

// The compact counterpart to LoadingScreen: shown when a background refresh
// fails while we already have network info on screen. It stays actionable
// (retry + dismiss) instead of leaving a dead red bar the user can't clear.
function ErrorBanner({
  error,
  onRetry,
  onDismiss,
}: {
  error: string
  onRetry: () => void
  onDismiss: () => void
}): JSX.Element {
  const { kind, title } = describeNetworkError(error)
  return (
    <div className="error-banner" role="alert">
      <span className="error-banner-icon" aria-hidden>
        <NetworkErrorIcon kind={kind} size={16} />
      </span>
      <span className="error-banner-text">{title}</span>
      <button type="button" className="error-banner-action" onClick={onRetry}>
        <RefreshIcon size={13} />
        Retry
      </button>
      <button
        type="button"
        className="btn-icon error-banner-dismiss"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        <CloseIcon size={13} />
      </button>
    </div>
  )
}

// Kept out of the Tab order, like a native title bar: otherwise the first Tab
// lands on Minimize/Close at the top-right instead of the nav rail, and a stray
// Enter closes the window.
function WindowControls(): JSX.Element {
  const controls = window.windowControls
  if (!controls) return <></>

  return (
    <div className="win-controls">
      <button
        type="button"
        className="win-btn"
        onClick={() => controls.minimize()}
        aria-label="Minimize"
        tabIndex={-1}
      >
        <MinimizeIcon size={15} />
      </button>
      <button
        type="button"
        className="win-btn win-btn-close"
        onClick={() => controls.close()}
        aria-label="Close"
        tabIndex={-1}
      >
        <CloseIcon size={15} />
      </button>
    </div>
  )
}

// Top-bar connectivity state. 'on' = a link that reaches the internet; 'bad' =
// a link is up but the public internet is unreachable (ISP outage, or a bridge
// with no WAN route); 'off' = no usable link at all.
type StatusTone = 'on' | 'bad' | 'off'

function StatusBar({
  tone,
  label,
}: {
  tone: StatusTone
  label: string
}): JSX.Element {
  return (
    <header className="status-bar" data-tauri-drag-region>
      <div className="status-bar-left">
        <div className="status-bar-brand">
          <span className="status-bar-logo" aria-hidden>
            <BrandIcon size={22} />
          </span>
          <span className="brand-name">Rove</span>
        </div>
        <span className={`text-meta-strong status-bar-link ${tone === 'off' ? '' : tone}`}>
          <span className="status-bar-dot" aria-hidden />
          {label}
        </span>
      </div>
      <WindowControls />
    </header>
  )
}

export default function App(): JSX.Element {
  const { location, navigate, back } = useNavigation()
  const activeTab = location.tab
  // Whether the Home summary keeps its connected-device count warm (Settings).
  const [isHomeDeviceScanEnabled] = useSetting('homeDeviceScan', true)
  // Colour theme — the nav rail's toggle flips it and Settings picks dark / light
  // / system. The hook resolves the preference to a light boolean and mirrors it
  // onto the document element as a class so index.css can remap its design tokens.
  const { mode: themeMode, isLight: isLightMode, setMode: setThemeMode, toggle: toggleTheme } = useTheme()
  const screenKey = locationKey(location)
  const [pendingUpdate, setPendingUpdate] = useState<PendingUpdate | null>(null)
  const scrollRef = useRef<HTMLElement>(null)
  const mainRef = useRef<HTMLElement>(null)
  const { info, error, isLoading, refresh, setError } = useNetworkInfo()
  const isWindowVisible = usePageVisible()

  // Reset scroll to the top whenever the screen changes (tab or subpage), so a
  // new page never inherits the previous page's scroll position.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [screenKey])

  // On every screen change after the first, move focus to the new page's h1 (or
  // the main region if the page has none yet, e.g. still loading). This is the
  // standard SPA route-change pattern: screen readers announce the new page, and
  // the next Tab enters its content instead of walking the rest of the nav rail.
  const firstScreenRef = useRef(true)
  useEffect(() => {
    if (firstScreenRef.current) {
      firstScreenRef.current = false
      return
    }
    const main = mainRef.current
    if (!main) return
    const target = main.querySelector<HTMLElement>('h1') ?? main
    target.tabIndex = -1
    target.focus({ preventScroll: true })
  }, [screenKey])

  // Check for a newer signed release once, shortly after launch — unless the
  // user has turned off automatic checks in Settings. If one is found, surface
  // it via a non-blocking modal (never window.confirm, which freezes the webview
  // on Linux/WebKitGTK).
  useEffect(() => {
    if (!getSetting('autoUpdate', true)) return
    void checkForUpdates().then(setPendingUpdate)
  }, [])

  const isConnected = info ? isConnectedNetwork(info) : false
  // Public-internet reachability from the always-on background heartbeat, kept
  // separate from the local link above: the link can be up while the WAN is
  // unreachable (an ISP outage, or a bridge interface with no route out).
  const internet = useInternetStatus()
  // Own the live-throughput feed for the whole app, not per-view: keep sampling
  // the 60 s history while the window is visible (across every tab) so the Home
  // chart is already current on return instead of resuming a stale snapshot.
  useLiveThroughputSource(isWindowVisible)
  // Identity of the current network — when it changes, tab data caches keyed on
  // it are invalidated so we never show the previous network's devices/results.
  const networkKey = info ? `${info.interfaceName ?? ''}|${info.ipAddress ?? ''}` : null
  const {
    interfaces,
    isLoading: areInterfacesLoading,
    error: interfacesError,
    refresh: refreshInterfaces,
  } = useNetworkInterfaces(activeTab === 'interfaces')
  const {
    scan: deviceScan,
    isScanning: isScanningDevices,
    error: devicesError,
    rescan: rescanDevices,
    // On macOS, don't auto-scan when Home loads — device discovery needs the
    // Local Network permission, so we wait until the user opens Devices or taps
    // Scan on the Home widget. Elsewhere, warm the count on Home as before.
  } = useDevices(
    activeTab === 'devices' || (activeTab === 'home' && !IS_MAC && isHomeDeviceScanEnabled),
    networkKey,
  )
  const { usage, isLoading: isUsageLoading, error: usageError } = useDataUsage(
    activeTab === 'usage' || activeTab === 'home',
  )
  const {
    usage: appUsage,
    isLoading: isAppUsageLoading,
    error: appUsageError,
  } = useAppUsage(activeTab === 'apps')
  const {
    usage: hostUsage,
    isLoading: isHostUsageLoading,
    error: hostUsageError,
  } = useHostUsage(activeTab === 'apps' && location.appsSub?.view === 'hosts')
  const {
    usage: trafficUsage,
    isLoading: isTrafficUsageLoading,
    error: trafficUsageError,
  } = useTrafficUsage(activeTab === 'apps' && location.appsSub?.view === 'traffic')
  const deviceCount = deviceScan ? deviceScan.devices.length : null
  const deviceOnline = deviceScan
    ? deviceScan.devices.filter((device) => device.isReachable).length
    : null
  // The change feed is a cheap DB read (populated as a side effect of scans), so
  // keep it enabled whenever the Events tab is open; it also polls quietly.
  const {
    events,
    isLoading: areEventsLoading,
    error: eventsError,
    reload: reloadEvents,
  } = useNetworkEvents(activeTab === 'events')
  // A scan is what generates new events, so pull the feed the moment one
  // finishes (isScanningDevices true→false) rather than waiting on the poll.
  const wasScanningRef = useRef(false)
  useEffect(() => {
    if (wasScanningRef.current && !isScanningDevices) void reloadEvents()
    wasScanningRef.current = isScanningDevices
  }, [isScanningDevices, reloadEvents])
  const {
    diagnostics,
    isRunning: areDiagnosticsRunning,
    error: diagnosticsError,
    run: runDiagnostics,
  } = useDiagnostics(activeTab === 'diagnostics', networkKey)

  // Service reachability rides its own probe now, independent of the Connection
  // diagnostics — opening the Connection view no longer probes the user's
  // services. It runs while the Services tab is open (either subview).
  const {
    report: servicesReport,
    run: runServices,
  } = useServiceReachability(activeTab === 'services', networkKey)

  // Record per-host latency from each probe so the Services page sparklines
  // accrue while the tab is open. The outage *timeline* is not recorded here —
  // that's the backend heartbeat's job (see `spawn_services_heartbeat`), so it
  // keeps accruing with this tab, and the window, closed.
  //
  // The internet status is passed through: when this machine is offline every
  // service probe fails at once, which isn't the services' fault. It's paired
  // with the probes from the same batch (see `ServicesReport`) so the two never
  // disagree about that window.
  // When the live internet status flips (lost or restored), re-probe right away
  // rather than waiting out the poll, so the rows catch up with the header and
  // title bar within a second instead of showing the previous batch's verdict.
  // The first verdict after launch isn't a flip — the tab's own fetch covers it.
  const lastInternetRef = useRef(internet)
  useEffect(() => {
    const previous = lastInternetRef.current
    lastInternetRef.current = internet
    if (previous !== null && previous !== internet && activeTab === 'services') {
      void runServices()
    }
  }, [internet, activeTab, runServices])

  const svcServices = servicesReport?.services
  const svcInternet = servicesReport?.internet
  useEffect(() => {
    if (svcServices) recordLatency(svcServices, svcInternet)
  }, [svcServices, svcInternet])

  // Home and Speed can't render without network info; the other tabs can.
  // Show the loading/error state only in the content area (not full-screen) so
  // the window chrome and tabs stay usable even before info arrives.
  const needsInfo = activeTab === 'home' || activeTab === 'speed'
  // The top-bar connectivity summary layers WAN reachability over the local
  // link: a live link with a dead WAN reads "No internet" (red) rather than
  // masquerading as connected; only a link that reaches the internet is "on".
  // `internet` is null until the first heartbeat lands — treat that as fine so
  // the bar doesn't flash a false outage on launch.
  const isInternetDown = isConnected && (internet === 'noInternet' || internet === 'offline')
  const statusTone: StatusTone = !isConnected ? 'off' : isInternetDown ? 'bad' : 'on'
  const statusLabel = !info
    ? 'Connecting…'
    : !isConnected
      ? 'Offline'
      : isInternetDown
        ? 'No internet'
        : formatConnectionType(info.connectionType)
  // The same verdict the title bar shows, for the Services headers — one source
  // of truth, so the page can't say "No internet" while the bar says Wi-Fi (or
  // the reverse) between service probe batches. Undefined while still connecting.
  const liveInternet: InternetStatus | undefined = !info
    ? undefined
    : !isConnected
      ? 'offline'
      : isInternetDown
        ? (internet ?? undefined)
        : 'online'

  return (
    <div className="app-shell">
      {pendingUpdate && (
        <UpdateDialog update={pendingUpdate} onDismiss={() => setPendingUpdate(null)} />
      )}
      <StatusBar tone={statusTone} label={statusLabel} />

      <div className="app-lower">
        <TabBar
          activeTab={activeTab}
          onChange={(tab) => navigate({ tab, speedSub: null })}
          isLightMode={isLightMode}
          onToggleTheme={toggleTheme}
        />

        <div className="app-col">
          <div className="app">
            <section ref={scrollRef} className="app-scroll" aria-label="Main content">
            {error && info && (
              <ErrorBanner
                error={error}
                onRetry={() => void refresh()}
                onDismiss={() => setError(null)}
              />
            )}

            <main ref={mainRef} className="app-main">
              {!info && needsInfo && (
                <LoadingScreen error={isLoading ? null : error} onRetry={() => void refresh()} />
              )}

              {info && activeTab === 'home' && (
                <HomeView
                  info={info}
                  usage={usage}
                  isUsageLoading={isUsageLoading}
                  deviceCount={deviceCount}
                  deviceOnline={deviceOnline}
                  areDevicesLoading={isScanningDevices}
                  // On macOS the Home widget offers a Scan button in place of an
                  // auto-scan; wiring it lets the count populate without leaving Home.
                  onScanDevices={IS_MAC ? () => void rescanDevices() : undefined}
                  onOpenCapabilities={(capabilityId) =>
                    navigate({
                      tab: 'speed',
                      speedSub: { view: 'details', target: capabilityId },
                    })
                  }
                  onRunSpeedTest={() => navigate({ tab: 'speed', speedSub: null })}
                  onOpenSpeed={() => navigate({ tab: 'speed', speedSub: null })}
                  onOpenUsage={() => navigate({ tab: 'usage', speedSub: null })}
                  onOpenDevices={() => navigate({ tab: 'devices', speedSub: null })}
                />
              )}

              {info && activeTab === 'speed' && (
                <SpeedView
                  info={info}
                  sub={location.speedSub}
                  onOpenDetails={(target) =>
                    navigate({ tab: 'speed', speedSub: { view: 'details', target } })
                  }
                  onOpenHistory={() =>
                    navigate({ tab: 'speed', speedSub: { view: 'history' } })
                  }
                  onBack={back}
                />
              )}

              {activeTab === 'interfaces' && (
                <InterfacesView
                  interfaces={interfaces}
                  isLoading={areInterfacesLoading}
                  error={interfacesError}
                  onRefresh={() => void refreshInterfaces()}
                />
              )}

              {activeTab === 'devices' && (
                <DevicesView
                  scan={deviceScan}
                  isScanning={isScanningDevices}
                  error={devicesError}
                  onRescan={() => void rescanDevices()}
                />
              )}

              {activeTab === 'events' && (
                <EventsView
                  events={events}
                  isLoading={areEventsLoading}
                  isScanning={isScanningDevices}
                  error={eventsError}
                  onRefresh={() => void rescanDevices()}
                />
              )}

              {activeTab === 'usage' && (
                <UsageView usage={usage} isLoading={isUsageLoading} error={usageError} />
              )}

              {activeTab === 'apps' &&
                (location.appsSub?.view === 'hosts' ? (
                  <HostsView
                    usage={hostUsage}
                    isLoading={isHostUsageLoading}
                    error={hostUsageError}
                    focusApp={location.appsSub.app ?? null}
                    onBack={back}
                  />
                ) : location.appsSub?.view === 'traffic' ? (
                  <TrafficView
                    usage={trafficUsage}
                    isLoading={isTrafficUsageLoading}
                    error={trafficUsageError}
                    onBack={back}
                  />
                ) : (
                  <AppUsageView
                    usage={appUsage}
                    isLoading={isAppUsageLoading}
                    error={appUsageError}
                    onViewHosts={() =>
                      navigate({ tab: 'apps', speedSub: null, appsSub: { view: 'hosts' } })
                    }
                    onViewTraffic={() =>
                      navigate({ tab: 'apps', speedSub: null, appsSub: { view: 'traffic' } })
                    }
                    onOpenApp={(name) =>
                      navigate({ tab: 'apps', speedSub: null, appsSub: { view: 'hosts', app: name } })
                    }
                  />
                ))}

              {activeTab === 'diagnostics' && (
                <DiagnosticsView
                  diagnostics={diagnostics}
                  linkSpeedMbps={info ? getLinkCapacityMbps(info) : null}
                  isRunning={areDiagnosticsRunning}
                  error={diagnosticsError}
                  onRun={() => void runDiagnostics()}
                />
              )}

              {activeTab === 'services' &&
                (location.servicesSub?.view === 'timeline' ? (
                  <ServicesTimelinePage
                    reachability={servicesReport?.services}
                    internet={liveInternet}
                    onBack={back}
                  />
                ) : (
                  <ManageServicesPage
                    reachability={servicesReport?.services}
                    internet={servicesReport?.internet}
                    liveInternet={liveInternet}
                    onRefresh={() => void runServices()}
                    onTimeline={() =>
                      navigate({ tab: 'services', speedSub: null, servicesSub: { view: 'timeline' } })
                    }
                  />
                ))}

              {activeTab === 'settings' && (
                <SettingsView
                  themeMode={themeMode}
                  onThemeModeChange={setThemeMode}
                  onOpenAbout={() => navigate({ tab: 'about', speedSub: null })}
                />
              )}

              {activeTab === 'about' && <AboutView />}
            </main>
          </section>
        </div>
        </div>
      </div>
    </div>
  )
}
