import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useCountUp } from './useCountUp'

function stubReducedMotion(isReduced: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: isReduced, media: query }))
}

// Runs animation frames until the ease settles, or gives up.
async function settle(): Promise<void> {
  for (let frame = 0; frame < 200; frame++) {
    await act(() => new Promise((resolve) => requestAnimationFrame(resolve)))
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useCountUp', () => {
  it('eases toward a new target and lands on it', async () => {
    stubReducedMotion(false)
    const { result, rerender } = renderHook(({ target }) => useCountUp(target), { initialProps: { target: 0 } })
    rerender({ target: 100 })
    await settle()
    expect(result.current).toBe(100)
  })

  it('snaps under reduced motion', async () => {
    stubReducedMotion(true)
    const { result, rerender } = renderHook(({ target }) => useCountUp(target), { initialProps: { target: 0 } })
    rerender({ target: 100 })
    await act(() => new Promise((resolve) => requestAnimationFrame(resolve)))
    expect(result.current).toBe(100)
  })

  it('recovers from a NaN reading once a real one comes back', async () => {
    stubReducedMotion(false)
    const { result, rerender } = renderHook(({ target }) => useCountUp(target), { initialProps: { target: 10 } })
    rerender({ target: Number.NaN })
    await act(() => new Promise((resolve) => requestAnimationFrame(resolve)))
    rerender({ target: 20 })
    await act(() => new Promise((resolve) => requestAnimationFrame(resolve)))
    expect(result.current).toBe(20)
  })
})
