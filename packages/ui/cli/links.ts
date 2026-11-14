/**
 * Where a component lives outside the catalog: its import line, its Docs page
 * in the published Storybook and its Figma component.
 */
import type { ComponentListJson, NamedComponent } from './catalog.ts'

/** The library's Storybook, as resync-sites publishes it. */
const STORYBOOK_URL = 'https://nabilr.com/rove/storybook/'

/** The line a feature writes to use the component. */
export function importLine(component: NamedComponent): string {
  return `import { ${component.name} } from '@swiftsolve/rove-ui'`
}

/**
 * The component's Docs page: its first story's id with `--docs` for the story
 * name. A part shown on its family's page has its family's stories, so it
 * opens that page.
 */
export function storybookDocsUrl(component: NamedComponent): string | null {
  const firstStoryId = component.storyIds[0]
  if (firstStoryId === undefined) {
    return null
  }
  const [docsTitleId] = firstStoryId.split('--')
  return `${STORYBOOK_URL}?path=/docs/${docsTitleId ?? firstStoryId}--docs`
}

/** A Figma node's address in the design file: `42:189` becomes `?node-id=42-189`. */
export function figmaNodeUrl(figmaFileUrl: string, figmaNodeId: string): string {
  return `${figmaFileUrl}?node-id=${figmaNodeId.replace(':', '-')}`
}

/** The component's Figma component, or null when it has none. */
export function figmaComponentUrl(catalog: ComponentListJson, component: NamedComponent): string | null {
  const figmaComponent = component.figmaComponent
  if (figmaComponent === null || 'whyNoFigmaComponent' in figmaComponent) {
    return null
  }
  return figmaNodeUrl(catalog.figmaFileUrl, figmaComponent.figmaNodeId)
}
