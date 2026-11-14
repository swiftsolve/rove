/**
 * Turns catalog entries into the text the rove-ui CLI prints: short enough for
 * an agent to read in one go, laid out for a person in a terminal. Headings and
 * names take colour only on a terminal that shows it: `styleText` drops it
 * when stdout is piped, as an agent reads it, or NO_COLOR is set.
 */
import { styleText } from 'node:util'

import type { Guidance, PropEntry } from '../../../scripts/lib/library-json-types.ts'
import type { ComponentListJson, NamedComponent } from './catalog.ts'
import { partsOf } from './catalog.ts'
import { figmaNodeUrl, storybookDocsUrl } from './links.ts'

const INDENT = '  '

/** A section's title: "Props", "When to use". */
function headingText(text: string): string {
  return styleText(['bold', 'blueBright'], text)
}

/** Text that supports what's beside it: a type, a default, a link. */
function quietText(text: string): string {
  return styleText('gray', text)
}

/** A doc comment on one line, its wrapped lines joined. */
function oneLine(text: string): string {
  return text.replace(/\s*\n\s*/g, ' ').trim()
}

/** A prop's type: its values when it has a fixed set (`'sm' | 'md'`), else its TypeScript type. */
function propTypeText(prop: PropEntry): string {
  if (prop.values) {
    return prop.values.map((value) => (typeof value === 'string' ? `'${value}'` : String(value))).join(' | ')
  }
  return prop.type ?? 'unknown'
}

/** One prop: its name, type, default or required, then its description beneath. */
function propText(name: string, prop: PropEntry): string {
  let typeAndDefault = propTypeText(prop)
  if (prop.isRequired) {
    typeAndDefault += ' (required)'
  }
  if (prop.default !== undefined) {
    typeAndDefault += ` = ${prop.default}`
  }
  const heading = `${INDENT}${styleText('bold', name)}: ${quietText(typeAndDefault)}`
  return `${heading}\n${INDENT}${INDENT}${oneLine(prop.description)}`
}

/** A titled list, one line per item, or nothing when the list is empty. */
function listSection(title: string, lines: string[]): string[] {
  if (lines.length === 0) {
    return []
  }
  return [headingText(title), ...lines.map((line) => `${INDENT}- ${line}`)]
}

/** The usage guide's sections, in the order its Docs page shows them. */
function guidanceText(guidance: Guidance): string[] {
  return [
    ...listSection('When to use', guidance.whenToUse),
    ...listSection('When not to use', guidance.whenNotToUse),
    ...listSection('Accessibility, built in', guidance.accessibility.builtIn),
    ...listSection('Accessibility, to handle', guidance.accessibility.toHandle),
  ]
}

/** The component's Figma component and the ways it differs on purpose, or why it has none. */
function figmaText(catalog: ComponentListJson, component: NamedComponent): string[] {
  const figmaComponent = component.figmaComponent
  if (figmaComponent === null) {
    return [`${headingText('Figma:')} none`]
  }
  if ('whyNoFigmaComponent' in figmaComponent) {
    return [`${headingText('Figma:')} none. ${figmaComponent.whyNoFigmaComponent}`]
  }
  const figmaUrl = figmaNodeUrl(catalog.figmaFileUrl, figmaComponent.figmaNodeId)
  const lines = [`${headingText('Figma:')} ${figmaComponent.figmaName}, ${quietText(figmaUrl)}`]
  const propsNotInFigma = Object.entries(figmaComponent.propsNotInFigma ?? {})
  const variantPropertiesNotInCode = Object.entries(figmaComponent.figmaVariantPropertiesNotInCode ?? {})
  const propsWithDifferentValues = Object.entries(figmaComponent.propsWithDifferentValuesInFigma ?? {})
  lines.push(
    ...listSection('Differs from Figma on purpose', [
      ...propsNotInFigma.map(([prop, why]) => `${prop}, not in Figma: ${why}`),
      ...variantPropertiesNotInCode.map(([property, { note }]) => `Figma's ${property}, no prop: ${note}`),
      ...propsWithDifferentValues.map(([prop, why]) => `${prop}, other values in Figma: ${why}`),
    ]),
  )
  return lines
}

/** One line per component: its name, the family it's part of, and its description. */
export function componentLineText(component: NamedComponent): string {
  const family = component.partOf ? ` (part of ${component.partOf})` : ''
  return `${component.name}${family}: ${oneLine(component.description)}`
}

/** Every component under its group's heading, in the catalog's order. */
export function componentListText(components: NamedComponent[]): string {
  const linesByGroup = new Map<string, string[]>()
  for (const component of components) {
    const groupLines = linesByGroup.get(component.libraryGroup) ?? []
    groupLines.push(`${INDENT}${componentLineText(component)}`)
    linesByGroup.set(component.libraryGroup, groupLines)
  }
  const groupBlocks = [...linesByGroup].map(([group, lines]) => [group, ...lines].join('\n'))
  return groupBlocks.join('\n\n')
}

/** Everything the catalog knows about one component, section by section. */
export function componentDetailsText(catalog: ComponentListJson, component: NamedComponent): string {
  const title = `${styleText(['bold', 'blueBright'], component.name)} ${quietText(`(${component.libraryGroup})`)}`
  const header = [title, oneLine(component.description)]
  if (component.partOf) {
    header.push(`Part of ${component.partOf}: \`rove-ui show ${component.partOf}\``)
  }
  header.push(`Source: ${quietText(component.sourceFile)}`)
  const docsUrl = storybookDocsUrl(component)
  if (docsUrl !== null) {
    header.push(`Docs: ${quietText(docsUrl)}`)
  }

  const propLines = Object.entries(component.props).map(([name, prop]) => propText(name, prop))
  const props = propLines.length > 0 ? [headingText('Props'), ...propLines] : [`${headingText('Props:')} none`]
  if (component.passesExtraPropsToElement) {
    props.push(`${INDENT}Other props pass straight to its element.`)
  }

  const parts = listSection(
    'Parts',
    partsOf(catalog, component.name).map((part) => `${part.name}: ${oneLine(part.description)}`),
  )
  const guidance = component.guidance ? guidanceText(component.guidance) : []
  const stories = listSection('Stories', component.storyIds)

  const sections = [header, props, parts, guidance, figmaText(catalog, component), stories]
  return sections
    .filter((section) => section.length > 0)
    .map((section) => section.join('\n'))
    .join('\n\n')
}
