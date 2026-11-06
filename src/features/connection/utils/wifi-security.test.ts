import { describe, expect, it } from 'vitest'

import { isWeakSecurity, normalizeSecurity, shortSecurityLabel } from './wifi-security'

describe('isWeakSecurity', () => {
  it('flags a network whose best protocol is WEP or WPA', () => {
    expect(isWeakSecurity('WEP')).toBe(true)
    expect(isWeakSecurity('WPA Personal')).toBe(true)
    expect(isWeakSecurity('wpa-psk')).toBe(true)
  })

  it('passes WPA2, WPA3, a WPA/WPA2 mix and anything unrecognised', () => {
    expect(isWeakSecurity('WPA2-Personal')).toBe(false)
    expect(isWeakSecurity('WPA3-Personal (H2E)')).toBe(false)
    expect(isWeakSecurity('WPA/WPA2 Personal')).toBe(false)
    expect(isWeakSecurity('802.1X')).toBe(false)
  })
})

describe('normalizeSecurity', () => {
  it('trims and collapses runs of spaces', () => {
    expect(normalizeSecurity('  WPA3-Personal  (H2E) ')).toBe('WPA3-Personal (H2E)')
  })
})

describe('shortSecurityLabel', () => {
  it('names the strongest protocol in the string', () => {
    expect(shortSecurityLabel('WPA3-Personal (H2E)')).toBe('WPA3')
    expect(shortSecurityLabel('WPA2 WPA3')).toBe('WPA3')
    expect(shortSecurityLabel('wpa2-psk')).toBe('WPA2')
  })

  it('keeps the full string when no protocol is recognised', () => {
    expect(shortSecurityLabel('802.1X')).toBe('802.1X')
  })
})
