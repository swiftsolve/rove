import { describe, expect, it } from 'vitest'

import { isIpv4, isPrivateIp, parseIpv4 } from './ip'

describe('parseIpv4', () => {
  it('reads the octets of a dotted quad', () => {
    expect(parseIpv4('192.168.1.10')).toEqual([192, 168, 1, 10])
    expect(parseIpv4('0.0.0.0')).toEqual([0, 0, 0, 0])
  })

  it('rejects an octet over 255 and anything not a dotted quad', () => {
    expect(parseIpv4('300.1.1.1')).toBeNull()
    expect(parseIpv4('1.2.3')).toBeNull()
    expect(parseIpv4('1.2.3.4.5')).toBeNull()
    expect(parseIpv4('a.b.c.d')).toBeNull()
    expect(parseIpv4('::1')).toBeNull()
    expect(parseIpv4('')).toBeNull()
  })
})

describe('isIpv4', () => {
  it('tells an IPv4 literal from a hostname or IPv6', () => {
    expect(isIpv4('8.8.8.8')).toBe(true)
    expect(isIpv4('example.com')).toBe(false)
    expect(isIpv4('fe80::1')).toBe(false)
  })
})

describe('isPrivateIp', () => {
  it('counts RFC 1918, loopback, link-local, CGNAT and unspecified IPv4 as private', () => {
    for (const ip of ['10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.10', '127.0.0.1', '169.254.1.1']) {
      expect(isPrivateIp(ip)).toBe(true)
    }
    expect(isPrivateIp('100.64.0.1')).toBe(true)
    expect(isPrivateIp('100.127.255.255')).toBe(true)
    expect(isPrivateIp('0.0.0.0')).toBe(true)
  })

  it('counts public IPv4 as public, at the edges of the private ranges too', () => {
    for (const ip of ['8.8.8.8', '172.15.0.1', '172.32.0.1', '192.169.0.1', '100.63.0.1', '100.128.0.1']) {
      expect(isPrivateIp(ip)).toBe(false)
    }
  })

  it('counts IPv6 loopback, unspecified, link-local and unique-local as private', () => {
    for (const ip of ['::1', '::', 'fe80::1', 'FE80::abcd', 'fd12:3456::1', 'fc00::1']) {
      expect(isPrivateIp(ip)).toBe(true)
    }
  })

  it('counts public IPv6 as public', () => {
    expect(isPrivateIp('2001:4860:4860::8888')).toBe(false)
  })

  it('reads an IPv4-mapped IPv6 address by the IPv4 it carries', () => {
    expect(isPrivateIp('::ffff:192.168.1.10')).toBe(true)
    expect(isPrivateIp('::FFFF:10.0.0.1')).toBe(true)
    expect(isPrivateIp('::ffff:c0a8:010a')).toBe(true)
    expect(isPrivateIp('::ffff:8.8.8.8')).toBe(false)
    expect(isPrivateIp('::ffff:808:808')).toBe(false)
  })

  it('counts anything unrecognised as public', () => {
    expect(isPrivateIp('')).toBe(false)
    expect(isPrivateIp('not an ip')).toBe(false)
  })
})
