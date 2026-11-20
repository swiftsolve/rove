/**
 * Compares each Figma component's variant properties, as figma/components.json
 * exports them, with the props of the library components drawn in it:
 *
 *   - every Figma variant property (Tone, Size) is a prop of a component mapped
 *     to it, with the same values: `Tone=Accent` is `tone="accent"`, a
 *     `true`/`false` variant is a boolean prop (`Disabled` is `isDisabled`), and
 *     a part's prop takes its part's name (`Body layout` is CardBody's `layout`);
 *   - every prop with a fixed set of values has a Figma variant property.
 *
 * `State` (Hover, Focus) is how it looks under the pointer, not a prop, so it
 * isn't matched. A deliberate difference is written in figma-differences.json:
 * `propsNotInFigma` names a code prop Figma has no variant for, with why (where
 * a tooltip opens); `figmaVariantPropertiesNotInCode` names a Figma variant
 * code has no prop for, with the props that choose it and how (a Link is
 * External when it has `href`); `propsWithDifferentValuesInFigma` names a prop
 * whose values differ on purpose, with why. An exception that no longer applies
 * fails too, so the list stays true.
 */
import type {
  ExportedFigmaComponent,
  FigmaDifferences,
  NoFigmaComponent,
  PropEntry,
  VariantProperties,
} from './library-json-types.ts'

/** How a component looks under the pointer or keyboard, drawn as a variant in Figma. */
const INTERACTION_STATE = 'State'
const BOOLEAN_PREFIX = /^(is|has|can|should|was)(?=[A-Z])/
/** Figma's option for an optional prop left unset (Metric value's Status=None). */
const UNSET_OPTION = 'none'
const LITERAL_UNION = /^"[^"]+"( \| "[^"]+")*$/

/** Lowercase letters and digits only, so `Body layout`, `bodyLayout` and `Down only` compare. */
const comparisonKey = (text: string | number) =>
  String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

const isSameSet = (a: string[], b: string[]) => a.length === b.length && a.every((value) => b.includes(value))

/** A code prop's values to compare, or null when it takes anything (a string, a node). */
function valuesOf(prop: PropEntry): string[] | null {
  if (prop.values) return prop.values.map(String)
  if (prop.type === 'boolean') return ['false', 'true']
  // A single literal (`variant: 'error'`) reaches the component list as its type.
  const type = prop.type ?? ''
  if (LITERAL_UNION.test(type)) return type.split(' | ').map((literal) => literal.slice(1, -1))
  return null
}

/** The keys a Figma variant property may use for a prop: `isDisabled` is `Disabled`, CardBody's `layout` is `Body layout`. */
function keysFor(component: string, wholeComponent: string, propName: string): Set<string> {
  const part = component.startsWith(wholeComponent) ? component.slice(wholeComponent.length) : ''
  const bare = propName.replace(BOOLEAN_PREFIX, '')
  return new Set([
    comparisonKey(propName),
    comparisonKey(bare),
    ...(part ? [comparisonKey(part + propName), comparisonKey(part + bare)] : []),
  ])
}

/** The variant properties to match with props: all but the interaction state. */
const comparedVariants = (variantProperties: VariantProperties) =>
  Object.fromEntries(Object.entries(variantProperties).filter(([name]) => name !== INTERACTION_STATE))

/** One Figma component, the library components drawn in it, and what to compare them by. */
type NodeComparison = {
  figmaName: string
  variants: VariantProperties
  components: string[]
  differencesOf: (component: string) => FigmaDifferences
  propsOf: (component: string) => Record<string, PropEntry>
}

