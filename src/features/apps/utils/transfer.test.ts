import { describe, expect, it } from 'vitest'
import {
  busiestTotal,
  percentOf,
  totalBytes,
  transferLabel,
} from '@/features/apps/utils/transfer'

describe('totalBytes', () => {
  it('adds both directions', () => {
    expect(totalBytes({ rxBytes: 842, txBytes: 63 })).toBe(905)
  })
})

describe('busiestTotal', () => {
  it('is the largest combined total, whichever direction carries it', () => {
    const items = [
      { rxBytes: 10, txBytes: 5 },
      { rxBytes: 2, txBytes: 40 },
      { rxBytes: 30, txBytes: 0 },
    ]
    expect(busiestTotal(items)).toBe(42)
  })

  it('is zero for an empty list', () => {
    expect(busiestTotal([])).toBe(0)
  })
})

describe('percentOf', () => {
  it('scales a value against the max', () => {
    expect(percentOf(25, 200)).toBe(12.5)
    expect(percentOf(200, 200)).toBe(100)
  })

  it('is zero when the max is zero, rather than NaN', () => {
    expect(percentOf(0, 0)).toBe(0)
  })
})

describe('transferLabel', () => {
  it('reads both directions with their units', () => {
    expect(transferLabel({ rxBytes: 1_200_000, txBytes: 300_000 })).toBe('1.20 MB down, 300 KB up')
  })
})
