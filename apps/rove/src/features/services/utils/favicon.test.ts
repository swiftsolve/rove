import { describe, expect, it } from 'vitest'

import { faviconUrl, mayHaveFavicon } from './favicon'

describe('mayHaveFavicon', () => {
  it('asks for a public hostname, ignoring case, spaces and a trailing dot', () => {
    expect(mayHaveFavicon('netflix.com')).toBe(true)
    expect(mayHaveFavicon('  API.GitHub.com. ')).toBe(true)
  })

  it('skips IP literals', () => {
    expect(mayHaveFavicon('192.168.1.1')).toBe(false)
    expect(mayHaveFavicon('2001:db8::1')).toBe(false)
    expect(mayHaveFavicon('[::1]')).toBe(false)
  })

  it('skips single-label and LAN-only names', () => {
    expect(mayHaveFavicon('')).toBe(false)
    expect(mayHaveFavicon('router')).toBe(false)
    expect(mayHaveFavicon('nas.local')).toBe(false)
    expect(mayHaveFavicon('printer.home.arpa')).toBe(false)
    expect(mayHaveFavicon('box.lan')).toBe(false)
  })
})

describe('faviconUrl', () => {
  it('encodes the host into the icon service address', () => {
    expect(faviconUrl('a.com')).toBe('https://www.google.com/s2/favicons?domain=a.com&sz=64')
  })
})
