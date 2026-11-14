/**
 * The banner `rove-ui pick` opens with: the Rove Mark beside the library's
 * name, in the dock icon's top-to-bottom blue.
 */
import { styleText } from 'node:util'

import type { Rgb } from '../theme.ts'
import { trueColorText } from '../theme.ts'

/**
 * The Rove Mark (BrandIcon's centre dot inside a ring open at the bottom),
 * drawn in braille dots, eight to a cell. A dot is about as wide as it is
 * tall, so the ring stays round: 28 dots across, 24 down.
 */
const ROVE_MARK_ROWS = [
  '     ⣀⣀⣀⣀     ',
  '  ⢀⣴⠿⠛⠉⠉⠛⠿⣦⡀  ',
  ' ⢠⣿⠃ ⣠⣤⣤⣄ ⠘⣿⡄ ',
  ' ⢸⡇  ⣿⣿⣿⣿  ⢸⡇ ',
  ' ⠘⣿⡄ ⠙⠛⠛⠋ ⢠⣿⠃ ',
  '  ⠈⠛      ⠛⠁  ',
]

/** The mark's top-to-bottom gradient: BrandIcon's dock-icon blue on a dark terminal, Light's accent on a light one. */
const MARK_GRADIENT_ON_DARK = {
  top: { red: 0x7a, green: 0xa4, blue: 0xff },
  bottom: { red: 0x54, green: 0x84, blue: 0xf5 },
}
const MARK_GRADIENT_ON_LIGHT = {
  top: { red: 0x3a, green: 0x69, blue: 0xd5 },
  bottom: { red: 0x2c, green: 0x55, blue: 0xb8 },
}

/** The colour `progress` of the way from one colour to another, 0 to 1. */
function mixColor(from: Rgb, to: Rgb, progress: number): Rgb {
  return {
    red: Math.round(from.red + (to.red - from.red) * progress),
    green: Math.round(from.green + (to.green - from.green) * progress),
    blue: Math.round(from.blue + (to.blue - from.blue) * progress),
  }
}

const TITLE = 'Rove UI CLI'
const SUBTITLE = 'Props, usage and Figma for every component'

/** What the banner says beside the mark, a line per mark row, centred on it. */
const BANNER_WORDS = ['', '', styleText('bold', TITLE), styleText('gray', SUBTITLE), '']

/** The columns the mark and its words take side by side: margin, mark, gap, subtitle. */
const FULL_BANNER_WIDTH = 2 + 14 + 2 + SUBTITLE.length

/**
 * The mark and the words beside it. With `hasTrueColor` the mark takes the
 * gradient, the light one on a light terminal; without, the terminal's own
 * blue, which NO_COLOR turns off too. A terminal too narrow for both gets the
 * words alone, so nothing wraps.
 */
export function bannerText(hasTrueColor: boolean, columns: number, isLight = false): string {
  if (columns < FULL_BANNER_WIDTH) {
    const subtitleLine = columns >= 2 + SUBTITLE.length ? `\n  ${styleText('gray', SUBTITLE)}` : ''
    return `\n  ${styleText('bold', TITLE)}${subtitleLine}\n\n`
  }
  const lastRow = ROVE_MARK_ROWS.length - 1
  const lines = ROVE_MARK_ROWS.map((markRow, rowIndex) => {
    const gradient = isLight ? MARK_GRADIENT_ON_LIGHT : MARK_GRADIENT_ON_DARK
    const rowColor = mixColor(gradient.top, gradient.bottom, rowIndex / lastRow)
    const coloredRow = hasTrueColor ? trueColorText(markRow, rowColor) : styleText('blueBright', markRow)
    return `  ${coloredRow}  ${BANNER_WORDS[rowIndex] ?? ''}`.trimEnd()
  })
  return `\n${lines.join('\n')}\n\n`
}
