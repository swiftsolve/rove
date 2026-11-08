/**
 * Check the library against the Figma file, so a design change that lands on
 * one side only fails here instead of waiting for review:
 *
 *   - every node src/ui/figma-components.json names exists and is still called the name
 *     written beside it, and is a component or component set, not one variant;
 *   - every Figma variant property (Tone, Size) is a prop of a component mapped
 *     to it, with the same values: `Tone=Accent` is `tone="accent"`, a
 *     `true`/`false` variant is a boolean prop (`Disabled` is `isDisabled`), and
 *     a part's prop takes its part's name (`Body layout` is CardBody's `layout`);
 *   - every prop with a fixed set of values has a Figma variant property;
 *   - every usage guide in the stories (`guidance`) has its twin in the
 *     component's Figma docs section: When to use and When not to use, as many
 *     lines in each, and every alternative the code names under When not to
 *     use (`use `EmptyState``) named there too ("Empty state"). Figma words
 *     its lines for designers, so the wording itself is left to review.
 *     Accessibility isn't compared: Storybook's is for whoever builds with the
 *     component, Figma's for whoever designs with it, so each says what its
 *     reader handles.
 *
 * `State` (Hover, Focus) is how it looks under the pointer, not a prop, so it
 * isn't matched. A deliberate difference is written in the component's
 * figma-components.json entry: `propsNotInFigma` names a code prop Figma has
 * no variant for, with why (where a tooltip opens); `figmaVariantPropertiesNotInCode`
 * names a Figma variant code has no prop for, with the props that choose it
 * and how (a Link is External when it has `href`); `propsWithDifferentValuesInFigma` names a prop
 * whose values differ on purpose, with why. figma-components.schema.json says
 * the same. An exception that no longer applies fails too, so the list stays
 * true.
 *
 * It needs a token and the network, and skips (passing) without either, so
 * `npm run check` still runs on a machine that has neither. FIGMA_TOKEN is a
 * personal access token with the `file_content:read` scope (Figma → Settings →
 * Security → Personal access tokens). Put it in `.env.local` as
 * `FIGMA_TOKEN=figd_…` (git-ignored), or set it in the shell. CI reads it from
 * the repository secret of the same name.
 *
 * An agent without a token can read the same data through the Figma MCP
 * (`use_figma`) and pass it in as `{ nodes, docs }`: `nodes` is each mapped
 * node's name, type and componentPropertyDefinitions by id, and `docs` each
 * docs section's text, in order and outside component instances, by its name:
 *
 *   node scripts/checks/figma-library.ts [--from figma-data.json]
 */
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { ComponentListJson, FigmaComponent, FigmaComponentsJson, PropEntry } from '../lib/library-json-types.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const FIGMA_COMPONENTS_JSON = join(ROOT, 'src/ui/figma-components.json')
const COMPONENT_LIST = join(ROOT, 'src/ui/components.gen.json')
const FIGMA_API = 'https://api.figma.com/v1'
const COMPONENT_TYPES = new Set(['COMPONENT', 'COMPONENT_SET'])
// One variant of a set is a component named for its values: `Size=Md, State=Hover`.
const VARIANT_NAME = /^[^=,]+=[^=]*(, [^=,]+=[^=]*)*$/
// How a component looks under the pointer or keyboard, drawn as a variant in Figma.
const INTERACTION_STATE = 'State'
const BOOLEAN_PREFIX = /^(is|has|can|should|was)(?=[A-Z])/
// Figma's option for an optional prop left unset (Metric value's Status=None).
const UNSET_OPTION = 'none'
const LITERAL_UNION = /^"[^"]+"( \| "[^"]+")*$/
// Text inside these is a live component, not the docs around it.
const INSTANCE_TYPES = new Set(['INSTANCE', 'COMPONENT', 'COMPONENT_SET'])
// A docs section's guide headings, as Storybook's Docs page has them (.storybook/docs-page.tsx).
const GUIDE_LABELS = {
  whenToUse: 'When to use',
  whenNotToUse: 'When not to use',
  accessibility: 'Accessibility',
}