/** Each way one Figma component's variants and its library components' props disagree. */
function nodeProblems({ figmaName, variants, components, differencesOf, propsOf }: NodeComparison): string[] {
  const problems: string[] = []
  // The shortest name is the whole (Card); the rest are its parts (CardBody).
  const wholeComponent = components.toSorted((a, b) => a.length - b.length)[0] ?? ''
  const figmaVariantPropertiesNotInCode = new Set(
    components.flatMap((component) => Object.keys(differencesOf(component).figmaVariantPropertiesNotInCode ?? {})),
  )
  const matchedFigma = new Set<string>()

  for (const component of components) {
    const { propsNotInFigma = {}, propsWithDifferentValuesInFigma = {} } = differencesOf(component)
    const props = propsOf(component)

    for (const [propName, prop] of Object.entries(props)) {
      const values = valuesOf(prop)
      if (!values) continue
      const keys = keysFor(component, wholeComponent, propName)
      const variantName = Object.keys(variants).find((name) => keys.has(comparisonKey(name)))

      if (!variantName) {
        if (prop.values && !(propName in propsNotInFigma)) {
          problems.push(
            `${component}.${propName} (${values.join(', ')}) has no variant property on Figma's "${figmaName}": ` +
              `add one, or list it in figma-differences.json's propsNotInFigma with why`,
          )
        }
        continue
      }
      matchedFigma.add(variantName)
      if (propName in propsNotInFigma) {
        problems.push(
          `${component}.${propName} is in propsNotInFigma, but Figma's "${figmaName}" has it as ${variantName}`,
        )
      }

      const figmaOptions = variants[variantName] ?? []
      const codeValues = values.map(comparisonKey)
      const hasDefault = prop.default !== undefined
      // Figma's None stands for an optional prop left unset, which code has no value for.
      const isUnsetStandIn = (value: string) =>
        value === UNSET_OPTION && !hasDefault && !codeValues.includes(UNSET_OPTION)
      const figmaValues = figmaOptions.map(comparisonKey).filter((value) => !isUnsetStandIn(value))
      const isSame = isSameSet(codeValues, figmaValues)
      if (!isSame && !(propName in propsWithDifferentValuesInFigma)) {
        problems.push(
          `${component}.${propName} is ${values.join(' | ')} in code, ` +
            `but ${variantName} on Figma's "${figmaName}" is ${figmaOptions.join(' | ')}`,
        )
      } else if (isSame && propName in propsWithDifferentValuesInFigma) {
        problems.push(
          `${component}.${propName} is in propsWithDifferentValuesInFigma, but its values now match Figma's`,
        )
      }
    }

    for (const propName of Object.keys(propsNotInFigma)) {
      if (!(propName in props)) problems.push(`${component}: propsNotInFigma names ${propName}, which isn't a prop`)
    }
    for (const propName of Object.keys(propsWithDifferentValuesInFigma)) {
      if (!(propName in props))
        problems.push(`${component}: propsWithDifferentValuesInFigma names ${propName}, which isn't a prop`)
    }
  }

  for (const [variantName, options] of Object.entries(variants)) {
    if (matchedFigma.has(variantName) || figmaVariantPropertiesNotInCode.has(variantName)) continue
    problems.push(
      `Figma's "${figmaName}" has a ${variantName} variant (${options.join(', ')}) that no prop of ` +
        `${components.join(', ')} matches: add the prop, or list it in figma-differences.json's figmaVariantPropertiesNotInCode with the props it comes from`,
    )
  }
  for (const variantName of figmaVariantPropertiesNotInCode) {
    if (!(variantName in variants)) {
      problems.push(
        `${wholeComponent}: figmaVariantPropertiesNotInCode names ${variantName}, which Figma's "${figmaName}" doesn't have`,
      )
    } else if (matchedFigma.has(variantName)) {
      problems.push(
        `${wholeComponent}: figmaVariantPropertiesNotInCode names ${variantName}, but a prop now matches it`,
      )
    }
  }
  return problems
}

/**
 * Each way the exported Figma components' variants and the library's props
 * disagree, short of a difference figma-differences.json gives a reason for.
 */
export function variantProblems(
  exported: Record<string, ExportedFigmaComponent>,
  differences: Record<string, FigmaDifferences | NoFigmaComponent>,
  propsByComponent: Map<string, Record<string, PropEntry>>,
): string[] {
  // Several components can share one Figma component (Card, CardBody,
  // CardFooter), so its variants are matched against all of them at once.
  const componentsByNode = new Map<string, string[]>()
  for (const [component, { figmaNodeId }] of Object.entries(exported))
    componentsByNode.set(figmaNodeId, [...(componentsByNode.get(figmaNodeId) ?? []), component])

  const differencesOf = (component: string): FigmaDifferences => {
    const entry = differences[component]
    return entry && !('whyNoFigmaComponent' in entry) ? entry : {}
  }
  const propsOf = (component: string) => propsByComponent.get(component) ?? {}
  return [...componentsByNode.values()].flatMap((components) => {
    const first = exported[components[0] ?? '']
    if (!first) return []
    const variants = comparedVariants(first.variantProperties)
    return nodeProblems({ figmaName: first.figmaName, variants, components, differencesOf, propsOf })
  })
}
