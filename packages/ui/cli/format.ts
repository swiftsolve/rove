/**
 * Turns catalog entries into the plain text the rove-ui CLI prints: short
 * enough for an agent to read in one go, laid out for a person in a terminal.
 */
import type { Guidance, PropEntry } from '../../../scripts/lib/library-json-types.ts'
import type { ComponentListJson, NamedComponent } from './catalog.ts'
import { partsOf } from './catalog.ts'

const INDENT = '  '

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
  let heading = `${INDENT}${name}: ${propTypeText(prop)}`
  if (prop.isRequired) {
    heading += ' (required)'
  }
  if (prop.default !== undefined) {
    heading += ` = ${prop.default}`
  }
  return `${heading}\n${INDENT}${INDENT}${oneLine(prop.description)}`
}

/** A titled list, one line per item, or nothing when the list is empty. */
function listSection(title: string, lines: string[]): string[] {
  if (lines.length === 0) {
    return []
  }
  return [title, ...lines.map((line) => `${INDENT}- ${line}`)]
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

/** A Figma node's address in the design file: `42:189` becomes `?node-id=42-189`. */
function figmaNodeUrl(figmaFileUrl: string, figmaNodeId: string): string {
  return `${figmaFileUrl}?node-id=${figmaNodeId.replace(':', '-')}`
}

/** The component's Figma component and the ways it differs on purpose, or why it has none. */
function figmaText(catalog: ComponentListJson, component: NamedComponent): string[] {
  const figmaComponent = component.figmaComponent
  if (figmaComponent === null) {
    return ['Figma: none']
  }
  if ('whyNoFigmaComponent' in figmaComponent) {
    return [`Figma: none. ${figmaComponent.whyNoFigmaComponent}`]
  }
  const lines = [
    `Figma: ${figmaComponent.figmaName}, ${figmaNodeUrl(catalog.figmaFileUrl, figmaComponent.figmaNodeId)}`,
  ]
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
  const header = [`${component.name} (${component.libraryGroup})`, oneLine(component.description)]
  if (component.partOf) {
    header.push(`Part of ${component.partOf}: \`rove-ui show ${component.partOf}\``)
  }
  header.push(`Source: ${component.sourceFile}`)

  const propLines = Object.entries(component.props).map(([name, prop]) => propText(name, prop))
  const props = propLines.length > 0 ? ['Props', ...propLines] : ['Props: none']
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
