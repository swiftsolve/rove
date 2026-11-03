import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { usePresence } from './usePresence'

const EXIT_MS = 200

describe('usePresence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('mounts as soon as it turns active', () => {
    const { result, rerender } = renderHook(({ isActive }) => usePresence(isActive, EXIT_MS), {
      initialProps: { isActive: false },
    })
    expect(result.current).toBe(false)
    rerender({ isActive: true })
    expect(result.current).toBe(true)
  })

  it('stays mounted through the exit, and unmounts after it', () => {
    const { result, rerender } = renderHook(({ isActive }) => usePresence(isActive, EXIT_MS), {
      initialProps: { isActive: true },
    })
    rerender({ isActive: false })
    act(() => {
      vi.advanceTimersByTime(EXIT_MS - 1)
    })
    expect(result.current).toBe(true)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe(false)
  })

  it('stays mounted when it turns active again before the exit ends', () => {
    const { result, rerender } = renderHook(({ isActive }) => usePresence(isActive, EXIT_MS), {
      initialProps: { isActive: true },
    })
    rerender({ isActive: false })
    act(() => {
      vi.advanceTimersByTime(EXIT_MS / 2)
    })
    rerender({ isActive: true })
    act(() => {
      vi.advanceTimersByTime(EXIT_MS * 2)
    })
    expect(result.current).toBe(true)
  })
})
