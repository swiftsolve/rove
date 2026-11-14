/**
 * The shapes of the UI library's JSON files in packages/ui/catalog/, as their
 * schemas in schemas/ define them: figma/components.json and figma/guides.json
 * (exported from Figma by checks/figma-export.ts), figma-differences.json
 * (edited by hand) and components.gen.json (written by gen/components.ts).
 * gen/components.ts holds each to its schema, so a script reading them can
 * trust these.
 */
import type { Guidance } from '../../packages/ui/.storybook/guidance.ts'

export type { Guidance }

/** A Figma variant property code has no prop for, and the props that choose it. */
export type FigmaVariantPropertyNotInCode = { fromProps: string[]; note: string }

/** Figma variant properties by name, each with its values: `{ Tone: ['Accent', 'Neutral'] }`. */
export type VariantProperties = Record<string, string[]>

/** A library component's Figma component, as figma/components.json exports it. */
export type ExportedFigmaComponent = { figmaName: string; figmaNodeId: string; variantProperties: VariantProperties }

/** figma/components.json: each library component's Figma component, exported from the file. */
export type FigmaComponentsJson = {
  $schema: string
  $comment: string
  figmaFileUrl: string
  components: Record<string, ExportedFigmaComponent>
}

/** figma/guides.json: each usage guide as the Figma file words it, by component. */
export type FigmaGuidesJson = { $schema: string; $comment: string; guides: Record<string, Guidance> }

/** How a library component differs from its Figma component on purpose. */
export type FigmaDifferences = {
  /** Its Figma name, when that isn't its code name in sentence case. */
  figmaName?: string
  propsNotInFigma?: Record<string, string>
  figmaVariantPropertiesNotInCode?: Record<string, FigmaVariantPropertyNotInCode>
  propsWithDifferentValuesInFigma?: Record<string, string>
}

/** A library component with no Figma counterpart, and why. */
export type NoFigmaComponent = { whyNoFigmaComponent: string }

/** figma-differences.json: the deliberate differences, by component; a matching component isn't listed. */
export type FigmaDifferencesJson = { $schema: string; components: Record<string, FigmaDifferences | NoFigmaComponent> }

/** A library component's Figma component in components.gen.json, with its deliberate differences. */
export type FigmaComponent = Omit<FigmaDifferences, 'figmaName'> & { figmaName: string; figmaNodeId: string }

/** One prop, as react-docgen-typescript reads it. */
export type PropEntry = {
  type?: string
  values?: (string | number)[]
  default?: string
  isRequired?: boolean
  description: string
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
  /** For a part, the family it belongs to: Card for CardBody. */
  partOf?: string
  guidance?: Guidance
  /** Its usage guide as Figma words it, for whoever designs with it, from figma/guides.json. */
  figmaGuidance?: Guidance
}

/** packages/ui/catalog/components.gen.json. */
export type ComponentListJson = {
  $schema: string
  $comment: string
  figmaFileUrl: string
  components: Record<string, ComponentEntry>
  iconNames: string[]
  otherExports: Record<string, string>
}
