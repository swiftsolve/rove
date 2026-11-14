/**
 * The banner `rove-ui pick` opens with: a welcome line in a rounded box, then
 * ROVE over UI in large shadowed letters, then what the CLI gives. Letters are
 * straight lines, so they stay crisp in any terminal font, where a drawn curve
 * would break into cells.
 */
import { accentShadeText, accentText, quietText, strongText } from '../theme.ts'

/**
 * Each letter in the "ANSI Shadow" style, six rows tall: full blocks are the
 * letter, box-drawing lines its shadow down and to the right.
 */
const LETTER_ROWS: Record<string, string[]> = {
  R: ['██████╗ ', '██╔══██╗', '██████╔╝', '██╔══██╗', '██║  ██║', '╚═╝  ╚═╝'],
  O: [' ██████╗ ', '██╔═══██╗', '██║   ██║', '██║   ██║', '╚██████╔╝', ' ╚═════╝ '],
  V: ['██╗   ██╗', '██║   ██║', '██║   ██║', '╚██╗ ██╔╝', ' ╚████╔╝ ', '  ╚═══╝  '],
  E: ['███████╗', '██╔════╝', '█████╗  ', '██╔══╝  ', '███████╗', '╚══════╝'],
  U: ['██╗   ██╗', '██║   ██║', '██║   ██║', '██║   ██║', '╚██████╔╝', ' ╚═════╝ '],
  I: ['██╗', '██║', '██║', '██║', '██║', '╚═╝'],
}

const LETTER_HEIGHT = 6

/** The words the wordmark stacks, one per block of rows. */
const WORDMARK_WORDS = ['ROVE', 'UI']

const PRODUCT_NAME = 'Rove UI CLI'
const SUBTITLE = 'Props, usage and Figma for every component'

/** The blank columns the banner keeps from the terminal's left edge. */
const MARGIN = '  '

/** A word's rows in large letters, the letters side by side. */
function largeWordRows(word: string): string[] {
  return Array.from({ length: LETTER_HEIGHT }, (_, rowIndex) =>
    word
      .split('')
      .map((letter) => LETTER_ROWS[letter]?.[rowIndex] ?? '')
      .join(''),
  )
}

/** A row of large letters coloured: the blocks in the accent, the shadow a deeper shade of it. */
function coloredLetterRow(row: string): string {
  return row.replace(/(█+)|([^█]+)/g, (_, blocks: string | undefined, shadow: string | undefined) =>
    blocks === undefined ? accentShadeText(shadow ?? '') : accentText(blocks),
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
const WORDMARK_WIDTH = Math.max(...WORDMARK_WORDS.map((word) => largeWordRows(word)[0]?.length ?? 0)) + MARGIN.length

/**
 * The whole banner for a terminal this wide. One too narrow for the large
 * letters gets the box and the subtitle alone, so nothing wraps.
 */
export function bannerText(columns: number): string {
  const rows = [...welcomeBoxRows(), '']
  if (columns >= WORDMARK_WIDTH) {
    for (const word of WORDMARK_WORDS) {
      rows.push(...largeWordRows(word).map(coloredLetterRow))
    }
    rows.push('')
  }
  if (columns >= MARGIN.length + SUBTITLE.length) {
    rows.push(quietText(SUBTITLE))
  }
  return `\n${rows.map((row) => (row === '' ? '' : MARGIN + row).trimEnd()).join('\n')}\n\n`
}