/** The part of a Figma node this check reads, from the REST API or `use_figma`. */
type FigmaNode = {
  id: string
  name: string
  type: string
  characters?: string
  children?: FigmaNode[]
  componentPropertyDefinitions?: Record<string, { type: string; variantOptions?: string[] }>
}
/** One node the REST API was asked for: null when the file has no node with that id. */
type NodeAnswer = { document: FigmaNode } | null
/** The REST API's answer for nodes by id (`/files/:key/nodes`). */
type FigmaNodesAnswer = { nodes: Record<string, NodeAnswer> }
/** The REST API's answer for a whole file (`/files/:key`), to the depth asked for. */
type FigmaFileAnswer = { document: FigmaNode }
/** Figma nodes by id: undefined where the file has no such node. */
type FigmaNodesById = Record<string, FigmaNode | undefined>
/** The mapped nodes by id, and each docs section's text by its name (none from a file that has only nodes). */
type FigmaData = { nodes: FigmaNodesById; docs?: Record<string, string[]> }
/** A guide's lines per section. */
type GuideLines = { whenToUse: string[]; whenNotToUse: string[] }

/** Lowercase letters and digits only, so `Body layout`, `bodyLayout` and `Down only` compare. */
const comparisonKey = (text: string | number) =>
  String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

/** FIGMA_TOKEN from the shell, else from the git-ignored .env.local. */
async function readToken(): Promise<string | undefined> {
  if (process.env.FIGMA_TOKEN) return process.env.FIGMA_TOKEN
  const env = await readFile(join(ROOT, '.env.local'), 'utf8').catch(() => '')
  return /^\s*FIGMA_TOKEN\s*=\s*["']?([^"'\s]+)/m.exec(env)?.[1]
}

/** Why a request failed: the network's code (`ENOTFOUND`) when it gives one, else the error's message. */
function failureReason(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const { cause } = error
  const code = cause instanceof Object && 'code' in cause ? cause.code : undefined
  return typeof code === 'string' ? code : error.message
}

/**
 * A REST API answer, as JSON. Offline skips, and so does a server error that
 * outlasts two retries; a bad token or file key answers, and fails.
 */
async function fetchFigmaJson<Answer>(token: string, path: string): Promise<Answer> {
  let response: Response | undefined
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((done) => setTimeout(done, attempt * 2000))
    response = await fetch(`${FIGMA_API}${path}`, { headers: { 'X-Figma-Token': token } }).catch((error: unknown) => {
      console.log(`Figma skipped: Figma couldn't be reached (${failureReason(error)})`)
      process.exit(0)
    })
    if (response.status < 500) break
  }
  if (!response || response.status >= 500) {
    console.log(`Figma skipped: Figma answered ${String(response?.status)} three times`)
    process.exit(0)
  }
  if (!response.ok) {
    console.error(`Figma answered ${response.status}: ${await response.text()}`)
    process.exit(1)
  }
  return (await response.json()) as Answer
}

/** A node's text in document order, leaving out what's inside a component or its instances. */
function textsOf(node: FigmaNode): string[] {
  if (INSTANCE_TYPES.has(node.type)) return []
  if (node.type === 'TEXT') return [node.characters ?? '']
  return (node.children ?? []).flatMap(textsOf)
}

/** The mapped nodes and the docs sections' text, from a file (`--from`) or the REST API. */
async function readFigma(fileKey: string, nodeIds: string[], sectionNames: Set<string>): Promise<FigmaData> {
  const fromIndex = process.argv.indexOf('--from')
  if (fromIndex !== -1) {
    const fromPath = process.argv[fromIndex + 1]
    if (!fromPath) {
      console.error('--from takes the path of a JSON file')
      process.exit(1)
    }
    // A file from `use_figma` holds `{ nodes, docs }`, or the nodes alone.
    const figmaData = JSON.parse(await readFile(resolve(fromPath), 'utf8')) as FigmaData | FigmaNodesById
    return 'nodes' in figmaData ? (figmaData as FigmaData) : { nodes: figmaData }
  }

  const token = await readToken()
  if (!token) {
    console.log('Figma skipped: no FIGMA_TOKEN in the shell or .env.local')
    process.exit(0)
  }
  const { nodes } = await fetchFigmaJson<FigmaNodesAnswer>(
    token,
    `/files/${fileKey}/nodes?ids=${nodeIds.join(',')}&depth=1`,
  )

  // A docs section is a frame on a page's top frame, named for its component.
  const { document } = await fetchFigmaJson<FigmaFileAnswer>(token, `/files/${fileKey}?depth=3`)
  const sectionIds = (document.children ?? [])
    .flatMap((page) => page.children ?? [])
    .flatMap((frame) => frame.children ?? [])
    .filter((section) => sectionNames.has(section.name))
    .map((section) => section.id)
  const sections =
    sectionIds.length > 0
      ? (await fetchFigmaJson<FigmaNodesAnswer>(token, `/files/${fileKey}/nodes?ids=${sectionIds.join(',')}`)).nodes
      : {}
  const docs: Record<string, string[]> = {}
  for (const answer of Object.values(sections)) {
    if (!answer) continue
    const texts = textsOf(answer.document)
    if (texts.includes(GUIDE_LABELS.whenToUse)) docs[answer.document.name] = texts
  }
  return { nodes: Object.fromEntries(Object.entries(nodes).map(([id, answer]) => [id, answer?.document])), docs }
}

