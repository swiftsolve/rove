/**
 * The CLI's colours: Rove's accent for what holds attention (the component's
 * name, the prompt waiting on you, the row you're on, the mark), the
 * terminal's gray for what supports it. Colour shows only where `styleText`
 * would show it, so a pipe, NO_COLOR and `--no-color` get plain text.
 */
import { styleText } from 'node:util'

/** A colour as its red, green and blue parts, 0 to 255. */
export type Rgb = { red: number; green: number; blue: number }

/** Rove's --accent-default: Dark's on a dark terminal, Light's on a light one. */
const ACCENT_ON_DARK: Rgb = { red: 0x5b, green: 0x8c, blue: 0xff }
const ACCENT_ON_LIGHT: Rgb = { red: 0x3a, green: 0x69, blue: 0xd5 }

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

/** Text in Rove's accent, or the terminal's bright blue where 24-bit colour isn't shown. */
export function accentText(text: string): string {
  if (!isColorShown()) {
    return text
  }
  if (!hasTrueColor()) {
    return styleText('blueBright', text)
  }
  const accent = isLightTerminal(process.env.COLORFGBG) ? ACCENT_ON_LIGHT : ACCENT_ON_DARK
  return trueColorText(text, accent)
}

/** Text that supports what's beside it: a hint, a type, a guide line. */
export function quietText(text: string): string {
  return styleText('gray', text)
}

/** Text that leads its line: a title, a heading, the row you're on. */
export function strongText(text: string): string {
  return styleText('bold', text)
}
