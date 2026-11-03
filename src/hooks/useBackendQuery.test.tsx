import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import { type ReactNode, StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { type BackendQuery, useBackendQuery } from './useBackendQuery'

let client: QueryClient

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  client.clear()
  vi.useRealTimers()
})

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

type Options = Partial<Parameters<typeof useBackendQuery<string>>[0]>

function useReading(options: Options = {}): BackendQuery<string> {
  return useBackendQuery({
    queryKey: ['reading'],
    queryFn: undefined,
    isEnabled: true,
    errorMessage: 'Failed',
    ...options,
  })
}

/** A queryFn whose calls each wait until the test settles them. */
function controlledRead() {
  const pending: { resolve: (value: string) => void; reject: (error: Error) => void }[] = []
  const queryFn = vi.fn(
    () =>
      new Promise<string>((resolve, reject) => {
        pending.push({ resolve, reject })
      }),
  )
  const settle = async (outcome: string | Error): Promise<void> => {
    const call = pending.shift()
    if (!call) throw new Error('No read in flight')
    await act(async () => {
      if (outcome instanceof Error) call.reject(outcome)
      else call.resolve(outcome)
      await Promise.resolve()
    })
  }
  return { queryFn, settle }
}

function Reader({ name, options }: { name: string; options: Options }) {
  const { data, isBusy, error } = useReading(options)
  return (
    <p>
      {name}: {isBusy ? 'busy' : (error ?? data ?? 'empty')}
    </p>
  )
}

describe('useBackendQuery', () => {
  it('is busy for the first load, then shows the data', async () => {
    const { queryFn, settle } = controlledRead()
    const { result } = renderHook(() => useReading({ queryFn }), { wrapper })
    expect(result.current.isBusy).toBe(true)
    await settle('first')
    await waitFor(() => expect(result.current.data).toBe('first'))
    expect(result.current.isBusy).toBe(false)
    expect(queryFn).toHaveBeenCalledTimes(1)
  })

  it('fetches nothing without a queryFn', () => {
    const { result } = renderHook(() => useReading(), { wrapper })
    expect(result.current.isBusy).toBe(false)
    expect(result.current.data).toBeUndefined()
  })

  it('polls quietly: never busy, and a failed poll keeps the data', async () => {
    const { queryFn, settle } = controlledRead()
    const { result } = renderHook(() => useReading({ queryFn, pollIntervalMs: 1_000 }), { wrapper })
    await settle('first')
    await waitFor(() => expect(result.current.data).toBe('first'))

    await act(() => vi.advanceTimersByTimeAsync(1_000))
    expect(queryFn).toHaveBeenCalledTimes(2)
    expect(result.current.isBusy).toBe(false)
    await settle(new Error('No route'))
    await waitFor(() => expect(result.current.error).toBe('No route'))
    expect(result.current.data).toBe('first')
  })

  it("doesn't refetch when one screen showing the data is swapped for another", async () => {
    const { queryFn, settle } = controlledRead()
    const options = { queryFn }
    const { rerender } = render(<Reader key="home" name="home" options={options} />, { wrapper })
    await settle('first')
    await screen.findByText('home: first')

    rerender(<Reader key="devices" name="devices" options={options} />)
    expect(screen.getByText('devices: first')).toBeInTheDocument()
    expect(queryFn).toHaveBeenCalledTimes(1)
  })

  it('a screen that opens on current data treats its first poll as a poll', async () => {
    const { queryFn, settle } = controlledRead()
    const options = { queryFn, pollIntervalMs: 1_000 }
    const { rerender } = render(<Reader key="home" name="home" options={options} />, { wrapper })
    await settle('first')
    await screen.findByText('home: first')

    rerender(<Reader key="devices" name="devices" options={options} />)
    await act(() => vi.advanceTimersByTimeAsync(1_000))
    expect(queryFn).toHaveBeenCalledTimes(2)
    await act(() => vi.advanceTimersByTimeAsync(10))
    expect(screen.getByText('devices: first')).toBeInTheDocument()
  })

  it('refetches, busy, when a screen opens on old data', async () => {
    const { queryFn, settle } = controlledRead()
    const options = { queryFn }
    const { rerender } = render(<Reader key="a" name="a" options={options} />, { wrapper })
    await settle('first')
    await screen.findByText('a: first')
    rerender(<></>)

    await act(() => vi.advanceTimersByTimeAsync(60_000))
    rerender(<Reader key="b" name="b" options={options} />)
    expect(await screen.findByText('b: busy')).toBeInTheDocument()
    expect(queryFn).toHaveBeenCalledTimes(2)
    await settle('second')
    expect(await screen.findByText('b: second')).toBeInTheDocument()
  })

  it("hides an earlier visit's error while the opening fetch runs", async () => {
    const { queryFn, settle } = controlledRead()
    const options = { queryFn }
    const { rerender } = render(<Reader key="a" name="a" options={options} />, { wrapper })
    await settle(new Error('No route'))
    await screen.findByText('a: No route')
    rerender(<></>)

    await act(() => vi.advanceTimersByTimeAsync(60_000))
    rerender(<Reader key="b" name="b" options={options} />)
    expect(await screen.findByText('b: busy')).toBeInTheDocument()
    await settle('back')
    expect(await screen.findByText('b: back')).toBeInTheDocument()
  })

  it('keeps the error over data through a reload until the reload lands', async () => {
    const { queryFn, settle } = controlledRead()
    const { result } = renderHook(() => useReading({ queryFn, pollIntervalMs: 1_000 }), { wrapper })
    await settle('first')
    await act(() => vi.advanceTimersByTimeAsync(1_000))
    await settle(new Error('No route'))
    await waitFor(() => expect(result.current.error).toBe('No route'))

    let reload: Promise<void> = Promise.resolve()
    act(() => {
      reload = result.current.reload()
    })
    await waitFor(() => expect(result.current.isBusy).toBe(true))
    expect(result.current.error).toBe('No route')
    await settle('fixed')
    await act(() => reload)
    expect(result.current.error).toBeNull()
    expect(result.current.isBusy).toBe(false)
    expect(result.current.data).toBe('fixed')
  })

  it('fetches once under StrictMode', async () => {
    const queryFn = vi.fn(() => Promise.resolve('first'))
    const { result } = renderHook(() => useReading({ queryFn }), {
      wrapper: ({ children }) => <StrictMode>{wrapper({ children })}</StrictMode>,
    })
    await waitFor(() => expect(result.current.data).toBe('first'))
    expect(queryFn).toHaveBeenCalledTimes(1)
  })

  it('forgets the data once closed, when asked to', async () => {
    const queryFn = vi.fn(() => Promise.resolve('secret'))
    const { result, unmount } = renderHook(() => useReading({ queryFn, shouldForgetWhenClosed: true }), {
      wrapper,
    })
    await waitFor(() => expect(result.current.data).toBe('secret'))
    unmount()
    await act(() => vi.advanceTimersByTimeAsync(10))
    expect(client.getQueryData(['reading'])).toBeUndefined()
  })
})
