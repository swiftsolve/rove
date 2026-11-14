/**
 * Read the library's side of the Rove Design System Figma file and check the
 * export in packages/ui/catalog/figma/ still matches it, so a change made in
 * Figma fails here until it's exported. `npm run figma:export` (`--export`)
 * writes the export instead:
 *
 *   - figma/components.json: each library component's Figma component, its
 *     node id and its variant properties. A component's Figma component is the
 *     one named its code name in sentence case (`IconButton` is "Icon button"),
 *     unless figma-differences.json gives another name (`CardBody` is drawn in
 *     "Card") or says why it has none. Two Figma components of one name, or
 *     none, fail.
 *   - figma/guides.json: each usage guide as Figma words it. A guide is the
 *     Guidance block in the component's docs section, or for a part with no
 *     Figma component of its own (CardBody, DialogRoot), the one under its name
 *     in the Parts block at the end of its family's section.
 *
 * `npm run gen` merges both into components.gen.json, offline, and compares
 * them with the code: each variant property with a prop (lib/figma-variants.ts),
 * each guide with the stories' guide.
 *
 * It needs a token and the network, and skips (passing) without either, so
 * `npm run check` still runs on a machine that has neither. FIGMA_TOKEN is a
 * personal access token with the `file_content:read` scope (Figma → Settings →
 * Security → Personal access tokens). Put it in `.env.local` as
 * `FIGMA_TOKEN=figd_…` (git-ignored), or set it in the shell. CI reads it from
 * the repository secret of the same name.
 *
 * An agent without a token can read the same data through the Figma MCP
 * (`use_figma`) and pass it in as `{ components, sections }`: `components` is
 * every component and component set that isn't a variant (id, name, type and
 * componentPropertyDefinitions), and `sections` each docs section's tree (name,
 * type, characters, children) by its name:
 *
 *   node scripts/checks/figma-export.ts [--export] [--from figma-data.json]
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import type {
  ComponentListJson,
  ExportedFigmaComponent,
  FigmaComponentsJson,
  FigmaDifferencesJson,
  FigmaGuidesJson,
  Guidance,
  VariantProperties,
} from '../lib/library-json-types.ts'
import { ROOT } from '../lib/source-dirs.ts'

const FIGMA_FILE_URL = 'https://www.figma.com/design/NoICIoyhWNOya9tOnNfEhH/Rove-Design-System'
const CATALOG_DIR = join(ROOT, 'packages/ui/catalog')
const COMPONENT_LIST = join(CATALOG_DIR, 'components.gen.json')
const FIGMA_DIFFERENCES_JSON = join(CATALOG_DIR, 'figma-differences.json')
const EXPORTED_COMPONENTS_JSON = join(CATALOG_DIR, 'figma/components.json')
const EXPORTED_GUIDES_JSON = join(CATALOG_DIR, 'figma/guides.json')
const EXPORT_COMMENT =
  'Exported from the Figma file by `npm run figma:export`; change it in Figma, then export again and run `npm run gen`.'
const FIGMA_API = 'https://api.figma.com/v1'
const COMPONENT_TYPES = new Set(['COMPONENT', 'COMPONENT_SET'])
// Text inside these is a live component, not the docs around it.
const INSTANCE_TYPES = new Set(['INSTANCE', 'COMPONENT', 'COMPONENT_SET'])
const isExport = process.argv.includes('--export')

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
/** The file's components (no variants), and the docs sections by name. */
type FigmaData = { components: FigmaNode[]; sections: Record<string, FigmaNode> }

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

/** Every component and component set in a tree, but not a set's variants. */
function componentsIn(node: FigmaNode): FigmaNode[] {
  if (COMPONENT_TYPES.has(node.type)) return [node]
  return (node.children ?? []).flatMap(componentsIn)
}

