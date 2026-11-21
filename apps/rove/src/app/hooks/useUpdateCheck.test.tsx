import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PendingUpdate } from '@/app/utils/updater'

const checkForUpdates = vi.fn<() => Promise<PendingUpdate | null>>()
vi.mock('@/app/utils/updater', () => ({ checkForUpdates: () => checkForUpdates() }))

function pendingUpdate(version: string): PendingUpdate {
  return { version, currentVersion: '0.1.0', notes: '', install: () => Promise.resolve() }
}

/** A fresh module each test, as the launch check is shared for the module's life. */
async function importHook() {
  vi.resetModules()
  return import('./useUpdateCheck')
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  checkForUpdates.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('useUpdateCheck', () => {
  it('offers an update found at launch', async () => {
    checkForUpdates.mockResolvedValue(pendingUpdate('0.2.0'))
    const { useUpdateCheck } = await importHook()
    const { result } = renderHook(() => useUpdateCheck())
    await waitFor(() => expect(result.current.pendingUpdate?.version).toBe('0.2.0'))
    expect(result.current.isDismissed).toBe(false)
  })

  it('finds a release published while Rove keeps running', async () => {
    checkForUpdates.mockResolvedValueOnce(null).mockResolvedValue(pendingUpdate('0.2.0'))
    const { useUpdateCheck, UPDATE_CHECK_INTERVAL_MS } = await importHook()
    const { result } = renderHook(() => useUpdateCheck())
    await waitFor(() => expect(checkForUpdates).toHaveBeenCalledTimes(1))
    expect(result.current.pendingUpdate).toBeNull()

    await act(() => vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS))
    expect(result.current.pendingUpdate?.version).toBe('0.2.0')
  })

  it('keeps a dismissed version away, and offers a newer one', async () => {
    checkForUpdates.mockResolvedValueOnce(pendingUpdate('0.2.0')).mockResolvedValueOnce(pendingUpdate('0.2.0'))
    checkForUpdates.mockResolvedValue(pendingUpdate('0.3.0'))
    const { useUpdateCheck, UPDATE_CHECK_INTERVAL_MS } = await importHook()
    const { result } = renderHook(() => useUpdateCheck())
    await waitFor(() => expect(result.current.pendingUpdate?.version).toBe('0.2.0'))

    act(() => result.current.dismissUpdate())
    expect(result.current.isDismissed).toBe(true)
    await act(() => vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS))
    expect(result.current.isDismissed).toBe(true)

    await act(() => vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS))
    expect(result.current.pendingUpdate?.version).toBe('0.3.0')
    expect(result.current.isDismissed).toBe(false)
  })

  it('stays quiet when a check fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    checkForUpdates.mockRejectedValue(new Error('offline'))
    const { useUpdateCheck } = await importHook()
    const { result } = renderHook(() => useUpdateCheck())
    await waitFor(() => expect(console.warn).toHaveBeenCalled())
    expect(result.current.pendingUpdate).toBeNull()
  })
})
