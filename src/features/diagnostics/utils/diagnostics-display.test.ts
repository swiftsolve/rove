import { describe, expect, it } from 'vitest'

import { FAILED_PING, isMeasuredLatency, type IspInfo } from '@/types'

import {
  formatLocation,
  formatPercent,
  latencyStatus,
  lossStatus,
  runStatusText,
  sameText,
} from './diagnostics-display'

function isp(place: Pick<IspInfo, 'city' | 'region' | 'country'>): IspInfo {
  return { name: null, asn: null, domain: null, publicIp: null, isVpn: false, ...place }
}

describe('diagnostics display', () => {
  it('rates a gateway round trip green, amber, then red, and a failed ping red', () => {
    expect(latencyStatus(12)).toBe('positive')
    expect(latencyStatus(40)).toBe('positive')
    expect(latencyStatus(80)).toBe('warning')
    expect(latencyStatus(400)).toBe('negative')
    expect(latencyStatus(FAILED_PING.avgMs)).toBe('negative')
    expect(latencyStatus(Number.NaN)).toBe('negative')
  })

  it('flags any packet loss, and a lot of it as bad', () => {
    expect(lossStatus(0)).toBe('positive')
    expect(lossStatus(1.5)).toBe('warning')
    expect(lossStatus(5)).toBe('negative')
  })

  it('rounds a percentage to one place', () => {
    expect(formatPercent(1.25)).toBe('1.3%')
    expect(formatPercent(0)).toBe('0%')
  })

  it('compares names ignoring case and edge spaces, never matching a missing one', () => {
    expect(sameText(' Archer AX55 ', 'archer ax55')).toBe(true)
    expect(sameText(null, null)).toBe(false)
    expect(sameText('Archer', 'Deco')).toBe(false)
  })

  it('joins the location parts it has', () => {
    expect(formatLocation(isp({ city: 'Toronto', region: null, country: 'Canada' }))).toBe('Toronto, Canada')
    expect(formatLocation(isp({ city: null, region: null, country: null }))).toBeNull()
  })
})

describe('isMeasuredLatency', () => {
  it('accepts a real round trip, not the failed-ping sentinel or a non-number', () => {
    expect(isMeasuredLatency(23)).toBe(true)
    expect(isMeasuredLatency(FAILED_PING.avgMs)).toBe(false)
    expect(isMeasuredLatency(Number.POSITIVE_INFINITY)).toBe(false)
  })

  it('announces only a finished run, since the page header announces its start', () => {
    expect(runStatusText(true, false)).toBe('')
    expect(runStatusText(true, true)).toBe('')
    expect(runStatusText(false, true)).toBe('Connection checks finished.')
    expect(runStatusText(false, false)).toBe('')
  })
})
