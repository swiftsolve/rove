import { describe, expect, it } from 'vitest'

import { cn } from './cn'

describe('cn', () => {
  it('keeps the later of two text styles', () => {
    expect(cn('type-body text-tertiary', 'type-caption')).toBe('text-tertiary type-caption')
  })

  it('drops a size, weight, line height or spacing set before a text style', () => {
    expect(cn('text-sm leading-body font-semibold tracking-caption', 'type-caption')).toBe('type-caption')
  })

  it('keeps a utility after a text style, which tweaks it', () => {
    expect(cn('type-title', 'text-lg font-medium')).toBe('type-title text-lg font-medium')
  })

  it('still tells a font size from a text colour', () => {
    expect(cn('text-sm text-secondary', 'text-lg')).toBe('text-secondary text-lg')
  })
})
