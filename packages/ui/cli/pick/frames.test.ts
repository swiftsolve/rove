import { describe, expect, it } from 'vitest'

import { namedComponents, readCatalog } from '../catalog/catalog.ts'
import { pickActions } from '../program.ts'
import { listFrame, menuFrame } from './frames.ts'
import { rankComponents } from './match.ts'

// Vitest's stdout isn't a terminal, so `styleText` leaves the frames uncoloured and readable here.
const catalog = readCatalog()
const components = namedComponents(catalog)

describe('listFrame', () => {
  it('draws the question, the search field, the rows best match first, and the keys', () => {
    const frame = listFrame({
      state: 'active',
      question: 'Which one?',
      typedTextWithCursor: 'card',
      components: rankComponents(components, 'card'),
      cursor: 0,
      focusedName: 'Card',
      columns: 100,
      rows: 40,
    })
    const lines = frame.split('\n')
    expect(lines[1]).toBe('◆  Which one? Esc quits')
    expect(lines[3]).toBe('│  Search card')
    expect(lines[4]).toMatch(/^│ {2}● Card {2,}The panel surface/)
    expect(lines[5]).toMatch(/^│ {2}○ CardBody /)
    expect(lines.at(-2)).toBe('│  ↑/↓ move   Enter pick   Type to search by name or group')
  })

  it('keeps every row within the terminal width', () => {
    const frame = listFrame({
      state: 'active',
      question: 'Which one?',
      typedTextWithCursor: '',
      components,
      cursor: 0,
      focusedName: 'Button',
      columns: 60,
      rows: 40,
    })
    const longestLine = Math.max(...frame.split('\n').map((line) => line.length))
    expect(longestLine).toBeLessThanOrEqual(60)
  })

  it('says what to do when nothing matches', () => {
    const frame = listFrame({
      state: 'active',
      question: 'Which one?',
      typedTextWithCursor: 'qqqq',
      components: [],
      cursor: 0,
      focusedName: undefined,
      columns: 100,
      rows: 40,
    })
    expect(frame).toContain('No component matches. Backspace to widen the search.')
  })

  it('shows the answer quietly once picked, without the Esc hint', () => {
    const frame = listFrame({
      state: 'submit',
      question: 'Which one?',
      typedTextWithCursor: '',
      components,
      cursor: 0,
      focusedName: 'Button',
      columns: 100,
      rows: 40,
    })
    expect(frame).toBe('│\n◇  Which one?\n│  Button')
  })
})

describe('menuFrame', () => {
  const button = components.find((component) => component.name === 'Button')
  if (button === undefined) {
    throw new Error('The catalog has no Button')
  }
  const actions = pickActions(catalog, button)

  it('shows the focused action with its hint, the rest plain, then the keys after a gap', () => {
    const lines = menuFrame({ state: 'active', question: 'Button: what next?', actions, cursor: 0 }).split('\n')
    expect(lines[1]).toBe('◆  Button: what next? Esc quits')
    expect(lines[2]).toBe('│')
    expect(lines[3]).toBe('│  ● Show props and usage  rove-ui show Button')
    expect(lines[4]).toBe('│  ○ Copy as Markdown')
    expect(lines.at(-3)).toBe('│')
    expect(lines.at(-2)).toBe('│  ↑/↓ move   Enter choose')
  })
})
