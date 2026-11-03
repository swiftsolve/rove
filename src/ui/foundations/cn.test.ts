import { describe, expect, it } from 'vitest'

import { cn } from './cn'

describe('cn', () => {
  it('keeps the later of two text styles', () => {
    expect(cn('type-body-default text-tertiary', 'type-caption')).toBe('text-tertiary type-caption')
  })

  it('drops a size, weight, line height or spacing set before a text style', () => {
    expect(cn('text-sm font-semibold leading-body-small tracking-caption', 'type-caption')).toBe('type-caption')
  })

  it('keeps a utility after a text style, which tweaks it', () => {
    expect(cn('type-heading-large', 'text-lg font-medium')).toBe('type-heading-large text-lg font-medium')
  })

  it('still tells a font size from a text colour', () => {
    expect(cn('text-md text-secondary', 'text-lg')).toBe('text-secondary text-lg')
  })
})
