import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { queryClient } from '@/app/utils/query-client'
import type { InternetStatus, NetworkAPI } from '@/types'

import { useInternetStatusSource } from './useInternetStatusSource'

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

function installApi(api: Partial<NetworkAPI>): void {
  window.networkAPI = { onNetworkChanged: () => () => undefined, ...api } as NetworkAPI
}

afterEach(() => {
  queryClient.clear()
  delete window.networkAPI
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useInternetStatusSource', () => {
  it('keeps a heartbeat that lands before the opening read', async () => {
    let resolveRead: (status: InternetStatus) => void = () => undefined
    let emit: (status: InternetStatus) => void = () => undefined
    installApi({
      getInternetStatus: () =>
        new Promise((resolve) => {
          resolveRead = resolve
        }),
      onInternetStatus: (callback) => {
        emit = callback
        return () => undefined
      },
    })
    const { result } = renderHook(() => useInternetStatusSource(), { wrapper })
    expect(result.current).toBeNull()

    act(() => emit('noInternet'))
    await waitFor(() => expect(result.current).toBe('noInternet'))
    await act(async () => {
      resolveRead('online')
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    expect(result.current).toBe('noInternet')
  })

  it('stays unknown when the opening read fails', async () => {
    const getInternetStatus = vi.fn<NetworkAPI['getInternetStatus']>().mockRejectedValue(new Error('down'))
    installApi({ getInternetStatus, onInternetStatus: () => () => undefined })
    const { result } = renderHook(() => useInternetStatusSource(), { wrapper })
    await waitFor(() => expect(getInternetStatus).toHaveBeenCalled())
    expect(result.current).toBeNull()
  })
})
