/**
 * Reads catalog/components.gen.json and finds components in it, for the
 * rove-ui CLI. The file is written by `npm run gen`, which holds it to its
 * schema, so its shape can be trusted.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { ComponentEntry, ComponentListJson } from '../../../scripts/lib/library-json-types.ts'

export type { ComponentEntry, ComponentListJson }

/** A component with its name, which components.gen.json keeps as its key. */
export type NamedComponent = ComponentEntry & { name: string }

const CATALOG_PATH = join(import.meta.dirname, '../catalog/components.gen.json')

/** Reads the component catalog from disk. */
export function readCatalog(): ComponentListJson {
  return JSON.parse(readFileSync(CATALOG_PATH, 'utf8')) as ComponentListJson
}

/** Every component in the catalog, in the catalog's order. */
export function namedComponents(catalog: ComponentListJson): NamedComponent[] {
  return Object.entries(catalog.components).map(([name, entry]) => ({ ...entry, name }))
}

/** The component with this name, ignoring case, or null. */
export function findComponent(catalog: ComponentListJson, name: string): NamedComponent | null {
  const wantedName = name.toLowerCase()
  return namedComponents(catalog).find((component) => component.name.toLowerCase() === wantedName) ?? null
}

/** How many single letters to add, drop or change to turn one word into the other (Levenshtein). */
function editDistance(from: string, to: string): number {
  // previousRow[j] is the distance from the letters of `from` so far to the first j letters of `to`.
  let previousRow = Array.from({ length: to.length + 1 }, (_, j) => j)
  for (let i = 1; i <= from.length; i++) {
    const row = [i]
    for (let j = 1; j <= to.length; j++) {
      const substitutionCost = from[i - 1] === to[j - 1] ? 0 : 1
      const deletion = (previousRow[j] ?? 0) + 1
      const insertion = (row[j - 1] ?? 0) + 1
      const substitution = (previousRow[j - 1] ?? 0) + substitutionCost
      row.push(Math.min(deletion, insertion, substitution))
    }
    previousRow = row
  }
  return previousRow[to.length] ?? 0
}

/** The most letters a typo may be off by and still be suggested. */
const MAX_TYPO_DISTANCE = 2

/** Names to suggest after a miss: ones that hold what was typed, hold in it, or are a typo away. */
export function similarComponentNames(catalog: ComponentListJson, name: string): string[] {
  const typedName = name.toLowerCase()
  return namedComponents(catalog)
    .map((component) => component.name)
    .filter((componentName) => {
      const lowerName = componentName.toLowerCase()
      const isTypoAway = editDistance(lowerName, typedName) <= MAX_TYPO_DISTANCE
      return lowerName.includes(typedName) || typedName.includes(lowerName) || isTypoAway
    })
}

/** The parts that belong to a family: CardHeader, CardBody… for Card. */
export function partsOf(catalog: ComponentListJson, familyName: string): NamedComponent[] {
  return namedComponents(catalog).filter((component) => component.partOf === familyName)
}

/** Every piece of text a search looks through: name, description, prop names and usage guide. */
function searchableText(component: NamedComponent): string {
  const guidance = component.guidance
  const guidanceLines = guidance
    ? [
        ...guidance.whenToUse,
        ...guidance.whenNotToUse,
        ...guidance.accessibility.builtIn,
        ...guidance.accessibility.toHandle,
      ]
    : []
  return [component.name, component.description, ...Object.keys(component.props), ...guidanceLines]
    .join('\n')
    .toLowerCase()
}

/** The components whose text holds every word, in the catalog's order. */
export function searchComponents(catalog: ComponentListJson, words: string[]): NamedComponent[] {
  const wantedWords = words.map((word) => word.toLowerCase())
  return namedComponents(catalog).filter((component) => {
    const text = searchableText(component)
    return wantedWords.every((word) => text.includes(word))
  })
}
