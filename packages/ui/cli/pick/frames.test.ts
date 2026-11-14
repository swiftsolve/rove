import { describe, expect, it } from 'vitest'

import { namedComponents, readCatalog } from '../catalog/catalog.ts'
import { pickActions } from '../program.ts'
import { listFrame, listWindow, menuFrame } from './frames.ts'
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

  it('counts the rows the window hides instead of an ellipsis', () => {
    const frame = listFrame({
      state: 'active',
      question: 'Which one?',
      typedTextWithCursor: '',
      components,
      cursor: 0,
      focusedName: 'Button',
      columns: 100,
      rows: 40,
    })
    expect(frame).toContain(`│  ↓ ${components.length - 11} more`)
    expect(frame).not.toContain('...')
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

describe('listWindow', () => {
  it('shows the whole list when it fits', () => {
    expect(listWindow(5, 2, 12)).toEqual({ start: 0, end: 5 })
  })

  it('leaves a line for the count below at the top of a long list', () => {
    expect(listWindow(54, 0, 12)).toEqual({ start: 0, end: 11 })
  })

  it('leaves lines for both counts in the middle, the cursor in between', () => {
    const { start, end } = listWindow(54, 30, 12)
    expect(end - start).toBe(10)
    expect(start).toBeLessThanOrEqual(30)
    expect(end).toBeGreaterThan(30)
  })

  it('leaves a line for the count above at the bottom', () => {
    expect(listWindow(54, 53, 12)).toEqual({ start: 43, end: 54 })
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
