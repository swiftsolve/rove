import { describe, expect, it } from 'vitest'
import { signalBarCount, signalLevel } from './wifi-signal'

describe('signalBarCount', () => {
  it('fills a bar per threshold reached, and always at least one', () => {
    expect(signalBarCount(0)).toBe(1)
    expect(signalBarCount(34)).toBe(1)
    expect(signalBarCount(35)).toBe(2)
    expect(signalBarCount(55)).toBe(3)
    expect(signalBarCount(79)).toBe(3)
    expect(signalBarCount(80)).toBe(4)
    expect(signalBarCount(100)).toBe(4)
  })
})

describe('signalLevel', () => {
  it('is good from 55, fair from 35 and poor below', () => {
    expect(signalLevel(100)).toBe('good')
    expect(signalLevel(55)).toBe('good')
    expect(signalLevel(54)).toBe('fair')
    expect(signalLevel(35)).toBe('fair')
    expect(signalLevel(34)).toBe('poor')
  })
})
