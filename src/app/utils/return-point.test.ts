import { describe, expect, it } from 'vitest'

import { isReturnPoint, type ReturnPoint } from './return-point'

const RETURN_POINT: ReturnPoint = {
  signature: 'BUTTON||Run test',
  index: 3,
  tagName: 'BUTTON',
  isFocusVisible: true,
  scrollTop: 120,
}

describe('isReturnPoint', () => {
  it('accepts a whole return point', () => {
    expect(isReturnPoint(RETURN_POINT)).toBe(true)
  })

  it('turns down one an older build saved without a field, or with one of the wrong type', () => {
    const { scrollTop: _scrollTop, ...withoutScroll } = RETURN_POINT
    expect(isReturnPoint(withoutScroll)).toBe(false)
    expect(isReturnPoint({ ...RETURN_POINT, index: '3' })).toBe(false)
    expect(isReturnPoint(null)).toBe(false)
  })
})
