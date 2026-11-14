import { describe, expect, it } from 'vitest'

import { countryCodeToFlag, countryCodeToName } from './flag'

describe('countryCodeToFlag', () => {
  it('turns a two-letter code into its flag, in either case', () => {
    expect(countryCodeToFlag('US')).toBe('🇺🇸')
    expect(countryCodeToFlag('gb')).toBe('🇬🇧')
  })

  it('is null for anything but two ASCII letters', () => {
    for (const code of [null, undefined, '', 'U', 'USA', 'U1', 'é1']) {
      expect(countryCodeToFlag(code)).toBeNull()
    }
  })
})

describe('countryCodeToName', () => {
  it('names a country in English, in either case', () => {
    expect(countryCodeToName('US')).toBe('United States')
    expect(countryCodeToName('de')).toBe('Germany')
  })

  it('is null for a malformed code or one with no region', () => {
    expect(countryCodeToName(null)).toBeNull()
    expect(countryCodeToName('USA')).toBeNull()
    expect(countryCodeToName('12')).toBeNull()
    expect(countryCodeToName('QQ')).toBeNull()
  })
})
