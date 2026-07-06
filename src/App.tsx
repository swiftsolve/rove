import { useEffect, useState } from 'react'
import { checkForUpdates, type PendingUpdate } from '@/lib/updater'
import { isConnectedNetwork } from '@/types'
import { useNetworkInfo } from '@/hooks/useNetworkInfo'
import { useNetworkInterfaces } from '@/hooks/useNetworkInterfaces'
import { useDevices } from '@/hooks/useDevices'
import { useDataUsage } from '@/hooks/useDataUsage'
import { useDiagnostics } from '@/hooks/useDiagnostics'
import { BrandIcon, CloseIcon, MinimizeIcon } from '@/components/ui/Icons'
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
import type { AppTab } from '@/navigation/tabs'
import './App.css'

function LoadingScreen({
  error,
  onRetry,
}: {
  readonly error: string | null
  readonly onRetry: () => void
}): JSX.Element {
  return (
    <div className="loading-screen">
      {!error && <Spinner />}
      <p>{error ?? 'Looking for your network…'}</p>
      {error && (
        <button type="button" className="btn-primary" onClick={onRetry}>
          Try again
        </button>
      )}
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
            <BrandIcon size={18} />
          </span>
          <span className="brand-name">Beacon</span>
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
  const [activeTab, setActiveTab] = useState<AppTab>('home')
  const [speedOpenDetails, setSpeedOpenDetails] = useState(false)
  const [pendingUpdate, setPendingUpdate] = useState<PendingUpdate | null>(null)
  const { info, error, isLoading, refresh } = useNetworkInfo()

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
  } = useDevices(activeTab === 'devices' || activeTab === 'home', networkKey)
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
        <TabBar activeTab={activeTab} onChange={setActiveTab} />

        <div className="app-col">
          <div className="app">
            <section className="app-scroll" aria-label="Main content">
            {error && info && <div className="error-banner">{error}</div>}

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
                  onOpenCapabilities={() => {
                    setSpeedOpenDetails(true)
                    setActiveTab('speed')
                  }}
                  onRunSpeedTest={() => setActiveTab('speed')}
                  onOpenUsage={() => setActiveTab('usage')}
                  onOpenDevices={() => setActiveTab('devices')}
                />
              )}

              {info && activeTab === 'speed' && (
                <SpeedView
                  info={info}
                  openDetailsInitially={speedOpenDetails}
                  onDetailsOpened={() => setSpeedOpenDetails(false)}
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
