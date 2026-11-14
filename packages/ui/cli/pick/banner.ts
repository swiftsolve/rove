/**
 * The banner `rove-ui pick` opens with: the Rove Mark beside the library's
 * name, in the dock icon's top-to-bottom blue.
 */
import { styleText } from 'node:util'

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

/** A colour as its red, green and blue parts, 0 to 255. */
type Rgb = { red: number; green: number; blue: number }

/** BrandIcon's gradient stops, #7aa4ff at the top to #5484f5 at the bottom. */
const MARK_TOP_COLOR: Rgb = { red: 0x7a, green: 0xa4, blue: 0xff }
const MARK_BOTTOM_COLOR: Rgb = { red: 0x54, green: 0x84, blue: 0xf5 }

/** The colour `progress` of the way from one colour to another, 0 to 1. */
function mixColor(from: Rgb, to: Rgb, progress: number): Rgb {
  return {
    red: Math.round(from.red + (to.red - from.red) * progress),
    green: Math.round(from.green + (to.green - from.green) * progress),
    blue: Math.round(from.blue + (to.blue - from.blue) * progress),
  }
}

/** Text in a 24-bit colour, as ANSI escapes. */
function trueColorText(text: string, color: Rgb): string {
  return `\x1b[38;2;${color.red};${color.green};${color.blue}m${text}\x1b[39m`
}

/** What the banner says beside the mark, a line per mark row, centred on it. */
const BANNER_WORDS = [
  '',
  '',
  styleText('bold', 'Rove UI CLI'),
  styleText('gray', 'Props, usage and Figma for every component'),
  '',
]

/**
 * The mark and the words beside it. With `hasTrueColor` the mark takes the
 * gradient; without, the terminal's own blue, which NO_COLOR turns off too.
 */
export function bannerText(hasTrueColor: boolean): string {
  const lastRow = ROVE_MARK_ROWS.length - 1
  const lines = ROVE_MARK_ROWS.map((markRow, rowIndex) => {
    const rowColor = mixColor(MARK_TOP_COLOR, MARK_BOTTOM_COLOR, rowIndex / lastRow)
    const coloredRow = hasTrueColor ? trueColorText(markRow, rowColor) : styleText('blueBright', markRow)
    return `  ${coloredRow}  ${BANNER_WORDS[rowIndex] ?? ''}`.trimEnd()
  })
  return `\n${lines.join('\n')}\n\n`
}
