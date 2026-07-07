import { useEffect, useRef, useState } from 'react'
import { checkForUpdates, type PendingUpdate } from '@/lib/updater'
import { isConnectedNetwork } from '@/types'
import { useNetworkInfo } from '@/hooks/useNetworkInfo'
import { useNetworkInterfaces } from '@/hooks/useNetworkInterfaces'
import { useDevices } from '@/hooks/useDevices'
import { useDataUsage } from '@/hooks/useDataUsage'
import { useDiagnostics } from '@/hooks/useDiagnostics'
import { AlertIcon, BrandIcon, CloseIcon, MinimizeIcon, OfflineIcon, RefreshIcon } from '@/components/ui/Icons'
import TabBar from '@/components/ui/TabBar'
import UpdateDialog from '@/components/ui/UpdateDialog'
import { Spinner } from '@/components/ui/Spinner'
import HomeView from '@/views/HomeView'
import SpeedView from '@/views/SpeedView'
import InterfacesView from '@/views/InterfacesView'
import DevicesView from '@/views/DevicesView'
import UsageView from '@/views/UsageView'
import DiagnosticsView from '@/views/DiagnosticsView'
import { formatConnectionType } from '@/lib/format'
import { IS_MAC } from '@/lib/platform'
import { locationKey, useNavigation } from '@/navigation/useNavigation'
import './App.css'

interface NetworkErrorInfo {
  readonly kind: 'timeout' | 'backend' | 'offline'
  readonly title: string
  readonly hint: string
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

function NetworkErrorIcon({ kind, size }: { readonly kind: NetworkErrorInfo['kind']; readonly size: number }): JSX.Element {
  return kind === 'offline' ? <OfflineIcon size={size} /> : <AlertIcon size={size} />
}

function LoadingScreen({
  error,
  onRetry,
}: {
  readonly error: string | null
  readonly onRetry: () => void
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
  readonly error: string
  readonly onRetry: () => void
  readonly onDismiss: () => void
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
      >
        <MinimizeIcon size={15} />
      </button>
      <button
        type="button"
        className="win-btn win-btn-close"
        onClick={() => controls.close()}
        aria-label="Close"
      >
        <CloseIcon size={15} />
      </button>
    </div>
  )
}

function StatusBar({
  connected,
  label,
}: {
  readonly connected: boolean
  readonly label: string
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
        <span className={`status-bar-link ${connected ? 'on' : ''}`}>
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
  const screenKey = locationKey(location)
  const [pendingUpdate, setPendingUpdate] = useState<PendingUpdate | null>(null)
  const scrollRef = useRef<HTMLElement>(null)
  const { info, error, isLoading, refresh, setError } = useNetworkInfo()

  // Reset scroll to the top whenever the screen changes (tab or subpage), so a
  // new page never inherits the previous page's scroll position.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [screenKey])

  // Check for a newer signed release once, shortly after launch. If one is
  // found, surface it via a non-blocking modal (never window.confirm, which
  // freezes the webview on Linux/WebKitGTK).
  useEffect(() => {
    void checkForUpdates().then(setPendingUpdate)
  }, [])

  const isConnected = info ? isConnectedNetwork(info) : false
  // Identity of the current network — when it changes, tab data caches keyed on
  // it are invalidated so we never show the previous network's devices/results.
  const networkKey = info ? `${info.interfaceName ?? ''}|${info.ipAddress ?? ''}` : null
  const {
    interfaces,
    isLoading: interfacesLoading,
    error: interfacesError,
    refresh: refreshInterfaces,
  } = useNetworkInterfaces(activeTab === 'interfaces')
  const {
    scan: deviceScan,
    isScanning: devicesScanning,
    error: devicesError,
    rescan: rescanDevices,
    // On macOS, don't auto-scan when Home loads — device discovery needs the
    // Local Network permission, so we wait until the user opens Devices or taps
    // Scan on the Home widget. Elsewhere, warm the count on Home as before.
  } = useDevices(activeTab === 'devices' || (activeTab === 'home' && !IS_MAC), networkKey)
  const { usage, isLoading: usageLoading, error: usageError } = useDataUsage(
    activeTab === 'usage' || activeTab === 'home',
  )
  const deviceCount = deviceScan ? deviceScan.devices.length : null
  const deviceOnline = deviceScan
    ? deviceScan.devices.filter((device) => device.reachable).length
    : null
  const {
    diagnostics,
    isRunning: diagnosticsRunning,
    error: diagnosticsError,
    run: runDiagnostics,
  } = useDiagnostics(activeTab === 'diagnostics', networkKey)

  // Home and Speed can't render without network info; the other tabs can.
  // Show the loading/error state only in the content area (not full-screen) so
  // the window chrome and tabs stay usable even before info arrives.
  const needsInfo = activeTab === 'home' || activeTab === 'speed'
  const statusLabel = !info ? 'Connecting…' : isConnected ? formatConnectionType(info.connectionType) : 'Offline'

  return (
    <div className="app-shell">
      {pendingUpdate && (
        <UpdateDialog update={pendingUpdate} onDismiss={() => setPendingUpdate(null)} />
      )}
      <StatusBar connected={isConnected} label={statusLabel} />

      <div className="app-lower">
        <TabBar
          activeTab={activeTab}
          onChange={(tab) => navigate({ tab, speedSub: null })}
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

            <main className="app-main">
              {!info && needsInfo && (
                <LoadingScreen error={isLoading ? null : error} onRetry={() => void refresh()} />
              )}

              {info && activeTab === 'home' && (
                <HomeView
                  info={info}
                  usage={usage}
                  usageLoading={usageLoading}
                  deviceCount={deviceCount}
                  deviceOnline={deviceOnline}
                  devicesLoading={devicesScanning}
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
                  isLoading={interfacesLoading}
                  error={interfacesError}
                  onRefresh={() => void refreshInterfaces()}
                />
              )}

              {activeTab === 'devices' && (
                <DevicesView
                  scan={deviceScan}
                  isScanning={devicesScanning}
                  error={devicesError}
                  onRescan={() => void rescanDevices()}
                />
              )}

              {activeTab === 'usage' && (
                <UsageView usage={usage} isLoading={usageLoading} error={usageError} />
              )}

              {activeTab === 'diagnostics' && (
                <DiagnosticsView
                  diagnostics={diagnostics}
                  isRunning={diagnosticsRunning}
                  error={diagnosticsError}
                  onRun={() => void runDiagnostics()}
                />
              )}
            </main>
          </section>
        </div>
        </div>
      </div>
    </div>
  )
}
