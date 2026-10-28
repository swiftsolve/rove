import { describe, expect, it } from 'vitest'
import { advanceFill } from '@/features/speed/utils/progress-fill'

describe('advanceFill', () => {
  it('creeps forward a little each frame', () => {
    expect(advanceFill(0, 0)).toBeCloseTo(0.12)
  })

  it('holds just short of the next backend step until it is reached', () => {
    // Before the backend moves off 0, the next step is 15 and the fill stops at 11.
    expect(advanceFill(11, 0)).toBe(11)
  })

  it('eases toward a backend that has jumped ahead', () => {
    const next = advanceFill(10, 55)
    expect(next).toBeGreaterThan(10.12)
    expect(next).toBeLessThan(55)
  })

  it('never moves backwards', () => {
    expect(advanceFill(60, 15)).toBe(60)
  })

  it('runs all the way to 100 once the backend finishes', () => {
    let fill = 90
    for (let frame = 0; frame < 200; frame++) fill = advanceFill(fill, 100)
    expect(fill).toBeCloseTo(100)
  })
})
