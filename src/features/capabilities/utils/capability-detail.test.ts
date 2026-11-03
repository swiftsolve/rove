import { describe, expect, it } from 'vitest'

import type { SpeedResult } from '@/types'

import { explainCapability } from './capability-detail'

const FAST: SpeedResult = { downloadMbps: 300, uploadMbps: 50, latencyMs: 12, jitterMs: 2, packetLoss: 0 }

describe('explainCapability', () => {
  it('shows no figure for a failed ping, and counts it as not met', () => {
    const { checks } = explainCapability('gaming', 'poor', { ...FAST, latencyMs: 9999, jitterMs: 9999 })
    const latency = checks.find((check) => check.label === 'Latency')
    expect(latency).toMatchObject({ have: null, isMet: false })
  })

  it('says a slow speed is too slow and a long delay too high', () => {
    const slowAndLaggy = { ...FAST, downloadMbps: 1, latencyMs: 200 }
    expect(explainCapability('gaming', 'poor', slowAndLaggy).summary).toBe(
      'Download too slow and latency too high for online gaming.',
    )
    expect(explainCapability('gaming', 'fair', { ...FAST, latencyMs: 60 }).summary).toBe('Latency above recommended.')
  })
})
