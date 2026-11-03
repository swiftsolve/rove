import { describe, expect, it } from 'vitest'

import { isLegacyEntry, upgradeLegacyEntry } from './speed-history'

const CORE = { downloadMbps: 100, uploadMbps: 20, latencyMs: 12, jitterMs: 2, packetLoss: 0 }

describe('isLegacyEntry', () => {
  it('accepts an entry with a timestamp and both speeds', () => {
    expect(isLegacyEntry({ ...CORE, timestamp: 1 })).toBe(true)
  })

  it('rejects anything missing a timestamp or a speed, or not an object', () => {
    expect(isLegacyEntry({ ...CORE })).toBe(false)
    expect(isLegacyEntry({ timestamp: 1, uploadMbps: 1 })).toBe(false)
    expect(isLegacyEntry({ timestamp: 1, downloadMbps: '100', uploadMbps: 1 })).toBe(false)
    expect(isLegacyEntry(null)).toBe(false)
    expect(isLegacyEntry('entry')).toBe(false)
  })
})

describe('upgradeLegacyEntry', () => {
  it('fills the connection fields older versions didn’t save', () => {
    expect(upgradeLegacyEntry({ ...CORE, timestamp: 1 })).toEqual({
      ...CORE,
      timestamp: 1,
      connectionType: 'unknown',
      networkName: null,
      linkSpeedMbps: null,
      frequency: null,
    })
  })

  it('keeps the connection fields an entry has, and drops mistyped ones', () => {
    const saved = { ...CORE, timestamp: 1, connectionType: 'wifi', networkName: 'Home', linkSpeedMbps: 'fast' }
    expect(upgradeLegacyEntry(saved)).toMatchObject({
      connectionType: 'wifi',
      networkName: 'Home',
      linkSpeedMbps: null,
      frequency: null,
    })
  })
})
