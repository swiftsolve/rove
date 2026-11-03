import { describe, expect, it } from 'vitest'

import {
  formatBand,
  formatCount,
  formatDuration,
  formatLatencyMs,
  formatMac,
  formatSpeedMbps,
  formatTimeAgo,
  splitBytes,
  splitLatencyMs,
  splitSpeedMbps,
} from '@/lib/format'

describe('formatSpeedMbps / splitSpeedMbps', () => {
  it('switches to Gbps at 1000 Mbps', () => {
    expect(formatSpeedMbps(12.34)).toBe('12.3 Mbps')
    expect(formatSpeedMbps(1500)).toBe('1.5 Gbps')
    expect(splitSpeedMbps(1500)).toEqual({ value: '1.50', unit: 'Gbps' })
    expect(splitSpeedMbps(250.4)).toEqual({ value: '250', unit: 'Mbps' })
  })

  it('picks the unit and precision from the value as shown, after rounding', () => {
    expect(formatSpeedMbps(999.96)).toBe('1.0 Gbps')
    expect(splitSpeedMbps(99.96)).toEqual({ value: '100', unit: 'Mbps' })
    expect(splitSpeedMbps(999.6)).toEqual({ value: '1.00', unit: 'Gbps' })
    expect(splitSpeedMbps(9999.6)).toEqual({ value: '10.0', unit: 'Gbps' })
  })
})

describe('splitBytes', () => {
  it('keeps three significant figures in decimal units', () => {
    expect(splitBytes(999)).toEqual({ value: '999', unit: 'B' })
    expect(splitBytes(1_530_000_000)).toEqual({ value: '1.53', unit: 'GB' })
    expect(splitBytes(15_300)).toEqual({ value: '15.3', unit: 'KB' })
    expect(splitBytes(-1)).toEqual({ value: '0', unit: 'B' })
  })

  it('never shows four digits or a stray decimal at a unit boundary', () => {
    expect(splitBytes(999_600)).toEqual({ value: '1.00', unit: 'MB' })
    expect(splitBytes(9_996)).toEqual({ value: '10.0', unit: 'KB' })
    expect(splitBytes(99_960)).toEqual({ value: '100', unit: 'KB' })
  })
})

describe('formatDuration', () => {
  it('uses the two largest units', () => {
    expect(formatDuration(45_000)).toBe('45 s')
    expect(formatDuration(12 * 60_000)).toBe('12 min')
    expect(formatDuration(200 * 60_000)).toBe('3 h 20 min')
    expect(formatDuration(52 * 3_600_000)).toBe('2 d 4 h')
    expect(formatDuration(Number.NaN)).toBeNull()
  })
})

describe('formatTimeAgo', () => {
  const now = 10 * 3_600_000
  it('reads relative within a day', () => {
    expect(formatTimeAgo(now - 30_000, now)).toBe('just now')
    expect(formatTimeAgo(now - 5 * 60_000, now)).toBe('5 min ago')
    expect(formatTimeAgo(now - 3 * 3_600_000, now)).toBe('3 h ago')
  })

  it('counts whole hours passed, like formatDuration, and is null for a time that is not one', () => {
    expect(formatTimeAgo(now - 91 * 60_000, now)).toBe('1 h ago')
    expect(formatTimeAgo(Number.NaN, now)).toBeNull()
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
    expect(formatMac('')).toBeNull()
  })
})

describe('formatCount', () => {
  it('pluralises every count but one', () => {
    expect(formatCount(0, 'device')).toBe('0 devices')
    expect(formatCount(1, 'device')).toBe('1 device')
    expect(formatCount(3, 'interface')).toBe('3 interfaces')
  })
})

describe('formatLatencyMs / splitLatencyMs', () => {
  it('shows one decimal place in ms', () => {
    expect(formatLatencyMs(12.34)).toBe('12.3 ms')
    expect(splitLatencyMs(12.34)).toEqual({ value: '12.3', unit: 'ms' })
    expect(splitLatencyMs(0)).toEqual({ value: '0.0', unit: 'ms' })
  })

  it('is null for a negative or non-finite duration', () => {
    for (const ms of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(formatLatencyMs(ms)).toBeNull()
      expect(splitLatencyMs(ms)).toBeNull()
    }
  })
})
