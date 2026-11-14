/**
 * The banner `rove-ui pick` opens with: a welcome line in a rounded box, then
 * ROVE over UI in large square letters with a soft shadow, then what the CLI
 * gives. Letters made of whole cells stay crisp in any terminal font, where a
 * drawn curve would break into cells.
 */
import { accentShadeText, accentText, quietText, strongText } from '../theme.ts'

/**
 * Each letter as a 5 by 5 grid of pixels, `#` for ink. Square letters made of
 * whole cells, with no thin lines, read cleanly at any terminal font size.
 */
const LETTER_PIXELS: Record<string, string[]> = {
  R: ['#### ', '#   #', '#### ', '#  # ', '#   #'],
  O: ['#####', '#   #', '#   #', '#   #', '#####'],
  V: ['#   #', '#   #', '#   #', ' # # ', '  #  '],
  E: ['#####', '#    ', '#### ', '#    ', '#####'],
  U: ['#   #', '#   #', '#   #', '#   #', '#####'],
  I: ['###', ' # ', ' # ', ' # ', '###'],
}

/** A pixel is two cells wide, as a cell is about twice as tall as it is wide, so pixels come out square. */
const CELLS_PER_PIXEL = 2

/** The blank cells between letters, wide enough that one letter's shadow doesn't touch the next. */
const LETTER_GAP = 3

/** What the large letters are drawn with: the ink, and the shadow it casts one cell right and one row down. */
const INK = '█'
const SHADOW = '░'

/** The words the wordmark stacks, one per block of rows. */
const WORDMARK_WORDS = ['ROVE', 'UI']

const PRODUCT_NAME = 'Rove UI CLI'
const SUBTITLE = 'Props, usage and Figma for every component'

/** The blank columns the banner keeps from the terminal's left edge. */
const MARGIN = '  '

/** A word's ink, row by row: each letter's pixels widened to cells, the letters side by side. */
function inkRows(word: string): string[] {
  const letters = word.split('').map((letter) => LETTER_PIXELS[letter] ?? [])
  const height = Math.max(...letters.map((pixels) => pixels.length))
  return Array.from({ length: height }, (_, rowIndex) =>
    letters
      .map((pixels) =>
        (pixels[rowIndex] ?? '')
          .split('')
          .map((pixel) => (pixel === '#' ? INK : ' ').repeat(CELLS_PER_PIXEL))
          .join(''),
      )
      .join(' '.repeat(LETTER_GAP)),
  )
}

/** A word in large letters: its ink with a shadow one cell right and one row down, wherever the ink isn't. */
function largeWordRows(word: string): string[] {
  const ink = inkRows(word)
  const width = Math.max(...ink.map((row) => row.length)) + 1
  const canvas = Array.from({ length: ink.length + 1 }, () => Array.from({ length: width }, () => ' '))
  ink.forEach((row, rowIndex) => {
    row.split('').forEach((cell, columnIndex) => {
      const shadowRow = canvas[rowIndex + 1]
      if (cell === INK && shadowRow !== undefined) {
        shadowRow[columnIndex + 1] = SHADOW
      }
    })
  })
  ink.forEach((row, rowIndex) => {
    row.split('').forEach((cell, columnIndex) => {
      const canvasRow = canvas[rowIndex]
      if (cell === INK && canvasRow !== undefined) {
        canvasRow[columnIndex] = INK
      }
    })
  })
  return canvas.map((row) => row.join('').trimEnd())
}

/** A row of large letters coloured: the ink in the accent, the shadow a deeper shade of it. */
function coloredLetterRow(row: string): string {
  return row.replace(/(█+)|(░+)/g, (_, ink: string | undefined, shadow: string | undefined) =>
    ink === undefined ? accentShadeText(shadow ?? '') : accentText(ink),
  )
}

/** The welcome line in a rounded box, its border in the accent. */
function welcomeBoxRows(): string[] {
  const welcome = `${accentText('◉')} Welcome to ${strongText(PRODUCT_NAME)}`
  const welcomeWidth = `◉ Welcome to ${PRODUCT_NAME}`.length
  const border = '─'.repeat(welcomeWidth + 2)
  return [accentText(`╭${border}╮`), `${accentText('│')} ${welcome} ${accentText('│')}`, accentText(`╰${border}╯`)]
}

/** The widest the large letters run, and so the narrowest terminal that shows them. */
const WORDMARK_WIDTH =
  Math.max(...WORDMARK_WORDS.flatMap((word) => largeWordRows(word).map((row) => row.length))) + MARGIN.length

/**
 * The whole banner for a terminal this wide. One too narrow for the large
 * letters gets the box and the subtitle alone, so nothing wraps.
 */
export function bannerText(columns: number): string {
  const rows = [...welcomeBoxRows(), '']
  if (columns >= WORDMARK_WIDTH) {
    for (const word of WORDMARK_WORDS) {
      rows.push(...largeWordRows(word).map(coloredLetterRow), '')
    }
  }
  if (columns >= MARGIN.length + SUBTITLE.length) {
    rows.push(quietText(SUBTITLE))
  }
  return `\n${rows.map((row) => (row === '' ? '' : MARGIN + row).trimEnd()).join('\n')}\n\n`
}
