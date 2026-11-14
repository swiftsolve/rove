import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ServiceReachability } from '@/types'

import { appendSamples, type LatencyHistory, MAX_SAMPLES, readLatencyHistory } from './service-latency'

function probe(host: string, latencyMs: number | null): ServiceReachability {
  return { name: host, host, latencyMs, httpStatus: null }
}

describe('appendSamples', () => {
  it('appends each service’s latest latency to its history', () => {
    const history: LatencyHistory = { 'a.com': [{ ts: 1, ms: 10 }] }
    const next = appendSamples(history, [probe('a.com', 20), probe('b.com', null)], 'online')
    expect(next['a.com']?.map((s) => s.ms)).toEqual([10, 20])
    expect(next['b.com']?.map((s) => s.ms)).toEqual([null])
  })

  it('skips the batch while the internet is down, returning the same history', () => {
    const history: LatencyHistory = { 'a.com': [{ ts: 1, ms: 10 }] }
    expect(appendSamples(history, [probe('a.com', null)], 'noInternet')).toBe(history)
    expect(appendSamples(history, [probe('a.com', null)], 'offline')).toBe(history)
  })

  it('counts an unknown internet status as online', () => {
    expect(appendSamples({}, [probe('a.com', 5)], undefined)['a.com']).toHaveLength(1)
  })

  it('returns the same history for an empty batch', () => {
    const history: LatencyHistory = { 'a.com': [{ ts: 1, ms: 10 }] }
    expect(appendSamples(history, [], 'online')).toBe(history)
  })

  it('keeps only the latest MAX_SAMPLES per host', () => {
    const full = Array.from({ length: MAX_SAMPLES }, (_, i) => ({ ts: i, ms: i }))
    const next = appendSamples({ 'a.com': full }, [probe('a.com', 999)], 'online')
    expect(next['a.com']).toHaveLength(MAX_SAMPLES)
    expect(next['a.com']?.[0]?.ms).toBe(1)
    expect(next['a.com']?.at(-1)?.ms).toBe(999)
  })

  it('drops hosts no longer listed', () => {
    const history: LatencyHistory = { 'gone.com': [{ ts: 1, ms: 10 }] }
    expect(Object.keys(appendSamples(history, [probe('a.com', 5)], 'online'))).toEqual(['a.com'])
  })
})

describe('readLatencyHistory', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function stubStored(raw: string | null): void {
    vi.stubGlobal('localStorage', { getItem: () => raw })
  }

  it('reads the stored history, dropping malformed samples', () => {
    stubStored(JSON.stringify({ 'a.com': [{ ts: 1, ms: 10 }, { ts: 2, ms: null }, { ts: 'x' }, null] }))
    expect(readLatencyHistory()).toEqual({
      'a.com': [
        { ts: 1, ms: 10 },
        { ts: 2, ms: null },
      ],
    })
  })

  it('skips a host whose value is not a list', () => {
    stubStored(JSON.stringify({ 'a.com': 5, 'b.com': [] }))
    expect(readLatencyHistory()).toEqual({ 'b.com': [] })
  })

  it('is empty for nothing stored, bad JSON or a non-object', () => {
    stubStored(null)
    expect(readLatencyHistory()).toEqual({})
    stubStored('{not json')
    expect(readLatencyHistory()).toEqual({})
    stubStored('[1, 2]')
    expect(readLatencyHistory()).toEqual({})
  })

  it('is empty when storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
    })
    expect(readLatencyHistory()).toEqual({})
  })
})
