/**
 * The catalog as Markdown, for `--md`: what an agent reads with the fewest
 * tokens. No colour, no columns and no wrapping, each fact once, in headings
 * and lists an agent already knows how to read.
 */
import type { Guidance } from '../../../../scripts/lib/library-json-types.ts'
import type { ComponentListJson, NamedComponent } from '../catalog/catalog.ts'
import { partsOf } from '../catalog/catalog.ts'
import { figmaNodeUrl, storybookDocsUrl } from '../catalog/links.ts'
import { oneLine, propTypeText } from './text.ts'

/** A `##` section with a list item per line, or nothing when the list is empty. */
function listSection(title: string, items: string[]): string[] {
  if (items.length === 0) {
    return []
  }
  return [`## ${title}`, ...items.map((item) => `- ${item}`)]
}

/** The props as a list: name, type, required or default, then what it does. */
function propsSection(component: NamedComponent): string[] {
  const items = Object.entries(component.props).map(([name, prop]) => {
    let typeText = propTypeText(prop)
    if (prop.isRequired) {
      typeText += ', required'
    }
    if (prop.default !== undefined) {
      typeText += `, default ${prop.default}`
    }
    return `\`${name}\`: ${typeText}. ${oneLine(prop.description)}`
  })
  const section = items.length > 0 ? listSection('Props', items) : ['## Props', 'None.']
  if (component.passesExtraPropsToElement) {
    section.push('Any other prop passes straight to its element.')
  }
  return section
}

/** The usage guide, a section per part. */
function guidanceSections(guidance: Guidance): string[][] {
  return [
    listSection('When to use', guidance.whenToUse),
    listSection('When not to use', guidance.whenNotToUse),
    listSection('Accessibility built in', guidance.accessibility.builtIn),
    listSection('Accessibility to handle', guidance.accessibility.toHandle),
  ]
}

/** Its Docs page, Figma component (or why none) and source file. */
function linksSection(catalog: ComponentListJson, component: NamedComponent): string[] {
  const items: string[] = []
  const docsUrl = storybookDocsUrl(component)
  if (docsUrl !== null) {
    items.push(`Docs: ${docsUrl}`)
  }
  const figmaComponent = component.figmaComponent
  if (figmaComponent === null) {
    items.push('Figma: none')
  } else if ('whyNoFigmaComponent' in figmaComponent) {
    items.push(`Figma: none. ${figmaComponent.whyNoFigmaComponent}`)
  } else {
    items.push(`Figma: ${figmaComponent.figmaName}, ${figmaNodeUrl(catalog.figmaFileUrl, figmaComponent.figmaNodeId)}`)
  }
  items.push(`Source: ${component.sourceFile}`)
  return listSection('Links', items)
}

/** Where it differs from its Figma component on purpose, with why. */
function figmaDifferencesSection(component: NamedComponent): string[] {
  const figmaComponent = component.figmaComponent
  if (figmaComponent === null || 'whyNoFigmaComponent' in figmaComponent) {
    return []
  }
  const propsNotInFigma = Object.entries(figmaComponent.propsNotInFigma ?? {})
  const variantPropertiesNotInCode = Object.entries(figmaComponent.figmaVariantPropertiesNotInCode ?? {})
  const propsWithDifferentValues = Object.entries(figmaComponent.propsWithDifferentValuesInFigma ?? {})
  return listSection('Differs from Figma on purpose', [
    ...propsNotInFigma.map(([prop, why]) => `\`${prop}\` isn't in Figma: ${why}`),
    ...variantPropertiesNotInCode.map(([property, { note }]) => `Figma's ${property} has no prop: ${note}`),
    ...propsWithDifferentValues.map(([prop, why]) => `\`${prop}\` has other values in Figma: ${why}`),
  ])
}

/** One component in full, as Markdown. */
export function componentDetailsMarkdown(catalog: ComponentListJson, component: NamedComponent): string {
  const header = [`# ${component.name}`, `${component.libraryGroup}. ${oneLine(component.description)}`]
  if (component.partOf) {
    header.push(`Part of ${component.partOf}.`)
  }
  const parts = listSection(
    'Parts',
    partsOf(catalog, component.name).map((part) => `${part.name}: ${oneLine(part.description)}`),
  )
  const guidance = component.guidance ? guidanceSections(component.guidance) : []
  const storyNames = component.storyIds.map((storyId) => storyId.split('--')[1] ?? storyId)
  const stories = storyNames.length > 0 ? ['## Stories', storyNames.join(', ')] : []

  const sections = [
    header,
    propsSection(component),
    parts,
    ...guidance,
    linksSection(catalog, component),
    figmaDifferencesSection(component),
    stories,
  ]
  return sections
    .filter((section) => section.length > 0)
    .map((section) => section.join('\n'))
    .join('\n\n')
}

/** Components under a `##` heading per group, a list item each. */
export function componentListMarkdown(components: NamedComponent[]): string {
  const itemsByGroup = new Map<string, string[]>()
  for (const component of components) {
    const family = component.partOf ? ` (part of ${component.partOf})` : ''
    const groupItems = itemsByGroup.get(component.libraryGroup) ?? []
    groupItems.push(`- ${component.name}${family}: ${oneLine(component.description)}`)
    itemsByGroup.set(component.libraryGroup, groupItems)
  }
  return [...itemsByGroup].map(([group, items]) => [`## ${group}`, ...items].join('\n')).join('\n\n')
}
