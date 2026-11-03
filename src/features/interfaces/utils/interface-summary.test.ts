import { describe, expect, it } from 'vitest'

import { interfacesTitle, interfaceTypeSummaryParts } from '@/features/interfaces/utils/interface-summary'
import type { NetworkInterfaceSummary } from '@/types'

function iface(overrides: Partial<NetworkInterfaceSummary> = {}): NetworkInterfaceSummary {
  return {
    name: 'en0',
    connectionType: 'wifi',
    operState: 'up',
    isDefault: false,
    isVirtual: false,
    speedMbps: null,
    ipAddress: null,
    macAddress: null,
    duplex: null,
    ...overrides,
  }
}

describe('interfacesTitle', () => {
  it('counts the interfaces, or names the page when there are none', () => {
    expect(interfacesTitle(0)).toBe('Interfaces')
    expect(interfacesTitle(1)).toBe('1 interface')
    expect(interfacesTitle(4)).toBe('4 interfaces')
  })
})

describe('interfaceTypeSummaryParts', () => {
  it('counts virtual interfaces apart from their medium, in a fixed order', () => {
    const parts = interfaceTypeSummaryParts([
      iface({ connectionType: 'unknown' }),
      iface({ connectionType: 'ethernet', isVirtual: true }),
      iface({ connectionType: 'ethernet' }),
      iface({ connectionType: 'wifi' }),
    ])
    expect(parts).toEqual(['1 Wi‑Fi', '1 Ethernet', '1 Virtual', '1 Other'])
  })

  it('leaves out categories with none', () => {
    expect(interfaceTypeSummaryParts([iface(), iface()])).toEqual(['2 Wi‑Fi'])
    expect(interfaceTypeSummaryParts([])).toEqual([])
  })
})
