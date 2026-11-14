/**
 * The banner `rove-ui pick` opens with: a welcome line in a rounded box, then
 * ROVE UI in large shadowed letters, then what the CLI gives. Letters are
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

/** The wordmark's words: side by side where they fit, stacked where they don't. */
const WORDMARK_WORDS = ['ROVE', 'UI']

/** The blank cells between the words when they sit side by side. */
const WORD_GAP = '    '

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

/** The wordmark on one line: each row of every word, side by side. */
function sideBySideRows(): string[] {
  const rowsByWord = WORDMARK_WORDS.map(largeWordRows)
  return Array.from({ length: LETTER_HEIGHT }, (_, rowIndex) =>
    rowsByWord.map((rows) => rows[rowIndex] ?? '').join(WORD_GAP),
  )
}

/** The wordmark with each word on its own block of rows. */
function stackedRows(): string[] {
  return WORDMARK_WORDS.flatMap(largeWordRows)
}

/** The widest a set of rows runs, with the margin: the narrowest terminal that shows them. */
function widthWithMargin(rows: string[]): number {
  return Math.max(...rows.map((row) => row.length)) + MARGIN.length
}

/**
 * The whole banner for a terminal this wide: ROVE UI on one line, stacked on a
 * narrower terminal, left out on one too narrow for either, so nothing wraps.
 */
export function bannerText(columns: number): string {
  const rows = [...welcomeBoxRows(), '']
  const wordmarkLayouts = [sideBySideRows(), stackedRows()]
  const wordmark = wordmarkLayouts.find((layout) => columns >= widthWithMargin(layout))
  if (wordmark !== undefined) {
    rows.push(...wordmark.map(coloredLetterRow), '')
  }
  if (columns >= MARGIN.length + SUBTITLE.length) {
    rows.push(quietText(SUBTITLE))
  }
  return `\n${rows.map((row) => (row === '' ? '' : MARGIN + row).trimEnd()).join('\n')}\n\n`
}
