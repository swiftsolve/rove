/**
 * Which components match what was typed in `pick`, best first. With nothing
 * typed the list keeps the catalog's order, group by group, as Storybook and
 * Figma show it; once you type, the closest names rise to the top.
 */
import type { NamedComponent } from '../catalog/catalog.ts'

/** How well a component matches, best first; a lower number sorts higher. */
const MATCH_RANKS = {
  sameName: 0,
  nameStarts: 1,
  nameContains: 2,
  nameHasLettersInOrder: 3,
  groupOrSentence: 4,
} as const

/** A description's first sentence, on one line: "A text button." */
export function firstSentence(description: string): string {
  const oneLine = description.replace(/\s*\n\s*/g, ' ').trim()
  const sentenceEnd = oneLine.indexOf('. ')
  return sentenceEnd === -1 ? oneLine : oneLine.slice(0, sentenceEnd + 1)
}

/** Whether every letter typed appears in the name, in order: "crdhdr" finds CardHeader. */
function hasLettersInOrder(typedText: string, name: string): boolean {
  let nameIndex = 0
  for (const letter of typedText) {
    nameIndex = name.indexOf(letter, nameIndex)
    if (nameIndex === -1) {
      return false
    }
    nameIndex += 1
  }
  return true
}

/** How well a component matches the typed text, or null when it doesn't. */
function matchRank(typedText: string, component: NamedComponent): number | null {
  const name = component.name.toLowerCase()
  if (name === typedText) {
    return MATCH_RANKS.sameName
  }
  if (name.startsWith(typedText)) {
    return MATCH_RANKS.nameStarts
  }
  if (name.includes(typedText)) {
    return MATCH_RANKS.nameContains
  }
  if (hasLettersInOrder(typedText.replaceAll(' ', ''), name)) {
    return MATCH_RANKS.nameHasLettersInOrder
  }
  const groupAndSentence = `${component.libraryGroup}\n${firstSentence(component.description)}`.toLowerCase()
  if (groupAndSentence.includes(typedText)) {
    return MATCH_RANKS.groupOrSentence
  }
  return null
}

/** The components that match, best match first, the catalog's order breaking ties. */
export function rankComponents(components: NamedComponent[], typedText: string): NamedComponent[] {
  const wantedText = typedText.trim().toLowerCase()
  if (wantedText === '') {
    return components
  }
  const ranked = components.flatMap((component) => {
    const rank = matchRank(wantedText, component)
    return rank === null ? [] : [{ component, rank }]
  })
  // Array.prototype.sort is stable, so equal ranks keep the catalog's order.
  ranked.sort((first, second) => first.rank - second.rank)
  return ranked.map(({ component }) => component)
}
