import { useState } from 'react'
import { isConnectedNetwork } from '@shared/types'
import { useNetworkInfo } from './hooks/useNetworkInfo'
import { useNetworkInterfaces } from './hooks/useNetworkInterfaces'
import { useDevices } from './hooks/useDevices'
import { useDataUsage } from './hooks/useDataUsage'
import { useDiagnostics } from './hooks/useDiagnostics'
import { CloseIcon, MinimizeIcon, WifiIcon } from './components/Icons'
import TabBar from './components/TabBar'
import HomeView from './views/HomeView'
import InterfacesView from './views/InterfacesView'
import DevicesView from './views/DevicesView'
import UsageView from './views/UsageView'
import DiagnosticsView from './views/DiagnosticsView'
import { formatConnectionType } from './utils/format'
import type { AppTab } from './navigation/tabs'
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
      {!error && <div className="spinner" />}
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
    <header className="status-bar">
      <div className="status-bar-left">
        <div className="status-bar-brand">
          <span className="brand-mark" aria-hidden>
            <WifiIcon size={14} />
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
  const { info, error, isLoading, refresh } = useNetworkInfo()

  const isConnected = info ? isConnectedNetwork(info) : false
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
  } = useDevices(activeTab === 'devices')
  const { usage, isLoading: usageLoading } = useDataUsage(activeTab === 'usage')
  const {
    diagnostics,
    isRunning: diagnosticsRunning,
    error: diagnosticsError,
    run: runDiagnostics,
  } = useDiagnostics(activeTab === 'diagnostics')

  if (!info) {
    return (
      <LoadingScreen
        error={isLoading ? null : error}
        onRetry={() => void refresh()}
      />
    )
  }

  const statusLabel = isConnected ? formatConnectionType(info.connectionType) : 'Offline'

  return (
    <div className="app-shell">
      <StatusBar connected={isConnected} label={statusLabel} />

      <div className="app-lower">
        <TabBar activeTab={activeTab} onChange={setActiveTab} />

        <div className="app-col">
          <div className="app">
            <section className="app-scroll" aria-label="Main content">
            {error && <div className="error-banner">{error}</div>}

            <main className="app-main">
              {activeTab === 'home' && <HomeView info={info} />}

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

              {activeTab === 'usage' && <UsageView usage={usage} isLoading={usageLoading} />}

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