/** A Figma guide's lines per section, read off its docs section's text. */
function figmaGuide(texts: string[]): GuideLines | null {
  const at = (label: string, from: number) => texts.indexOf(label, from)
  const whenToUse = at(GUIDE_LABELS.whenToUse, 0)
  const whenNotToUse = at(GUIDE_LABELS.whenNotToUse, whenToUse)
  const accessibility = at(GUIDE_LABELS.accessibility, whenNotToUse)
  if ([whenToUse, whenNotToUse, accessibility].includes(-1)) return null
  return {
    whenToUse: texts.slice(whenToUse + 1, whenNotToUse),
    whenNotToUse: texts.slice(whenNotToUse + 1, accessibility),
  }
}

/** A Figma node's variant properties, `{ Tone: ['Accent', …] }`, without the interaction state. */
function variantsOf(node: FigmaNode): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(node.componentPropertyDefinitions ?? {})
      .filter(([name, { type }]) => type === 'VARIANT' && name !== INTERACTION_STATE)
      .map(([name, { variantOptions }]) => [name, variantOptions ?? []]),
  )
}

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

const isSameSet = (a: string[], b: string[]) => a.length === b.length && a.every((value) => b.includes(value))

const { figmaFileUrl, components: mapping } = JSON.parse(
  await readFile(FIGMA_COMPONENTS_JSON, 'utf8'),
) as FigmaComponentsJson
const { components: componentList } = JSON.parse(await readFile(COMPONENT_LIST, 'utf8')) as ComponentListJson
const fileKey = /figma\.com\/design\/([^/]+)/.exec(figmaFileUrl)?.[1]
if (!fileKey) {
  console.error(`figma-components.json's figmaFileUrl isn't a figma.com/design URL: ${figmaFileUrl}`)
  process.exit(1)
}

// Several components can share one Figma node (Card, CardBody, CardFooter), so
// each node is asked for once and its variants are matched against all of them.
const mappedEntries: [component: string, entry: FigmaComponent][] = []
for (const [component, entry] of Object.entries(mapping)) {
  if ('figmaNodeId' in entry) mappedEntries.push([component, entry])
}
const mappedComponents = new Map(mappedEntries)
const componentsByNode = new Map<string, string[]>()
for (const [component, entry] of mappedEntries)
  componentsByNode.set(entry.figmaNodeId, [...(componentsByNode.get(entry.figmaNodeId) ?? []), component])

const guidedEntries = mappedEntries.filter(([component]) => componentList[component]?.guidance)
const { nodes, docs } = await readFigma(
  fileKey,
  [...componentsByNode.keys()],
  new Set(guidedEntries.map(([, { figmaName }]) => figmaName)),
)
const problems: string[] = []

