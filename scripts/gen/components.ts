/**
 * Write `packages/ui/catalog/components.gen.json`: the UI library's public API in one file, so
 * an agent (or a person) learns it without opening every component. For each
 * component it lists:
 *
 *   - its group, from the comment above it in `packages/ui/src/index.ts`;
 *   - its description and props (type, variant values, default), read from
 *     the code with react-docgen-typescript, as Storybook's docs tables are;
 *   - its Figma component, from `packages/ui/catalog/figma/components.json`
 *     (which `npm run figma:export` writes), with its deliberate differences
 *     from `figma-differences.json` (kept by hand);
 *   - its stories' ids, for `localhost:6006/?path=/story/<id>`;
 *   - its usage guide (when to use it, when not, accessibility), from its
 *     stories' `guidance` parameter, as its Docs page shows it, or for a part
 *     on its family's page, the family's `partGuidance`;
 *   - its usage guide as Figma words it (`figmaGuidance`), from
 *     `packages/ui/catalog/figma/guides.json`, the same export;
 *   - for a part, the family it belongs to (`partOf`).
 *
 * Icons, hooks and helpers follow, by name and doc comment.
 *
 *   node scripts/gen/components.ts           # rewrite components.gen.json
 *   node scripts/gen/components.ts --check   # fail if it's stale or incomplete
 *
 * `--check`, part of `npm run lint`, also fails when a component or one of its
 * own props has no doc comment, or a component has no Figma component and
 * figma-differences.json doesn't say why (`whyNoFigmaComponent`), or Figma's
 * variant properties and its props differ where figma-differences.json gives
 * no reason (lib/figma-variants.ts), or a
 * component has no usage guide: on its own Docs page (`Actions/Button`,
 * `Containers/Card/CardHeader`), or for a part shown on its family's page
 * (MenuItem on `Actions/Menu`), in that page's `partGuidance`; or a usage
 * guide and its Figma one in figma/guides.json fall out of step (line counts,
 * named alternatives), or Figma draws a guided component with no guide.
 *
 * It fails, too, when a component takes a handler (`onClick`, `onBack`) and
 * its stories have none that drives it (a `play` function, tagged
 * `!autodocs`).
 */
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { type ComponentDoc, type PropItem, withCustomConfig } from 'react-docgen-typescript'
import { storyNameFromExport, toId } from 'storybook/internal/csf'
import ts from 'typescript'

import { variantProblems } from '../lib/figma-variants.ts'
import { schemaProblems } from '../lib/json-schema.ts'
import type {
  ComponentEntry,
  ComponentListJson,
  FigmaComponent,
  FigmaComponentsJson,
  FigmaDifferencesJson,
  FigmaGuidesJson,
  Guidance,
  NoFigmaComponent,
  PropEntry,
} from '../lib/library-json-types.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const UI_DIR = join(ROOT, 'packages/ui/src')
const UI_INDEX = join(UI_DIR, 'index.ts')
const CATALOG_DIR = join(ROOT, 'packages/ui/catalog')
const COMPONENT_LIST = join(CATALOG_DIR, 'components.gen.json')
/** Exported from Figma by `npm run figma:export`, and kept by hand beside them. */
const FIGMA_COMPONENTS_JSON = join(CATALOG_DIR, 'figma/components.json')
const FIGMA_GUIDES_JSON = join(CATALOG_DIR, 'figma/guides.json')
const FIGMA_DIFFERENCES_JSON = join(CATALOG_DIR, 'figma-differences.json')
/** Each file's schema says what every key means; every file is held to its own. */
const COMPONENT_LIST_SCHEMA = join(ROOT, 'schemas/components.schema.json')
const FIGMA_COMPONENTS_SCHEMA = join(ROOT, 'schemas/figma-components.schema.json')
const FIGMA_GUIDES_SCHEMA = join(ROOT, 'schemas/figma-guides.schema.json')
const FIGMA_DIFFERENCES_SCHEMA = join(ROOT, 'schemas/figma-differences.schema.json')
const isCheck = process.argv.includes('--check')

