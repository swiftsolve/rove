import { describe, expect, it } from 'vitest'

import { namedComponents, readCatalog } from '../catalog/catalog.ts'
import { rankComponents } from './match.ts'

const components = namedComponents(readCatalog())

/** The names `pick` lists for what was typed, in order. */
function rankedNames(typedText: string): string[] {
  return rankComponents(components, typedText).map((component) => component.name)
}

describe('rankComponents', () => {
  it("keeps the catalog's order with nothing typed", () => {
    expect(rankedNames('')).toEqual(components.map((component) => component.name))
  })

  it('puts the same name first, then names that start with it, then names that hold it', () => {
    const names = rankedNames('card')
    expect(names[0]).toBe('Card')
    expect(names.slice(1, 5)).toEqual(['CardBody', 'CardFooter', 'CardHeader', 'CardList'])
    expect(names.indexOf('StretchedLink')).toBeGreaterThan(names.indexOf('CardList'))
  })

  it('finds a name from its letters in order, below names that hold the text', () => {
    expect(rankedNames('crdhdr')[0]).toBe('CardHeader')
  })

  it('finds components by their group last', () => {
    const names = rankedNames('inputs')
    expect(names).toContain('TextField')
  })

  it('ignores case and spaces at the ends', () => {
    expect(rankedNames('  BUTTON ')[0]).toBe('Button')
  })

  it('finds nothing for text no component has', () => {
    expect(rankedNames('qqqq')).toEqual([])
  })
})
