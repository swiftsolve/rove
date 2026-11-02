import { describe, expect, it } from 'vitest'
import { appGroupLabel, hostIconLabel } from '@/features/apps/utils/host-labels'

describe('hostIconLabel', () => {
  it('names the country when the host is geolocated', () => {
    expect(hostIconLabel('🇺🇸', 'United States', false)).toBe('United States')
  })

  it('says a LAN peer is on your network', () => {
    expect(hostIconLabel(null, null, true)).toBe('On your network')
  })

  it('is null for a public host with no country, whose globe is decorative', () => {
    expect(hostIconLabel(null, null, false)).toBeNull()
  })
})

describe('appGroupLabel', () => {
  it('reads the name, the host count and the total', () => {
    expect(appGroupLabel('firefox', 5, 903_000_000)).toBe('firefox, 5 hosts, 903 MB')
  })

  it('says host for one', () => {
    expect(appGroupLabel('Dropbox', 1, 129_000_000)).toBe('Dropbox, 1 host, 129 MB')
  })
})
