import { describe, expect, it } from 'vitest'
import { normalizeSecurity, shortSecurityLabel } from './wifi-security'

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
