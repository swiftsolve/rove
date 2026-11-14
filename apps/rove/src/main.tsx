// First, so the cascade layers are declared before any CSS uses them. It
// brings in the tokens and every global stylesheet.
import '@/app.css'

import React from 'react'
import { createRoot } from 'react-dom/client'

import { App } from '@/app/App'
import { AppErrorBoundary } from '@/app/components/AppErrorBoundary'
import { isStoredThemeLight } from '@/app/utils/theme-mode'
import { installTauriBridge, isTauri } from '@/bridge/tauri-network-api'

if (isTauri()) {
  installTauriBridge()
} else if (import.meta.env.DEV) {
  // The Vite dev server in a plain browser gets a mock bridge for design work.
  const { installMockNetworkApiIfNeeded } = await import('./bridge/mock-network-api')
  installMockNetworkApiIfNeeded()
}

// The stored theme, before the first paint: a light-theme user never sees a dark frame.
document.documentElement.classList.toggle('theme-light', isStoredThemeLight())

const root = document.getElementById('root')
if (!root) throw new Error('index.html has no #root element.')

createRoot(root).render(
  <React.StrictMode>
    <AppErrorBoundary isApp>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
)
