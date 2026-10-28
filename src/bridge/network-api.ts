import type { NetworkAPI } from '@/types'

/**
 * The installed backend bridge, or a friendly throw if none is present. The
 * plain web build (`build:web`) ships without a bridge, and the Tauri bridge
 * is installed before render — so this only throws in genuinely broken states.
 * Use it where the caller already runs inside a try/catch; guard with
 * `window.networkAPI?.` where a missing bridge is an expected, silent no-op.
 */
export function getNetworkApi(): NetworkAPI {
  const api = window.networkAPI
  if (!api) {
    throw new Error('Unable to connect to the app backend. Try restarting the application.')
  }
  return api
}