/** A component the index exports, under its group's comment, and the file it comes from. */
type LibraryComponent = { name: string; group: string; source: string }
/** What a component's stories file gives: its story ids, and whether it drives the component and has a guide. */
type StoriesInfo = {
  ids: string[]
  file: string | null
  hasInteraction?: boolean
  guidance?: Guidance | null
  /** The family a part belongs to, whose Docs page or Figma section holds it: Card for CardBody. */
  partOf?: string
}
/** A `guidance` literal as plain data. */
type GuidanceData = string | GuidanceData[] | { [key: string]: GuidanceData }

const problems: string[] = []
const relativeToRoot = (path: string) => relative(ROOT, path)

/**
 * The index's grouped exports: a `// Group` line starts a group, a blank line
 * ends it. Exports outside a group (icons, hooks, helpers) aren't components.
 */
async function readIndex(): Promise<LibraryComponent[]> {
  const components: LibraryComponent[] = []
  let group: string | null = null
  for (const line of (await readFile(UI_INDEX, 'utf8')).split('\n')) {
    const [, groupComment] = /^\/\/ (.+)$/.exec(line) ?? []
    if (groupComment) group = groupComment
    if (line.trim() === '') group = null
    const [, exportedNames, fromPath] = /^export \{ (.+) \} from '(.+)'$/.exec(line) ?? []
    if (!exportedNames || !fromPath || !group) continue
    const source = join(UI_DIR, `${fromPath}.tsx`)
    for (const name of exportedNames.split(', ')) {
      // A component is PascalCase; types and constants (POLLING_DESCRIPTION) aren't.
      if (/^[A-Z][a-z]/.test(name)) components.push({ name, group, source })
    }
  }
  return components
}

function readProps(components: LibraryComponent[]): { docs: Map<string, ComponentDoc>; elementProps: Set<string> } {
  const elementProps = new Set<string>()
  const parser = withCustomConfig(join(ROOT, 'packages/ui/tsconfig.json'), {
    shouldExtractLiteralValuesFromEnum: true,
    shouldRemoveUndefinedFromOptional: true,
    savePropValueAsString: true,
    // Storybook's table lists an undocumented `children`, so the check must see it.
    skipChildrenPropWithoutDoc: false,
    // A prop from a package is the DOM element's own attribute, passed through.
    propFilter: (prop, component) => {
      const isOwn = !prop.parent?.fileName.includes('node_modules')
      if (!isOwn) elementProps.add(component.name)
      return isOwn
    },
  })
  const sources = [...new Set(components.map(({ source }) => source))]
  const docs = new Map(parser.parse(sources).map((doc) => [doc.displayName, doc]))
  return { docs, elementProps }
}

