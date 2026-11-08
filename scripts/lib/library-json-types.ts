/**
 * The shapes of the UI library's two JSON files, as their schemas in schemas/
 * define them: src/ui/figma-components.json (edited by hand) and
 * src/ui/components.gen.json (written by gen/components.ts). gen/components.ts
 * holds both files to their schemas, so a script reading them can trust these.
 */

/** A Figma variant property code has no prop for, and the props that choose it. */
export type FigmaVariantPropertyNotInCode = { fromProps: string[]; note: string }

/** A library component's Figma component, and its deliberate differences from it. */
export type FigmaComponent = {
  figmaName: string
  figmaNodeId: string
  propsNotInFigma?: Record<string, string>
  figmaVariantPropertiesNotInCode?: Record<string, FigmaVariantPropertyNotInCode>
  propsWithDifferentValuesInFigma?: Record<string, string>
}

/** A library component with no Figma counterpart, and why. */
export type NoFigmaComponent = { whyNoFigmaComponent: string }

/** src/ui/figma-components.json. */
export type FigmaComponentsJson = {
  figmaFileUrl: string
  components: Record<string, FigmaComponent | NoFigmaComponent>
}

/** One prop, as react-docgen-typescript reads it. */
export type PropEntry = {
  type?: string
  values?: (string | number)[]
  default?: string
  isRequired?: boolean
  description: string
}

/** A component's usage guide, from its stories' `guidance` parameter. */
export type Guidance = {
  whenToUse?: string[]
  whenNotToUse?: string[]
  accessibility?: { builtIn?: string[]; toHandle?: string[] }
}

/** One component in components.gen.json. */
export type ComponentEntry = {
  libraryGroup: string
  sourceFile: string
  description: string
  figmaComponent: FigmaComponent | NoFigmaComponent | null
  props: Record<string, PropEntry>
  // eslint-disable-next-line @typescript-eslint/naming-convention -- a key components.gen.json already publishes; renaming it is its own change
  passesExtraPropsToElement?: boolean
  storyIds: string[]
  guidance?: Guidance
}

/** src/ui/components.gen.json. */
export type ComponentListJson = {
  $schema: string
  $comment: string
  figmaFileUrl: string
  components: Record<string, ComponentEntry>
  iconNames: string[]
  otherExports: Record<string, string>
}
