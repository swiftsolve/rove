// First, so the cascade layers are declared before any CSS uses them. It
// brings in the tokens and every global stylesheet.
import '@/styles/tailwind.css'

import React from 'react'
import { createRoot } from 'react-dom/client'

import { App } from '@/app/App'
import { AppErrorBoundary } from '@/app/components/AppErrorBoundary'
import { installTauriBridge, isTauri } from '@/bridge/tauri-network-api'
import { migrateLegacySpeedHistory } from '@/features/speed/utils/speed-history'

if (isTauri()) {
  installTauriBridge()
} else if (import.meta.env.DEV) {
  // The Vite dev server in a plain browser gets a mock bridge for design work.
  const { installMockNetworkApiIfNeeded } = await import('./dev/mock-network-api')
  installMockNetworkApiIfNeeded()
}

// Move any speed-test history left in localStorage into the database, once.
void migrateLegacySpeedHistory()

const root = document.getElementById('root')
if (!root) throw new Error('index.html has no #root element.')

createRoot(root).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
)
