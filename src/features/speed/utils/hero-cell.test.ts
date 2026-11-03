import { describe, expect, it } from 'vitest'

import { heroCellMbps } from './hero-cell'

describe('heroCellMbps', () => {
  it('shows the last result when not testing, or nothing before any', () => {
    expect(heroCellMbps(false, 0, 10, 50, 120)).toBe(120)
    expect(heroCellMbps(false, 0, 10, 50, undefined)).toBeNull()
  })

  it('shows 0 while testing until its phase begins, then the live peak', () => {
    expect(heroCellMbps(true, 5, 10, 50, 120)).toBe(0)
    expect(heroCellMbps(true, 10, 10, 50, 120)).toBe(50)
    expect(heroCellMbps(true, 80, 10, 50, undefined)).toBe(50)
  })
})
