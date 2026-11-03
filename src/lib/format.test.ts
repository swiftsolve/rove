import { describe, expect, it } from 'vitest'

import {
  formatBand,
  formatCount,
  formatDuration,
  formatMac,
  formatSpeedMbps,
  formatTimeAgo,
  splitBytes,
  splitSpeedMbps,
} from '@/lib/format'

describe('formatSpeedMbps / splitSpeedMbps', () => {
  it('switches to Gbps at 1000 Mbps', () => {
    expect(formatSpeedMbps(12.34)).toBe('12.3 Mbps')
    expect(formatSpeedMbps(1500)).toBe('1.5 Gbps')
    expect(splitSpeedMbps(1500)).toEqual({ value: '1.50', unit: 'Gbps' })
    expect(splitSpeedMbps(250.4)).toEqual({ value: '250', unit: 'Mbps' })
  })
})

describe('splitBytes', () => {
  it('keeps three significant figures in decimal units', () => {
    expect(splitBytes(999)).toEqual({ value: '999', unit: 'B' })
    expect(splitBytes(1_530_000_000)).toEqual({ value: '1.53', unit: 'GB' })
    expect(splitBytes(15_300)).toEqual({ value: '15.3', unit: 'KB' })
    expect(splitBytes(-1)).toEqual({ value: '0', unit: 'B' })
  })
})

describe('formatDuration', () => {
  it('uses the two largest units', () => {
    expect(formatDuration(45_000)).toBe('45 s')
    expect(formatDuration(12 * 60_000)).toBe('12 min')
    expect(formatDuration(200 * 60_000)).toBe('3 h 20 min')
    expect(formatDuration(52 * 3_600_000)).toBe('2 d 4 h')
    expect(formatDuration(Number.NaN)).toBe('—')
  })
})

describe('formatTimeAgo', () => {
  const now = 10 * 3_600_000
  it('reads relative within a day', () => {
    expect(formatTimeAgo(now - 30_000, now)).toBe('just now')
    expect(formatTimeAgo(now - 5 * 60_000, now)).toBe('5 min ago')
    expect(formatTimeAgo(now - 3 * 3_600_000, now)).toBe('3 h ago')
  })
})

describe('formatBand', () => {
  it('maps a centre frequency to its band', () => {
    expect(formatBand(2437)).toBe('2.4 GHz')
    expect(formatBand(5180)).toBe('5 GHz')
    expect(formatBand(5955)).toBe('6 GHz')
    expect(formatBand(null)).toBeNull()
  })
})

describe('formatMac', () => {
  it('upper-cases and trims', () => {
    expect(formatMac(' a4:c3:f0:01:02:03 ')).toBe('A4:C3:F0:01:02:03')
    expect(formatMac('')).toBe('—')
  })
})

describe('formatCount', () => {
  it('pluralises every count but one', () => {
    expect(formatCount(0, 'device')).toBe('0 devices')
    expect(formatCount(1, 'device')).toBe('1 device')
    expect(formatCount(3, 'interface')).toBe('3 interfaces')
  })
})
