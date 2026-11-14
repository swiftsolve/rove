/**
 * Turns catalog entries into the text the rove-ui CLI prints: short enough for
 * an agent to read in one go, laid out for a person in a terminal. Colour
 * shows only on a terminal that shows it: `styleText` drops it when stdout is
 * piped, as an agent reads it, or NO_COLOR is set. The layout is the same
 * either way.
 */
import { styleText } from 'node:util'

import type { Guidance, PropEntry } from '../../../../scripts/lib/library-json-types.ts'
import type { ComponentListJson, NamedComponent } from '../catalog/catalog.ts'
import { partsOf } from '../catalog/catalog.ts'
import { figmaNodeUrl, storybookDocsUrl } from '../catalog/links.ts'

const INDENT = '  '

/** The widest a line runs, however wide the terminal: long lines read badly. */
export const MAX_LINE_WIDTH = 100

/** A section's title, in capitals so it stands out without colour: "PROPS". */
function headingText(text: string): string {
  return styleText(['bold', 'blueBright'], text.toUpperCase())
}

/** Text that supports what's beside it: a type, a default, a link. */
function quietText(text: string): string {
  return styleText('gray', text)
}

/** Code in backticks, picked out in colour; the backticks stay, so piped text reads the same. */
function withCodeHighlighted(text: string): string {
  return text.replace(/`[^`]+`/g, (code) => styleText('cyan', code))
}

/** A doc comment on one line, its wrapped lines joined. */
export function oneLine(text: string): string {
  return text.replace(/\s*\n\s*/g, ' ').trim()
}

/**
 * Text broken into lines of at most `width`, between words, each line after
 * the first starting with `indent`. A word longer than a line keeps its own.
 */
function wrapText(text: string, width: number, indent: string): string {
  const lines: string[] = []
  let line = ''
  for (const word of oneLine(text).split(' ')) {
    const widthWithWord = line.length + 1 + word.length
    if (line === '') {
      line = word
    } else if (widthWithWord <= width) {
      line += ` ${word}`
    } else {
      lines.push(line)
      line = word
    }
  }
  lines.push(line)
  return lines.join(`\n${indent}`)
}

/** A prop's type: its values when it has a fixed set (`'sm' | 'md'`), else its TypeScript type. */
export function propTypeText(prop: PropEntry): string {
  if (prop.values) {
    return prop.values.map((value) => (typeof value === 'string' ? `'${value}'` : String(value))).join(' | ')
  }
  return prop.type ?? 'unknown'
}

/** The props, a row each: the name in a column, its type and default, then its description beneath. */
function propsSection(component: NamedComponent, lineWidth: number): string[] {
  const props = Object.entries(component.props)
  if (props.length === 0) {
    return [`${headingText('Props')}  ${quietText('none')}`]
  }
  const nameWidth = Math.max(...props.map(([name]) => name.length)) + 2
  const descriptionIndent = INDENT + ' '.repeat(nameWidth)
  const descriptionWidth = lineWidth - descriptionIndent.length
  const rows = props.map(([name, prop]) => {
    let typeLine = styleText('bold', name.padEnd(nameWidth)) + propTypeText(prop)
    if (prop.isRequired) {
      typeLine += `  ${styleText('yellow', 'required')}`
    }
    if (prop.default !== undefined) {
      typeLine += `  ${quietText(`default ${prop.default}`)}`
    }
    const description = withCodeHighlighted(wrapText(prop.description, descriptionWidth, descriptionIndent))
    return `${INDENT}${typeLine}\n${descriptionIndent}${description}`
  })
  if (component.passesExtraPropsToElement) {
    rows.push(`${INDENT}${quietText('Any other prop passes straight to its element.')}`)
  }
  return [headingText('Props'), ...rows]
}

/** A titled list, a marked line per item, or nothing when the list is empty. */
function listSection(title: string, marker: string, items: string[], lineWidth: number): string[] {
  if (items.length === 0) {
    return []
  }
  const itemIndent = `${INDENT}  `
  const itemWidth = lineWidth - itemIndent.length
  const lines = items.map((item) => `${INDENT}${marker} ${withCodeHighlighted(wrapText(item, itemWidth, itemIndent))}`)
  return [headingText(title), ...lines]
}

/** The usage guide: when to use it (✓), when not (✗), then what's built in and what to handle. */
function guidanceSections(guidance: Guidance, lineWidth: number): string[][] {
  return [
    listSection('When to use', styleText('green', '✓'), guidance.whenToUse, lineWidth),
    listSection('When not to use', styleText('red', '✗'), guidance.whenNotToUse, lineWidth),
    listSection('Accessibility built in', quietText('-'), guidance.accessibility.builtIn, lineWidth),
    listSection('Accessibility to handle', quietText('-'), guidance.accessibility.toHandle, lineWidth),
  ]
}

/** One link row: a label in a column, then where it points. */
function linkRow(label: string, target: string): string {
  return `${INDENT}${label.padEnd(8)}${target}`
}

/** Where the component lives: its Docs page, Figma component and source file. */
function linksSection(catalog: ComponentListJson, component: NamedComponent): string[] {
  const rows: string[] = []
  const docsUrl = storybookDocsUrl(component)
  if (docsUrl !== null) {
    rows.push(linkRow('Docs', quietText(docsUrl)))
  }
  const figmaComponent = component.figmaComponent
  if (figmaComponent === null) {
    rows.push(linkRow('Figma', 'none'))
  } else if ('whyNoFigmaComponent' in figmaComponent) {
    rows.push(linkRow('Figma', `none. ${figmaComponent.whyNoFigmaComponent}`))
  } else {
    const figmaUrl = figmaNodeUrl(catalog.figmaFileUrl, figmaComponent.figmaNodeId)
    rows.push(linkRow('Figma', `${figmaComponent.figmaName}  ${quietText(figmaUrl)}`))
  }
  rows.push(linkRow('Source', quietText(component.sourceFile)))
  return [headingText('Links'), ...rows]
}

/** Where the component and its Figma component differ on purpose, with why. */
function figmaDifferencesSection(component: NamedComponent, lineWidth: number): string[] {
  const figmaComponent = component.figmaComponent
  if (figmaComponent === null || 'whyNoFigmaComponent' in figmaComponent) {
    return []
  }
  const propsNotInFigma = Object.entries(figmaComponent.propsNotInFigma ?? {})
  const variantPropertiesNotInCode = Object.entries(figmaComponent.figmaVariantPropertiesNotInCode ?? {})
  const propsWithDifferentValues = Object.entries(figmaComponent.propsWithDifferentValuesInFigma ?? {})
  const differences = [
    ...propsNotInFigma.map(([prop, why]) => `\`${prop}\` isn't in Figma: ${why}`),
    ...variantPropertiesNotInCode.map(([property, { note }]) => `Figma's ${property} has no prop: ${note}`),
    ...propsWithDifferentValues.map(([prop, why]) => `\`${prop}\` has other values in Figma: ${why}`),
  ]
  return listSection('Differs from Figma on purpose', quietText('-'), differences, lineWidth)
}

