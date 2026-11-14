import type { NetworkAPI } from '@/types'

/** What a read says when there's no backend bridge to make it. */
export const NO_BACKEND_MESSAGE = 'Unable to connect to the app backend. Try restarting the application.'

/**
 * The installed backend bridge, or a throw if none is present. Use it inside a
 * try/catch; guard with `window.networkAPI?.` where a missing bridge (the plain
 * `build:web`) should be a silent no-op.
 */
export function getNetworkApi(): NetworkAPI {
  const api = window.networkAPI
  if (!api) throw new Error(NO_BACKEND_MESSAGE)
  return api
}