/** The file's components and the docs sections, from a file (`--from`) or the REST API. */
async function readFigma(fileKey: string, sectionNames: Set<string>): Promise<FigmaData> {
  const fromIndex = process.argv.indexOf('--from')
  if (fromIndex !== -1) {
    const fromPath = process.argv[fromIndex + 1]
    if (!fromPath) {
      console.error('--from takes the path of a JSON file')
      process.exit(1)
    }
    return JSON.parse(await readFile(resolve(fromPath), 'utf8')) as FigmaData
  }

  const token = await readToken()
  if (!token) {
    console.log('Figma skipped: no FIGMA_TOKEN in the shell or .env.local')
    process.exit(0)
  }
  // Pages, then their sections and frames, then what those hold: the main
  // components (with their variant properties) and the docs sections.
  const { document } = await fetchFigmaJson<FigmaFileAnswer>(token, `/files/${fileKey}?depth=3`)
  // The outline leaves out a set's variant properties, which Figma works out
  // from the variants inside it, so each set is asked for again with them.
  const outlineComponents = componentsIn(document)
  const setIds = outlineComponents.filter(({ type }) => type === 'COMPONENT_SET').map(({ id }) => id)
  const setAnswers =
    setIds.length > 0
      ? (await fetchFigmaJson<FigmaNodesAnswer>(token, `/files/${fileKey}/nodes?ids=${setIds.join(',')}&depth=1`)).nodes
      : {}
  const components = outlineComponents.map((node) => setAnswers[node.id]?.document ?? node)
  // A docs section is a frame on a page's top frame, named for its component.
  const sectionIds = (document.children ?? [])
    .flatMap((page) => page.children ?? [])
    .flatMap((frame) => frame.children ?? [])
    .filter((section) => sectionNames.has(section.name))
    .map((section) => section.id)
  const sectionAnswers =
    sectionIds.length > 0
      ? (await fetchFigmaJson<FigmaNodesAnswer>(token, `/files/${fileKey}/nodes?ids=${sectionIds.join(',')}`)).nodes
      : {}
  // Other pages reuse a component's name for a frame (a Card on a screen), so
  // only a frame holding a Guidance block is its docs section.
  const sections: Record<string, FigmaNode> = {}
  for (const answer of Object.values(sectionAnswers)) {
    if (answer?.document.children?.some(({ name }) => name === 'Guidance'))
      sections[answer.document.name] = answer.document
  }
  return { components, sections }
}

/** A node's direct child of that name. */
const childNamed = (node: FigmaNode | undefined, name: string) => node?.children?.find((child) => child.name === name)

/** A node's first descendant of that name, outer before inner (the "When to use" frame before its heading). */
function descendantNamed(node: FigmaNode | undefined, name: string): FigmaNode | undefined {
  for (const child of node?.children ?? []) {
    if (child.name === name) return child
    const found = descendantNamed(child, name)
    if (found) return found
  }
  return undefined
}

/** The lines of a list in a Guidance block: each `Item` frame's text. */
const itemLines = (list: FigmaNode | undefined) =>
  (list?.children ?? []).filter(({ name }) => name === 'Item').map((item) => textsOf(item).join(''))

/** A Guidance block's guide, read by its layers (Row › When to use › Body › Items › Item). */
function guideOf(block: FigmaNode): Guidance {
  const accessibilityBody = childNamed(descendantNamed(block, 'Accessibility'), 'Body')
  return {
    whenToUse: itemLines(descendantNamed(descendantNamed(block, 'When to use'), 'Items')),
    whenNotToUse: itemLines(descendantNamed(descendantNamed(block, 'When not to use'), 'Items')),
    accessibility: {
      builtIn: itemLines(childNamed(accessibilityBody, 'Built in')),
      toHandle: itemLines(childNamed(accessibilityBody, 'To handle')),
    },
  }
}

/**
 * Where a usage guide may sit in Figma: a docs section of its own, and for a
 * part, the Parts block of its family's section, under its heading there.
 */
type GuideLocation = { component: string; ownSection?: string; familySection?: string; partHeading: string }

/**
 * A component's Guidance block: its own docs section's, else, for a part, the
 * one under its heading in the Parts block at the end of its family's section.
 */
function guidanceBlockOf(location: GuideLocation, sections: Record<string, FigmaNode>): FigmaNode | undefined {
  const { ownSection, familySection, partHeading } = location
  const ownBlock = ownSection === undefined ? undefined : childNamed(sections[ownSection], 'Guidance')
  if (ownBlock) return ownBlock
  const familyParts = familySection === undefined ? undefined : childNamed(sections[familySection], 'Parts')
  return childNamed(childNamed(familyParts, partHeading), 'Guidance')
}

/** A code name in Figma's sentence case: `CardBody` is "Card body". */
const sentenceCase = (name: string) =>
  name.replace(/(?<=[a-z])(?=[A-Z])/g, ' ').replace(/ [A-Z]/g, (letter) => letter.toLowerCase())

/** A Figma component's variant properties, `{ Tone: ['Accent', …] }`. */
function variantsOf(node: FigmaNode): VariantProperties {
  return Object.fromEntries(
    Object.entries(node.componentPropertyDefinitions ?? {})
      .filter(([, { type }]) => type === 'VARIANT')
      .map(([name, { variantOptions }]) => [name, variantOptions ?? []]),
  )
}

const isDefined = <Value>(value: Value | undefined): value is Value => value !== undefined

const { components: componentList } = JSON.parse(await readFile(COMPONENT_LIST, 'utf8')) as ComponentListJson
const { components: differences } = JSON.parse(await readFile(FIGMA_DIFFERENCES_JSON, 'utf8')) as FigmaDifferencesJson
const fileKey = /figma\.com\/design\/([^/]+)/.exec(FIGMA_FILE_URL)?.[1] ?? ''
const problems: string[] = []

