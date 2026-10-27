// First, so the cascade layers are declared before any CSS uses them.
import '@/styles/tailwind.css'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/App'
import '@swiftsolve/rove-design/tokens.css'
import './index.css'

import { installTauriBridge, isTauri } from '@/bridge/tauriNetworkApi'
import { AppErrorBoundary } from '@/app/components/AppErrorBoundary'
import { migrateLegacySpeedHistory } from '@/features/speed/utils/speed-history'

if (isTauri()) {
  installTauriBridge()
} else if (import.meta.env.DEV) {
  // Plain browser (Vite dev server): stand in a mock bridge for design work.
  const { installMockNetworkApiIfNeeded } = await import('./dev/mockNetworkApi')
  installMockNetworkApiIfNeeded()
}

// Move any speed-test history left in localStorage into the database, once.
void migrateLegacySpeedHistory()

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
)