function describeProp(prop: PropItem): PropEntry {
  const entry: Partial<PropEntry> = {}
  // An enum's members, each as its source text: `"sm"`, `2`, or a type name.
  const enumMembers = prop.type.name === 'enum' ? (prop.type.value as { value: string }[] | undefined) : undefined
  if (enumMembers?.every(({ value }) => /^["\d]/.test(value))) {
    entry.values = enumMembers.map(({ value }) => JSON.parse(value) as string | number)
  } else {
    entry.type = prop.type.raw ?? prop.type.name
  }
  const defaultValue = (prop.defaultValue as { value?: string } | null)?.value
  if (defaultValue !== undefined) entry.default = defaultValue
  if (prop.required) entry.isRequired = true
  // An empty one is reported above, and fails the schema check.
  return { ...entry, description: prop.description }
}

/**
 * An object literal property in a stories file, as plain data: its string
 * arrays and nested objects. Null when the file sets none. `guidance` is the
 * page's own guide; `partGuidance` holds its parts' guides by name.
 */
function readGuideProperty(file: string, text: string, key: 'guidance' | 'partGuidance'): GuidanceData | null {
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const toData = (node: ts.Expression): GuidanceData => {
    if (ts.isSatisfiesExpression(node) || ts.isAsExpression(node)) return toData(node.expression)
    if (ts.isStringLiteralLike(node)) return node.text
    if (ts.isArrayLiteralExpression(node)) return node.elements.map(toData)
    if (ts.isObjectLiteralExpression(node)) {
      return Object.fromEntries(
        node.properties.map((property) => {
          if (!ts.isPropertyAssignment(property)) throw notPlainData()
          return [property.name.getText(), toData(property.initializer)]
        }),
      )
    }
    throw notPlainData()
  }
  const notPlainData = () => new Error(`${relativeToRoot(file)}: ${key} holds only strings, arrays and objects`)
  const findProperty = (node: ts.Node): ts.Expression | undefined => {
    if (ts.isPropertyAssignment(node) && node.name.getText() === key) return node.initializer
    return ts.forEachChild(node, findProperty)
  }
  const property = findProperty(sourceFile)
  // The schema check below holds the data to Guidance's shape.
  return property ? toData(property) : null
}

function ownStoriesFile(source: string, name: string): string {
  return join(dirname(source), `${name}.stories.tsx`)
}

/**
 * A part in `components/`, `context/` or `hooks/` inside a family's folder
 * takes the stories of the family's main component, named for the folder
 * (title-bar/ ↔ TitleBar.stories.tsx). Null for a module at a family's top.
 */
function familyStoriesFile(source: string): string | null {
  const partFolder = dirname(source)
  if (!['components', 'context', 'hooks'].includes(basename(partFolder))) return null
  const familyFolder = dirname(partFolder)
  const familyName = basename(familyFolder)
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
  return join(familyFolder, `${familyName}.stories.tsx`)
}

/**
 * Story ids, from a component's own stories file (CardBody.stories.tsx), or
 * else its module's (Badge.stories.tsx), or else its family's (Menu.stories.tsx
 * for MenuItem). The usage guide is the file's `guidance` when the page is the
 * component's own (the title ends in its name), else its `partGuidance` entry.
 */
async function readStories(source: string, name: string): Promise<StoriesInfo> {
  const candidates = [ownStoriesFile(source, name), source.replace(/\.tsx$/, '.stories.tsx'), familyStoriesFile(source)]
  const file = candidates.find((candidate): candidate is string => candidate !== null && existsSync(candidate))
  if (file === undefined) return { ids: [], file: null }
  const text = await readFile(file, 'utf8')
  const title = /title: '(.+?)'/.exec(text)?.[1]
  if (!title) return { ids: [], file }
  const ids = [...text.matchAll(/^export const (\w+)/gm)].map(([, exportName = '']) =>
    toId(title, storyNameFromExport(exportName)),
  )
  const hasInteraction = hasInteractionStory(file, text)
  const titleParts = title.split('/')
  const pageName = titleParts.at(-1)
  // A part's own page sits under its family's (Containers/Card/CardBody).
  const familyOfOwnPage = titleParts.length > 2 && titleParts.at(-2) !== name ? titleParts.at(-2) : undefined
  if (pageName === name) {
    const guidance = readGuideProperty(file, text, 'guidance') as Guidance | null
    if (!guidance)
      problems.push(`${relativeToRoot(file)}: ${name}'s Docs page needs a usage guide (a \`guidance\` parameter)`)
    return { ids, file, hasInteraction, guidance, partOf: familyOfOwnPage }
  }
  // A part shown on its family's page has its guide there, in `partGuidance`.
  const partGuidance = readGuideProperty(file, text, 'partGuidance') as Record<string, Guidance> | null
  const guidance = partGuidance?.[name] ?? null
  if (!guidance)
    problems.push(`${relativeToRoot(file)}: ${name} needs a usage guide in the page's \`partGuidance\` parameter`)
  return { ids, file, hasInteraction, guidance, partOf: pageName }
}

/**
 * Whether a stories file has a story that drives the component: an exported
 * story object with a `play` function, tagged `!autodocs` so it stays off the
 * Docs page.
 */
function hasInteractionStory(file: string, text: string): boolean {
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  return sourceFile.statements.some((statement) => {
    if (!ts.isVariableStatement(statement)) return false
    const isExported = statement.modifiers?.some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword)
    if (!isExported) return false
    return statement.declarationList.declarations.some(({ initializer }) => {
      if (!initializer || !ts.isObjectLiteralExpression(initializer)) return false
      const findProperty = (key: string) => initializer.properties.find((p) => p.name?.getText() === key)
      const tags = findProperty('tags')
      return (
        findProperty('play') !== undefined &&
        tags !== undefined &&
        ts.isPropertyAssignment(tags) &&
        ts.isArrayLiteralExpression(tags.initializer) &&
        tags.initializer.elements.some((tag) => ts.isStringLiteralLike(tag) && tag.text === '!autodocs')
      )
    })
  })
}

/** Lowercase letters and digits only, so `IconButton` and "Icon button" compare. */
const comparisonKey = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * How a component's Figma guide falls out of step with its code guide: as
 * many When to use and When not to use lines, and every alternative the code
 * names (`use \`EmptyState\``) named in Figma too ("Empty state"). Figma words
 * its lines, and its Accessibility, for designers, so wording is left to review.
 */
function guideMismatches(
  name: string,
  guidance: Guidance,
  figmaGuidance: Guidance,
  figmaNameOf: (component: string) => string,
): string[] {
  const mismatches: string[] = []
  const lists = [
    { label: 'When to use', lines: guidance.whenToUse, figmaLines: figmaGuidance.whenToUse },
    { label: 'When not to use', lines: guidance.whenNotToUse, figmaLines: figmaGuidance.whenNotToUse },
  ]
  for (const { label, lines, figmaLines } of lists) {
    if (lines.length !== figmaLines.length) {
      mismatches.push(
        `${name}'s usage guide has ${lines.length} ${label} lines in code, ${figmaLines.length} in Figma: bring the side that's behind up to date`,
      )
    }
  }
  const figmaInsteadText = comparisonKey(figmaGuidance.whenNotToUse.join(' '))
  const namedAlternatives = new Set(
    guidance.whenNotToUse.flatMap((line) =>
      [...line.matchAll(/`([A-Z]\w+)`/g)].map(([, alternative = '']) => alternative),
    ),
  )
  for (const alternative of namedAlternatives) {
    if (figmaInsteadText.includes(comparisonKey(figmaNameOf(alternative)))) continue
    mismatches.push(`${name}'s usage guide names ${alternative} under When not to use; Figma's doesn't`)
  }
  return mismatches
}

/** Every other export of the index, with its doc comment, through the compiler. */
function readOtherExports(componentNames: Set<string>): Pick<ComponentListJson, 'iconNames' | 'otherExports'> {
  const program = ts.createProgram([UI_INDEX], {
    jsx: ts.JsxEmit.ReactJSX,
    allowImportingTsExtensions: true,
    noEmit: true,
  })
  const checker = program.getTypeChecker()
  const indexFile = program.getSourceFile(UI_INDEX)
  const indexModule = indexFile && checker.getSymbolAtLocation(indexFile)
  if (!indexModule) throw new Error(`${relativeToRoot(UI_INDEX)}: the compiler found no module`)
  const iconNames: string[] = []
  const otherExports: Record<string, string> = {}
  for (const symbol of checker.getExportsOfModule(indexModule)) {
    const name = symbol.getName()
    if (componentNames.has(name)) continue
    const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol
    if (!(target.flags & ts.SymbolFlags.Value)) continue
    const description = ts.displayPartsToString(target.getDocumentationComment(checker)).trim()
    if (name.endsWith('Icon')) iconNames.push(name)
    else otherExports[name] = description
  }
  return { iconNames: iconNames.sort(), otherExports: Object.fromEntries(Object.entries(otherExports).sort()) }
}

const components = await readIndex()
const { docs, elementProps } = readProps(components)
const figmaExport = JSON.parse(await readFile(FIGMA_COMPONENTS_JSON, 'utf8')) as FigmaComponentsJson
problems.push(...(await schemaProblems(FIGMA_COMPONENTS_SCHEMA, figmaExport, relativeToRoot(FIGMA_COMPONENTS_JSON))))
const figmaDifferencesFile = JSON.parse(await readFile(FIGMA_DIFFERENCES_JSON, 'utf8')) as FigmaDifferencesJson
problems.push(
  ...(await schemaProblems(FIGMA_DIFFERENCES_SCHEMA, figmaDifferencesFile, relativeToRoot(FIGMA_DIFFERENCES_JSON))),
)
const figmaDifferences = figmaDifferencesFile.components
const figmaGuidesFile = JSON.parse(await readFile(FIGMA_GUIDES_JSON, 'utf8')) as FigmaGuidesJson
problems.push(...(await schemaProblems(FIGMA_GUIDES_SCHEMA, figmaGuidesFile, relativeToRoot(FIGMA_GUIDES_JSON))))
const figmaGuides = figmaGuidesFile.guides
/** An alternative is named in Figma by its Figma name, or its own for one Figma lacks. */
const figmaNameOf = (component: string) => figmaExport.components[component]?.figmaName ?? component
const hasFigmaComponent = (component: string | undefined) =>
  component !== undefined && component in figmaExport.components

/**
 * A component's Figma component as components.gen.json carries it: the
 * export's name and node with its written differences, or why it has none.
 * Null, and a problem, when neither file has it.
 */
function figmaComponentOf(name: string): FigmaComponent | NoFigmaComponent | null {
  const exported = figmaExport.components[name]
  const differences = figmaDifferences[name]
  if (differences && 'whyNoFigmaComponent' in differences) return differences
  if (!exported) {
    problems.push(
      `${relativeToRoot(FIGMA_COMPONENTS_JSON)}: ${name} has no Figma component: build it in Figma and npm run figma:export, ` +
        `or say why it has none in figma-differences.json`,
    )
    return null
  }
  const { figmaName: _exportedName, ...writtenDifferences } = differences ?? {}
  return { figmaName: exported.figmaName, figmaNodeId: exported.figmaNodeId, ...writtenDifferences }
}
const storiesByName = new Map<string, StoriesInfo>()
for (const { name, source } of components) storiesByName.set(name, await readStories(source, name))

const componentEntries: Record<string, ComponentEntry> = {}
for (const { name, group, source } of components) {
  const doc = docs.get(name)
  if (!doc) {
    problems.push(`${relativeToRoot(source)}: react-docgen-typescript found no component named ${name}`)
    continue
  }
  if (!doc.description) problems.push(`${relativeToRoot(source)}: ${name} needs a doc comment saying what it's for`)
  for (const prop of Object.values(doc.props)) {
    if (!prop.description) problems.push(`${relativeToRoot(source)}: ${name}'s ${prop.name} prop needs a doc comment`)
  }
  const figmaEntry = figmaComponentOf(name)
  const figmaVariantPropertiesNotInCode =
    figmaEntry && 'figmaNodeId' in figmaEntry ? (figmaEntry.figmaVariantPropertiesNotInCode ?? {}) : {}
  for (const [figmaName, { fromProps }] of Object.entries(figmaVariantPropertiesNotInCode)) {
    for (const propName of fromProps.filter((propName) => !(propName in doc.props))) {
      problems.push(
        `${relativeToRoot(FIGMA_DIFFERENCES_JSON)}: ${name}'s ${figmaName} comes from ${propName}, which isn't a prop`,
      )
    }
  }
  const stories = storiesByName.get(name) ?? { ids: [], file: null }
  // Figma has a guide wherever it draws the component or, for a part, its family.
  const figmaGuidance = figmaGuides[name]
  const isGuidedInFigma = hasFigmaComponent(name) || hasFigmaComponent(stories.partOf)
  if (stories.guidance && isGuidedInFigma && !figmaGuidance) {
    problems.push(
      `${relativeToRoot(FIGMA_GUIDES_JSON)}: ${name} has no Figma usage guide: add one to its docs section (a part: its family's Parts block), then npm run figma:export`,
    )
  }
  if (stories.guidance && figmaGuidance)
    problems.push(...guideMismatches(name, stories.guidance, figmaGuidance, figmaNameOf))
  const handlerProp = Object.keys(doc.props).find((prop) => /^on[A-Z]/.test(prop))
  if (handlerProp && stories.file && !stories.hasInteraction) {
    problems.push(
      `${relativeToRoot(stories.file)}: ${name} takes ${handlerProp}, so it needs a story that drives it: ` +
        "a play function, named for the interaction and tagged '!autodocs'",
    )
  }
  componentEntries[name] = {
    libraryGroup: group,
    sourceFile: relativeToRoot(source),
    description: doc.description,
    figmaComponent: figmaEntry,
    props: Object.fromEntries(
      Object.values(doc.props)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((prop) => [prop.name, describeProp(prop)]),
    ),
    ...(elementProps.has(name) && { passesExtraPropsToElement: true }),
    storyIds: stories.ids,
    ...(stories.partOf && { partOf: stories.partOf }),
    ...(stories.guidance && { guidance: stories.guidance }),
    ...(figmaGuidance && { figmaGuidance }),
  }
}
for (const name of Object.keys(figmaGuides)) {
  if (!(name in componentEntries))
    problems.push(
      `${relativeToRoot(FIGMA_GUIDES_JSON)}: ${name} isn't a component in packages/ui/src/index.ts: export again`,
    )
}
for (const [file, names] of [
  [FIGMA_COMPONENTS_JSON, Object.keys(figmaExport.components)],
  [FIGMA_DIFFERENCES_JSON, Object.keys(figmaDifferences)],
] as const) {
  for (const name of names.filter((name) => !(name in componentEntries)))
    problems.push(`${relativeToRoot(file)}: ${name} isn't a component in packages/ui/src/index.ts`)
}

/** Figma's variant properties against the props, now both are here. */
const propsByComponent = new Map(Object.entries(componentEntries).map(([name, { props }]) => [name, props]))
for (const problem of variantProblems(figmaExport.components, figmaDifferences, propsByComponent))
  problems.push(`${relativeToRoot(FIGMA_DIFFERENCES_JSON)}: ${problem}`)

const componentList: ComponentListJson = {
  $schema: '../../schemas/components.schema.json',
  $comment:
    'Generated by `npm run gen` from packages/ui/src; edit the code, not this file. The schema says what each key means.',
  figmaFileUrl: figmaExport.figmaFileUrl,
  components: componentEntries,
  ...readOtherExports(new Set(components.map(({ name }) => name))),
}
problems.push(...(await schemaProblems(COMPONENT_LIST_SCHEMA, componentList, relativeToRoot(COMPONENT_LIST))))
const componentListJson = `${JSON.stringify(componentList, null, 2)}\n`

if (isCheck) {
  const current = await readFile(COMPONENT_LIST, 'utf8').catch(() => '')
  if (current !== componentListJson) problems.push(`${relativeToRoot(COMPONENT_LIST)} is stale: run npm run gen`)
} else {
  await writeFile(COMPONENT_LIST, componentListJson)
}

if (problems.length > 0) {
  console.error(problems.join('\n'))
  console.error(
    `\n${problems.length} UI library problem${problems.length === 1 ? '' : 's'} (the library's docs, stories or Figma map; or a stale components.gen.json)`,
  )
  process.exit(1)
}
console.log(`components.gen.json ${isCheck ? 'OK' : 'written'} (${components.length} components)`)
