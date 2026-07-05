import React from 'react'
import { createRoot } from 'react-dom/client'
import { invoke } from '@tauri-apps/api/core'
import App from './App'
import './index.css'

import { installTauriBridge, isTauri } from '@/bridge/tauriNetworkApi'
import { migrateLegacySpeedHistory } from '@/components/speed-test/speed-history'

// TEMP DIAGNOSTIC: forward any early JS error to the backend terminal and make
// it visible on-screen instead of rendering a blank window.
function reportDiag(msg: string): void {
  try {
    void invoke('__diag', { msg })
  } catch {
    /* not in Tauri */
  }
}
window.addEventListener('error', (e) =>
  reportDiag(`error: ${e.message} @ ${e.filename}:${e.lineno} :: ${e.error?.stack ?? ''}`),
)
window.addEventListener('unhandledrejection', (e) => reportDiag(`rejection: ${String(e.reason)}`))

if (isTauri()) {
  installTauriBridge()
} else if (import.meta.env.DEV) {
  // Plain browser (Vite dev server): stand in a mock bridge for design work.
  const { installMockNetworkApiIfNeeded } = await import('./dev/mockNetworkApi')
  installMockNetworkApiIfNeeded()
}

// Move any speed-test history left in localStorage into the database, once.
void migrateLegacySpeedHistory()

class DiagBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error) {
    reportDiag(`render threw: ${error.message} :: ${error.stack ?? ''}`)
  }
  render() {
    if (this.state.error) {
      return (
        <pre
          style={{
            color: '#fff',
            padding: 8,
            margin: 0,
            font: '11px monospace',
            whiteSpace: 'pre-wrap',
          }}
        >
          {`RENDER ERROR:\n${this.state.error.message}\n${this.state.error.stack ?? ''}`}
        </pre>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DiagBoundary>
      <App />
    </DiagBoundary>
  </React.StrictMode>,
)
