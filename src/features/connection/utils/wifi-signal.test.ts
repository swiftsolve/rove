import { describe, expect, it } from 'vitest'

import { signalBarCount, signalLevel, signalWord } from './wifi-signal'

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
  it('is excellent from 80, good from 55, fair from 35 and weak below', () => {
    expect(signalLevel(100)).toBe('excellent')
    expect(signalLevel(80)).toBe('excellent')
    expect(signalLevel(79)).toBe('good')
    expect(signalLevel(55)).toBe('good')
    expect(signalLevel(54)).toBe('fair')
    expect(signalLevel(35)).toBe('fair')
    expect(signalLevel(34)).toBe('weak')
    expect(signalLevel(Number.NaN)).toBe('weak')
  })
})

describe('signalWord', () => {
  it('says one word per bar count, so the word, the bars and their colour agree', () => {
    expect(signalWord(100)).toBe('Excellent')
    expect(signalWord(58)).toBe('Good')
    expect(signalLevel(58)).toBe('good')
    expect(signalWord(38)).toBe('Fair')
    expect(signalLevel(38)).toBe('fair')
    expect(signalWord(10)).toBe('Weak')
    expect(signalWord(Number.NaN)).toBe('Weak')
  })
})