/** The name a component's Figma component has, or undefined when it has none. */
function figmaNameOf(component: string): string | undefined {
  const entry = differences[component]
  if (entry && 'whyNoFigmaComponent' in entry) return undefined
  return entry?.figmaName ?? sentenceCase(component)
}

/**
 * Each guided component's places in Figma. A part's own section counts only
 * when its Figma component is its own (CardBody shares Card's). One with
 * neither, like Collapsible's parts, has none and isn't read.
 */
function guideLocationsOf(): GuideLocation[] {
  const componentsByFigmaName = new Map<string, string[]>()
  for (const component of Object.keys(componentList)) {
    const figmaName = figmaNameOf(component)
    if (figmaName) componentsByFigmaName.set(figmaName, [...(componentsByFigmaName.get(figmaName) ?? []), component])
  }
  const locations: GuideLocation[] = []
  for (const [component, { guidance, partOf }] of Object.entries(componentList)) {
    if (!guidance) continue
    const figmaName = figmaNameOf(component)
    const isSharedNode = figmaName !== undefined && (componentsByFigmaName.get(figmaName)?.length ?? 0) > 1
    const ownSection = partOf && isSharedNode ? undefined : figmaName
    const familySection = partOf === undefined ? undefined : figmaNameOf(partOf)
    if (ownSection || familySection)
      locations.push({ component, ownSection, familySection, partHeading: sentenceCase(component) })
  }
  return locations
}

const guideLocations = guideLocationsOf()
const { components: figmaComponents, sections } = await readFigma(
  fileKey,
  new Set(guideLocations.flatMap(({ ownSection, familySection }) => [ownSection, familySection].filter(isDefined))),
)

// Each library component's Figma component, found by name.
const exportedComponents: Record<string, ExportedFigmaComponent> = {}
for (const component of Object.keys(componentList)) {
  const figmaName = figmaNameOf(component)
  if (figmaName === undefined) {
    // A component said to have none, which Figma now has under its own name.
    if (figmaComponents.some(({ name }) => name === sentenceCase(component)))
      problems.push(
        `${component}: Figma has a "${sentenceCase(component)}" component now: drop its whyNoFigmaComponent in figma-differences.json`,
      )
    continue
  }
  const matches = figmaComponents.filter(({ name }) => name === figmaName)
  const [match] = matches
  if (!match) {
    problems.push(
      `${component}: Figma has no component named "${figmaName}": build it, or give its Figma name or ` +
        `whyNoFigmaComponent in figma-differences.json`,
    )
  } else if (matches.length > 1) {
    const ids = matches.map(({ id }) => id).join(', ')
    problems.push(
      `${component}: Figma has ${matches.length} components named "${figmaName}" (${ids}): rename the extra ones`,
    )
  } else {
    exportedComponents[component] = { figmaName, figmaNodeId: match.id, variantProperties: variantsOf(match) }
  }
}

// The usage guides, read by their layers.
const exportedGuides: Record<string, Guidance> = {}
for (const location of guideLocations) {
  const block = guidanceBlockOf(location, sections)
  if (block) exportedGuides[location.component] = guideOf(block)
}

const componentsJson: FigmaComponentsJson = {
  $schema: '../../../../schemas/figma-components.schema.json',
  $comment: EXPORT_COMMENT,
  figmaFileUrl: FIGMA_FILE_URL,
  components: exportedComponents,
}
const guidesJson: FigmaGuidesJson = {
  $schema: '../../../../schemas/figma-guides.schema.json',
  $comment: EXPORT_COMMENT,
  guides: exportedGuides,
}
const asFileText = (data: unknown) => `${JSON.stringify(data, null, 2)}\n`
const exportFiles = [
  { path: EXPORTED_COMPONENTS_JSON, text: asFileText(componentsJson) },
  { path: EXPORTED_GUIDES_JSON, text: asFileText(guidesJson) },
]

if (problems.length > 0) {
  console.error(`The library and Figma are out of step:\n  ${problems.join('\n  ')}`)
  process.exit(1)
}
const counts = `${Object.keys(exportedComponents).length} components, ${Object.keys(exportedGuides).length} usage guides`
if (isExport) {
  for (const { path, text } of exportFiles) await writeFile(path, text)
  console.log(`Figma exported to packages/ui/catalog/figma/ (${counts}): run npm run gen`)
} else {
  const staleFiles: string[] = []
  for (const { path, text } of exportFiles) {
    if ((await readFile(path, 'utf8').catch(() => '')) !== text)
      staleFiles.push(`figma/${path.split('/').at(-1) ?? ''}`)
  }
  if (staleFiles.length > 0) {
    console.error(
      `Figma has changed since ${staleFiles.join(' and ')} was exported: run npm run figma:export, then npm run gen`,
    )
    process.exit(1)
  }
  console.log(`Figma OK (the export is current: ${counts})`)
}
