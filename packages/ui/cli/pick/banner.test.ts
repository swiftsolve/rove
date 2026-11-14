import { describe, expect, it } from 'vitest'

import { bannerText } from './banner.ts'

describe('bannerText', () => {
  it('names the CLI and says what it gives', () => {
    const banner = bannerText(false, 100)
    expect(banner).toContain('Rove UI CLI')
    expect(banner).toContain('Props, usage and Figma for every component')
  })

  it("draws the mark in the dock icon's gradient, top to bottom, on a 24-bit terminal", () => {
    const banner = bannerText(true, 100)
    expect(banner).toContain('\x1b[38;2;122;164;255m')
    expect(banner).toContain('\x1b[38;2;84;132;245m')
  })

  it('drops the mark on a terminal too narrow for it beside the words, so nothing wraps', () => {
    const banner = bannerText(true, 50)
    expect(banner).not.toContain('⣿')
    expect(banner).toContain('Rove UI CLI')
    expect(banner).toContain('Props, usage and Figma for every component')
    expect(bannerText(true, 30)).not.toContain('Props, usage')
  })

  it('leaves out 24-bit colour on a terminal without it', () => {
    expect(bannerText(false, 100)).not.toContain('\x1b[38;2;')
  })
})
