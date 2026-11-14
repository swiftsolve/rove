import { afterEach, describe, expect, it, vi } from 'vitest'

import { bannerText } from './banner.ts'

describe('bannerText', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('welcomes you in a box, spells ROVE UI in large letters on one line, then says what the CLI gives', () => {
    const lines = bannerText(100).split('\n')
    expect(lines[1]).toBe('  ╭──────────────────────────╮')
    expect(lines[2]).toBe('  │ ◉ Welcome to Rove UI CLI │')
    expect(lines[3]).toBe('  ╰──────────────────────────╯')
    expect(lines[5]).toBe('  ██████╗  ██████╗ ██╗   ██╗███████╗    ██╗   ██╗██╗')
    expect(lines[11]).toBe('')
    expect(lines.at(-3)).toBe('  Props, usage and Figma for every component')
  })

  it('stacks ROVE over UI on a terminal too narrow for one line', () => {
    const lines = bannerText(45).split('\n')
    expect(lines[5]).toBe('  ██████╗  ██████╗ ██╗   ██╗███████╗')
    expect(lines[11]).toBe('  ██╗   ██╗██╗')
  })

  it('drops the large letters on a terminal too narrow for them, so nothing wraps', () => {
    const banner = bannerText(30)
    expect(banner).not.toContain('██')
    expect(banner).toContain('Welcome to Rove UI CLI')
    expect(banner).not.toContain('Props, usage')
  })

  it("draws the letters in Rove's accent with a deeper shadow on a 24-bit terminal", () => {
    vi.stubEnv('NO_COLOR', undefined)
    vi.stubEnv('FORCE_COLOR', '3')
    vi.stubEnv('COLORFGBG', undefined)
    const banner = bannerText(100)
    // A pipe has no colour depth to ask, so a forced-colour run gets the 16-colour blues.
    expect(banner).toContain('\x1b[94m██████')
    expect(banner).toContain('\x1b[34m╗')
  })
})
