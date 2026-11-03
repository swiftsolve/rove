import { describe, expect, it } from 'vitest'

import { isResolvedLight, themeModeFrom } from './theme-mode'

describe('themeModeFrom', () => {
  it('keeps a stored mode, and migrates the old light/dark boolean', () => {
    expect(themeModeFrom('system', 'true')).toBe('system')
    expect(themeModeFrom('', 'true')).toBe('light')
    expect(themeModeFrom('', 'false')).toBe('dark')
  })

  it('defaults a fresh install, or junk, to dark', () => {
    expect(themeModeFrom('', '')).toBe('dark')
    expect(themeModeFrom('sepia', '')).toBe('dark')
  })
})

describe('isResolvedLight', () => {
  it('follows the system only on system', () => {
    expect(isResolvedLight('system', true)).toBe(true)
    expect(isResolvedLight('dark', true)).toBe(false)
    expect(isResolvedLight('light', false)).toBe(true)
  })
})
