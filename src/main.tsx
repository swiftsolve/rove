import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

import { installTauriBridge, isTauri } from '@/bridge/tauriNetworkApi'

if (isTauri()) {
  installTauriBridge()
} else if (import.meta.env.DEV) {
  // Plain browser (Vite dev server): stand in a mock bridge for design work.
  const { installMockNetworkApiIfNeeded } = await import('./dev/mockNetworkApi')
  installMockNetworkApiIfNeeded()
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
