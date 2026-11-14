/**
 * The CLI's colours: Rove's accent for what holds attention (the component's
 * name, the prompt waiting on you, the row you're on, the mark), the
 * terminal's gray for what supports it. Colour shows only where `styleText`
 * would show it, so a pipe, NO_COLOR and `--no-color` get plain text.
 */
import { styleText } from 'node:util'

/** A colour as its red, green and blue parts, 0 to 255. */
export type Rgb = { red: number; green: number; blue: number }

/** A colour for each kind of terminal: dark, light, and one without 24-bit colour. */
type TerminalColor = { onDark: Rgb; onLight: Rgb; fallback: 'blueBright' | 'blue' }

/** Rove's --accent-default: Dark's on a dark terminal, Light's on a light one. */
const ACCENT: TerminalColor = {
  onDark: { red: 0x5b, green: 0x8c, blue: 0xff },
  onLight: { red: 0x3a, green: 0x69, blue: 0xd5 },
  fallback: 'blueBright',
}

/**
 * The accent pushed toward the background, for a shadow under accent text:
 * deeper on a dark terminal (Light's --accent-press), paler on a light one
 * (the top of BrandIcon's dock gradient).
 */
const ACCENT_SHADE: TerminalColor = {
  onDark: { red: 0x2c, green: 0x55, blue: 0xb8 },
  onLight: { red: 0x7a, green: 0xa4, blue: 0xff },
  fallback: 'blue',
}

/** The colour depth `getColorDepth` reports for a 24-bit terminal. */
const TRUE_COLOR_DEPTH = 24

/**
 * ANSI colour numbers a terminal's COLORFGBG may give for a light background
 * (white, bright white). Most terminals don't set it, so dark is the default.
 */
const LIGHT_BACKGROUND_COLORS = new Set(['7', '15'])

/** Whether the terminal says its background is light, through COLORFGBG ("foreground;background"). */
export function isLightTerminal(colorFgBg: string | undefined): boolean {
  const background = colorFgBg?.split(';').at(-1)
  return background !== undefined && LIGHT_BACKGROUND_COLORS.has(background)
}

/** Whether colour shows at all: `styleText` leaves text bare in a pipe or with NO_COLOR. */
function isColorShown(): boolean {
  return styleText('blue', 'x') !== 'x'
}

/** Whether the terminal shows 24-bit colour; a forced-colour pipe has no depth to ask, so it gets 16. */
function hasTrueColor(): boolean {
  if (!process.stdout.isTTY) {
    return false
  }
  return process.stdout.getColorDepth() >= TRUE_COLOR_DEPTH
}

/** Text in a 24-bit colour, as ANSI escapes. */
export function trueColorText(text: string, color: Rgb): string {
  return `\x1b[38;2;${color.red};${color.green};${color.blue}m${text}\x1b[39m`
}

/** Text in a colour that suits the terminal, or plain where colour isn't shown. */
function terminalColorText(text: string, color: TerminalColor): string {
  if (!isColorShown()) {
    return text
  }
  if (!hasTrueColor()) {
    return styleText(color.fallback, text)
  }
  return trueColorText(text, isLightTerminal(process.env.COLORFGBG) ? color.onLight : color.onDark)
}

/** Text in Rove's accent, or the terminal's bright blue where 24-bit colour isn't shown. */
export function accentText(text: string): string {
  return terminalColorText(text, ACCENT)
}

/** Text in a shade of the accent, for the shadow under large accent letters. */
export function accentShadeText(text: string): string {
  return terminalColorText(text, ACCENT_SHADE)
}

/** Text that supports what's beside it: a hint, a type, a guide line. */
export function quietText(text: string): string {
  return styleText('gray', text)
}

/** Text that leads its line: a title, a heading, the row you're on. */
export function strongText(text: string): string {
  return styleText('bold', text)
}