for (const [nodeId, components] of componentsByNode) {
  const figmaNode = nodes[nodeId]
  if (!figmaNode) {
    problems.push(`${components.join(', ')}: node ${nodeId} isn't in the Figma file`)
    continue
  }
  for (const component of components) {
    const { figmaName } = mappedComponents.get(component) ?? {}
    if (figmaNode.name !== figmaName) {
      problems.push(`${component}: node ${nodeId} is "${figmaNode.name}" in Figma, not "${String(figmaName)}"`)
    }
  }
  if (!COMPONENT_TYPES.has(figmaNode.type) || VARIANT_NAME.test(figmaNode.name)) {
    problems.push(
      `${components.join(', ')}: node ${nodeId} isn't a component: map the component or its set, not a variant`,
    )
    continue
  }

  // The shortest name is the whole (Card); the rest are its parts (CardBody).
  const wholeComponent = [...components].sort((a, b) => a.length - b.length)[0] ?? ''
  const figmaVariants = variantsOf(figmaNode)
  const figmaVariantPropertiesNotInCode = Object.assign(
    {},
    ...components.map((component) => mappedComponents.get(component)?.figmaVariantPropertiesNotInCode),
  ) as Record<string, unknown>
  const matchedFigma = new Set<string>()

  for (const component of components) {
    const { propsNotInFigma = {}, propsWithDifferentValuesInFigma = {} } = mappedComponents.get(component) ?? {}
    const props = componentList[component]?.props ?? {}

    for (const [propName, prop] of Object.entries(props)) {
      const values = valuesOf(prop)
      if (!values) continue
      const keys = keysFor(component, wholeComponent, propName)
      const figmaName = Object.keys(figmaVariants).find((name) => keys.has(comparisonKey(name)))

      if (!figmaName) {
        if (prop.values && !(propName in propsNotInFigma)) {
          problems.push(
            `${component}.${propName} (${values.join(', ')}) has no variant property on Figma's "${figmaNode.name}": ` +
              `add one, or list it in figma-components.json's propsNotInFigma with why`,
          )
        }
        continue
      }
      matchedFigma.add(figmaName)
      if (propName in propsNotInFigma) {
        problems.push(
          `${component}.${propName} is in propsNotInFigma, but Figma's "${figmaNode.name}" has it as ${figmaName}`,
        )
      }

      const figmaOptions = figmaVariants[figmaName] ?? []
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
            `but ${figmaName} on Figma's "${figmaNode.name}" is ${figmaOptions.join(' | ')}`,
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

  for (const [figmaName, options] of Object.entries(figmaVariants)) {
    if (matchedFigma.has(figmaName) || figmaName in figmaVariantPropertiesNotInCode) continue
    problems.push(
      `Figma's "${figmaNode.name}" has a ${figmaName} variant (${options.join(', ')}) that no prop of ` +
        `${components.join(', ')} matches: add the prop, or list it in figma-components.json's figmaVariantPropertiesNotInCode with the props it comes from`,
    )
  }
  for (const figmaName of Object.keys(figmaVariantPropertiesNotInCode)) {
    if (!(figmaName in figmaVariants)) {
      problems.push(
        `${wholeComponent}: figmaVariantPropertiesNotInCode names ${figmaName}, which Figma's "${figmaNode.name}" doesn't have`,
      )
    } else if (matchedFigma.has(figmaName)) {
      problems.push(`${wholeComponent}: figmaVariantPropertiesNotInCode names ${figmaName}, but a prop now matches it`)
    }
  }
}

// The usage guides. A component the code names is looked for by its Figma
// name, or its own for one Figma lacks; spaces and case don't count, so
// StretchedLink is found as "Stretched link".
const figmaNameOf = (component: string) => mappedComponents.get(component)?.figmaName ?? component
for (const [component, { figmaName }] of docs ? guidedEntries : []) {
  const guide = componentList[component]?.guidance
  if (!guide) continue
  const { whenToUse: whenToUseLines, whenNotToUse: whenNotToUseLines } = guide
  const texts = docs?.[figmaName]
  const figmaGuideLines = texts && figmaGuide(texts)
  if (!figmaGuideLines) {
    problems.push(`${component} has a usage guide, but Figma's "${figmaName}" docs section has none: add it there`)
    continue
  }
  const sections = [
    { label: GUIDE_LABELS.whenToUse, lines: whenToUseLines, figmaLines: figmaGuideLines.whenToUse },
    { label: GUIDE_LABELS.whenNotToUse, lines: whenNotToUseLines, figmaLines: figmaGuideLines.whenNotToUse },
  ]
  for (const { label, lines, figmaLines } of sections) {
    if (lines.length !== figmaLines.length) {
      problems.push(
        `${component}'s usage guide has ${lines.length} ${label} lines in code, ${figmaLines.length} in Figma's "${figmaName}": ` +
          `bring the side that's behind up to date`,
      )
    }
  }
  const insteadText = comparisonKey(figmaGuideLines.whenNotToUse.join(' '))
  const namedAlternatives = new Set(
    whenNotToUseLines.flatMap((line) => [...line.matchAll(/`([A-Z]\w+)`/g)].map(([, alternative = '']) => alternative)),
  )
  for (const alternative of namedAlternatives) {
    if (!(alternative in componentList) || insteadText.includes(comparisonKey(figmaNameOf(alternative)))) continue
    problems.push(
      `${component}'s usage guide names ${alternative} under ${GUIDE_LABELS.whenNotToUse}; Figma's "${figmaName}" doesn't`,
    )
  }
}

if (problems.length > 0) {
  console.error(`The library and Figma are out of step:\n  ${problems.join('\n  ')}`)
  process.exit(1)
}
const guides = docs ? `, and ${guidedEntries.length} usage guides` : ''
console.log(`Figma OK (${componentsByNode.size} nodes, their names and variants${guides})`)
