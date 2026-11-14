import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { useHistoryNavigation } from './useHistoryNavigation'

/** A real history step, waiting for the popstate it fires. */
async function step(go: () => void): Promise<void> {
  const popped = new Promise((resolve) => window.addEventListener('popstate', resolve, { once: true }))
  act(go)
  await act(() => popped)
}

describe('useHistoryNavigation', () => {
  it('goes back through history after stepping back and forward again', async () => {
    const { result } = renderHook(() => useHistoryNavigation())
    act(() => result.current.navigate({ tab: 'speed' }))
    act(() => result.current.navigate({ tab: 'speed', speedSub: { view: 'history' } }))

    await step(() => window.history.back())
    await step(() => window.history.forward())
    expect(result.current.location).toEqual({ tab: 'speed', speedSub: { view: 'history' } })

    // Two entries of ours sit behind this one, so Back pops one rather than
    // replacing this entry with the parent.
    const length = window.history.length
    await step(() => result.current.back())
    await waitFor(() => expect(result.current.location).toEqual({ tab: 'speed' }))
    expect(window.history.length).toBe(length)
  })

  describe('in the desktop app', () => {
    afterEach(() => {
      Reflect.deleteProperty(window, '__TAURI_INTERNALS__')
    })

    it('steps back and forward with Alt+arrows, which Tauri’s webview leaves unmapped', async () => {
      Object.assign(window, { __TAURI_INTERNALS__: {} })
      const { result } = renderHook(() => useHistoryNavigation())
      act(() => result.current.navigate({ tab: 'speed' }))
      act(() => result.current.navigate({ tab: 'devices' }))

      await step(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true })))
      expect(result.current.location).toEqual({ tab: 'speed' })
      await step(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true })))
      expect(result.current.location).toEqual({ tab: 'devices' })
    })
  })
})
