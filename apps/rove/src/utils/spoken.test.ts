import { describe, expect, it } from 'vitest'

import { spokenText } from './spoken'

describe('spokenText', () => {
  it('turns a bracketed part into a pause', () => {
    expect(spokenText('Wi‑Fi 6 (802.11ax)')).toBe('Wi‑Fi 6, 802.11ax')
    expect(spokenText('84% (-55 dBm)')).toBe('84%, -55 dBm')
    expect(spokenText('Signify (Philips Hue)')).toBe('Signify, Philips Hue')
  })

  it('reads a slash as "or"', () => {
    expect(spokenText('TV / Media')).toBe('TV or Media')
    expect(spokenText('WPA/WPA2 Personal')).toBe('WPA or WPA2 Personal')
  })

  it('leaves text without symbols as it is', () => {
    expect(spokenText('Smart home')).toBe('Smart home')
  })
})