/** The story ids, without the title part every one shares, on as few lines as fit. */
function storiesSection(component: NamedComponent, lineWidth: number): string[] {
  if (component.storyIds.length === 0) {
    return []
  }
  const storyNames = component.storyIds.map((storyId) => storyId.split('--')[1] ?? storyId)
  const storyIndent = INDENT
  const storyList = wrapText(storyNames.join(', '), lineWidth - storyIndent.length, storyIndent)
  return [`${headingText('Stories')} ${quietText(`(${component.storyIds.length})`)}`, `${storyIndent}${storyList}`]
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

/** Everything the catalog knows about one component, section by section, lines at most `lineWidth`. */
export function componentDetailsText(catalog: ComponentListJson, component: NamedComponent, lineWidth: number): string {
  const title = `${styleText(['bold', 'blueBright'], component.name)}  ${quietText(component.libraryGroup)}`
  const header = [title, withCodeHighlighted(wrapText(component.description, lineWidth, ''))]
  if (component.partOf) {
    header.push(quietText(`Part of ${component.partOf}: rove-ui show ${component.partOf}`))
  }

  const parts = listSection(
    'Parts',
    quietText('-'),
    partsOf(catalog, component.name).map((part) => `${part.name}: ${oneLine(part.description)}`),
    lineWidth,
  )
  const guidance = component.guidance ? guidanceSections(component.guidance, lineWidth) : []

  const sections = [
    header,
    propsSection(component, lineWidth),
    parts,
    ...guidance,
    linksSection(catalog, component),
    figmaDifferencesSection(component, lineWidth),
    storiesSection(component, lineWidth),
  ]
  return sections
    .filter((section) => section.length > 0)
    .map((section) => section.join('\n'))
    .join('\n\n')
}
