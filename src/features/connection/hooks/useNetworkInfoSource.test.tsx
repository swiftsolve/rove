import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { queryClient } from '@/app/utils/query-client'
import type { NetworkAPI, NetworkInfo } from '@/types'

import { useNetworkInfoSource } from './useNetworkInfoSource'

const INFO = { connectionType: 'ethernet', interfaceName: 'eth0', isConnected: true } as NetworkInfo

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

describe('useNetworkInfoSource', () => {
  it('shows the first reading once it lands', async () => {
    installApi({ getNetworkInfo: () => Promise.resolve(INFO) })
    const { result } = renderHook(() => useNetworkInfoSource(), { wrapper })
    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.info).toEqual(INFO))
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('reports a failed first read at once', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    installApi({ getNetworkInfo: () => Promise.reject(new Error('No route')) })
    const { result } = renderHook(() => useNetworkInfoSource(), { wrapper })
    await waitFor(() => expect(result.current.error).toEqual({ kind: 'offline', message: 'No route' }))
    expect(result.current.isLoading).toBe(false)
    expect(result.current.lastReadAt).toBeNull()
  })

  it('keeps a good reading through two failed polls and reports the third', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const getNetworkInfo = vi.fn<NetworkAPI['getNetworkInfo']>().mockResolvedValueOnce(INFO)
    getNetworkInfo.mockRejectedValue(new Error('No route'))
    installApi({ getNetworkInfo })
    const { result } = renderHook(() => useNetworkInfoSource(), { wrapper })
    await waitFor(() => expect(result.current.info).toEqual(INFO))

    await act(() => vi.advanceTimersByTimeAsync(15_000))
    await act(() => vi.advanceTimersByTimeAsync(15_000))
    expect(getNetworkInfo).toHaveBeenCalledTimes(3)
    expect(result.current.error).toBeNull()

    await act(() => vi.advanceTimersByTimeAsync(15_000))
    expect(getNetworkInfo).toHaveBeenCalledTimes(4)
    expect(result.current.error?.kind).toBe('offline')
    expect(result.current.info).toEqual(INFO)
    expect(result.current.lastReadAt).not.toBeNull()
  })

  it('keeps the same object when a poll reads the same thing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    installApi({ getNetworkInfo: () => Promise.resolve({ ...INFO }) })
    const { result } = renderHook(() => useNetworkInfoSource(), { wrapper })
    await waitFor(() => expect(result.current.info).toEqual(INFO))
    const first = result.current.info
    await act(() => vi.advanceTimersByTimeAsync(15_000))
    expect(result.current.info).toBe(first)
  })

  it('reports a missing bridge without reading', () => {
    const { result } = renderHook(() => useNetworkInfoSource(), { wrapper })
    expect(result.current.error?.kind).toBe('backend')
    expect(result.current.isLoading).toBe(false)
  })
})
