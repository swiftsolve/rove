// First, so the cascade layers are declared before any CSS uses them. It
// brings in the tokens and every global stylesheet.
import '@/styles/tailwind.css'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/App'

import { installTauriBridge, isTauri } from '@/bridge/tauri-network-api'
import { AppErrorBoundary } from '@/app/components/AppErrorBoundary'
import { migrateLegacySpeedHistory } from '@/features/speed/utils/speed-history'

if (isTauri()) {
  installTauriBridge()
} else if (import.meta.env.DEV) {
  // Plain browser (Vite dev server): stand in a mock bridge for design work.
  const { installMockNetworkApiIfNeeded } = await import('./dev/mock-network-api')
  installMockNetworkApiIfNeeded()
}

const root = createRoot(document.getElementById('root')!)
const search = new URLSearchParams(window.location.search)

if (import.meta.env.DEV && search.has('gallery')) {
  // The UI library's gallery (`/?gallery`, `&theme=light` for Light), in place
  // of the app. Dev only, so the import never reaches a production build.
  if (search.get('theme') === 'light') document.documentElement.classList.add('theme-light')
  // The app is one window-sized screen; the gallery is a page that scrolls.
  for (const element of [document.documentElement, document.getElementById('root')!]) {
    element.style.height = 'auto'
    element.style.overflow = 'visible'
  }
  const { Gallery } = await import('@/ui/gallery/Gallery')
  root.render(
    <React.StrictMode>
      <Gallery />
    </React.StrictMode>,
  )
} else {
  // Move any speed-test history left in localStorage into the database, once.
  void migrateLegacySpeedHistory()

  root.render(
    <React.StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </React.StrictMode>,
  )
}
