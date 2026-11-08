/**
 * Write `src/ui/components.gen.json`: the UI library's public API in one file, so
 * an agent (or a person) learns it without opening every component. For each
 * component it lists:
 *
 *   - its group, from the comment above it in `src/ui/index.ts`;
 *   - its description and props (type, variant values, default), read from
 *     the code with react-docgen-typescript, as Storybook's docs tables are;
 *   - its Figma component, from `src/ui/figma-components.json`;
 *   - its stories' ids, for `localhost:6006/?path=/story/<id>`;
 *   - its usage guide (when to use it, when not, accessibility), from its
 *     stories' `guidance` parameter, as its Docs page shows it.
 *
 * Icons, hooks and helpers follow, by name and doc comment.
 *
 *   node scripts/gen/components.mjs           # rewrite components.gen.json
 *   node scripts/gen/components.mjs --check   # fail if it's stale or incomplete
 *
 * `--check`, part of `npm run lint`, also fails when a component or one of its
 * own props has no doc comment, or a component has no entry in figma-components.json (`null` says it has no Figma counterpart), or a
 * component with a Docs page of its own (`Actions/Button`, `Containers/Card/Card`, not a part's
 * `Containers/Card/CardHeader`) has no usage guide.
 *
 * It fails, too, when a component takes a handler (`onClick`, `onBack`) and
 * its stories have none that drives it (a `play` function, tagged
 * `!autodocs`).
 */
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { withCustomConfig } from 'react-docgen-typescript'
import { storyNameFromExport, toId } from 'storybook/internal/csf'
import ts from 'typescript'

import { schemaProblems } from '../lib/json-schema.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const UI_DIR = join(ROOT, 'src/ui')
const UI_INDEX = join(UI_DIR, 'index.ts')
const COMPONENT_LIST = join(UI_DIR, 'components.gen.json')
const FIGMA_COMPONENTS_JSON = join(UI_DIR, 'figma-components.json')
// Each file's schema says what every key means; both files are held to theirs.
const COMPONENT_LIST_SCHEMA = join(ROOT, 'schemas/components.schema.json')
const FIGMA_COMPONENTS_SCHEMA = join(ROOT, 'schemas/figma-components.schema.json')
const isCheck = process.argv.includes('--check')

const problems = []
const relativeToRoot = (path) => relative(ROOT, path)

// The index's grouped exports: a `// Group` line starts a group, a blank line
// ends it. Exports outside a group (icons, hooks, helpers) aren't components.
async function readIndex() {
  const components = []
  let group = null
  for (const line of (await readFile(UI_INDEX, 'utf8')).split('\n')) {
    const comment = line.match(/^\/\/ (.+)$/)
    if (comment) group = comment[1]
    if (line.trim() === '') group = null
    const exported = line.match(/^export \{ (.+) \} from '(.+)'$/)
    if (!exported || !group) continue
    const source = join(UI_DIR, `${exported[2]}.tsx`)
    for (const name of exported[1].split(', ')) {
      // A component is PascalCase; types and constants (POLLING_DESCRIPTION) aren't.
      if (/^[A-Z][a-z]/.test(name)) components.push({ name, group, source })
    }
  }
  return components
}

function readProps(components) {
  const elementProps = new Set()
  const parser = withCustomConfig(join(ROOT, 'tsconfig.json'), {
    shouldExtractLiteralValuesFromEnum: true,
    shouldRemoveUndefinedFromOptional: true,
    savePropValueAsString: true,
    // Storybook's table lists an undocumented `children`, so the check must see it.
    skipChildrenPropWithoutDoc: false,
    // A prop from a package is the DOM element's own attribute, passed through.
    propFilter: (prop, component) => {
      const isOwn = !prop.parent || !prop.parent.fileName.includes('node_modules')
      if (!isOwn) elementProps.add(component.name)
      return isOwn
    },
  })
  const sources = [...new Set(components.map(({ source }) => source))]
  const docs = new Map(parser.parse(sources).map((doc) => [doc.displayName, doc]))
  return { docs, elementProps }
}

function describeProp(prop) {
  const entry = {}
  if (prop.type.name === 'enum' && prop.type.value?.every(({ value }) => /^["\d]/.test(value))) {
    entry.values = prop.type.value.map(({ value }) => JSON.parse(value))
  } else {
    entry.type = prop.type.raw ?? prop.type.name
  }
  if (prop.defaultValue?.value !== undefined) entry.default = prop.defaultValue.value
  if (prop.required) entry.isRequired = true
  if (prop.description) entry.description = prop.description
  return entry
}

// The `guidance` object literal in a stories file, as plain data: its string
// arrays and nested objects. Null when the file sets none.
function readGuidance(file, text) {
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const toData = (node) => {
    if (ts.isSatisfiesExpression(node) || ts.isAsExpression(node)) return toData(node.expression)
    if (ts.isStringLiteralLike(node)) return node.text
    if (ts.isArrayLiteralExpression(node)) return node.elements.map(toData)
    if (ts.isObjectLiteralExpression(node)) {
      return Object.fromEntries(
        node.properties.map((property) => [property.name.getText(), toData(property.initializer)]),
      )
    }
    throw new Error(`${relativeToRoot(file)}: guidance holds only strings, arrays and objects`)
  }
  let guidance = null
  const visit = (node) => {
    if (ts.isPropertyAssignment(node) && node.name.getText() === 'guidance') guidance = toData(node.initializer)
    else ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return guidance
}

// Story ids, from a component's own stories file beside its module
// (card/CardBody.stories.tsx), or else the module's (Badge.tsx ↔ Badge.stories.tsx).
// A component whose Docs page it is (the title ends in its name, and isn't a
// part's under its parent) also takes the file's usage guide.
async function readStories(source, name) {
  const ownStoriesFile = join(dirname(source), `${name}.stories.tsx`)
  const file = existsSync(ownStoriesFile) ? ownStoriesFile : source.replace(/\.tsx$/, '.stories.tsx')
  const text = await readFile(file, 'utf8').catch(() => null)
  if (text === null) return { ids: [], file: null }
  const title = text.match(/title: '(.+?)'/)?.[1]
  if (!title) return { ids: [], file }
  const ids = [...text.matchAll(/^export const (\w+)/gm)].map(([, exportName]) =>
    toId(title, storyNameFromExport(exportName)),
  )
  const hasInteraction = hasInteractionStory(file, text)
  const titleParts = title.split('/')
  const hasOwnPage = titleParts.at(-1) === name && (titleParts.length === 2 || titleParts.at(-2) === name)
  if (!hasOwnPage) return { ids, file, hasInteraction }
  const guidance = readGuidance(file, text)
  if (!guidance)
    problems.push(`${relativeToRoot(file)}: ${name}'s Docs page needs a usage guide (a \`guidance\` parameter)`)
  return { ids, file, hasInteraction, guidance }
}

// Whether a stories file has a story that drives the component: an exported
// story object with a `play` function, tagged `!autodocs` so it stays off the
// Docs page.
function hasInteractionStory(file, text) {
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  return sourceFile.statements.some((statement) => {
    const isExported = statement.modifiers?.some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword)
    if (!isExported || !ts.isVariableStatement(statement)) return false
    return statement.declarationList.declarations.some(({ initializer }) => {
      if (!initializer || !ts.isObjectLiteralExpression(initializer)) return false
      const findProperty = (key) => initializer.properties.find((p) => p.name?.getText() === key)
      const tags = findProperty('tags')
      return (
        Boolean(findProperty('play')) &&
        Boolean(tags) &&
        ts.isPropertyAssignment(tags) &&
        ts.isArrayLiteralExpression(tags.initializer) &&
        tags.initializer.elements.some((tag) => ts.isStringLiteralLike(tag) && tag.text === '!autodocs')
      )
    })
  })
}

// Every other export of the index, with its doc comment, through the compiler.
function readOtherExports(componentNames) {
  const program = ts.createProgram([UI_INDEX], {
    jsx: ts.JsxEmit.ReactJSX,
    allowImportingTsExtensions: true,
    noEmit: true,
  })
  const checker = program.getTypeChecker()
  const indexModule = checker.getSymbolAtLocation(program.getSourceFile(UI_INDEX))
  const iconNames = []
  const otherExports = {}
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
const figmaMap = JSON.parse(await readFile(FIGMA_COMPONENTS_JSON, 'utf8'))
problems.push(...(await schemaProblems(FIGMA_COMPONENTS_SCHEMA, figmaMap, relativeToRoot(FIGMA_COMPONENTS_JSON))))
const storiesByName = new Map()
for (const { name, source } of components) storiesByName.set(name, await readStories(source, name))

const componentEntries = {}
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
  if (!(name in figmaMap.components)) {
    problems.push(
      `${relativeToRoot(FIGMA_COMPONENTS_JSON)}: add ${name}, with its Figma component, or null if it has none`,
    )
  }
  const figmaVariantPropertiesNotInCode = figmaMap.components[name]?.figmaVariantPropertiesNotInCode ?? {}
  for (const [figmaName, { fromProps }] of Object.entries(figmaVariantPropertiesNotInCode)) {
    for (const propName of fromProps.filter((propName) => !(propName in doc.props))) {
      problems.push(
        `${relativeToRoot(FIGMA_COMPONENTS_JSON)}: ${name}'s ${figmaName} comes from ${propName}, which isn't a prop`,
      )
    }
  }
  const stories = storiesByName.get(name)
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
    figmaComponent: figmaMap.components[name] ?? null,
    props: Object.fromEntries(
      Object.values(doc.props)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((prop) => [prop.name, describeProp(prop)]),
    ),
    ...(elementProps.has(name) && { passesExtraPropsToElement: true }),
    storyIds: stories.ids,
    ...(stories.guidance && { guidance: stories.guidance }),
  }
}
for (const name of Object.keys(figmaMap.components)) {
  if (!components.some((component) => component.name === name)) {
    problems.push(`${relativeToRoot(FIGMA_COMPONENTS_JSON)}: ${name} isn't a component in src/ui/index.ts`)
  }
}

const componentList = {
  $schema: '../../schemas/components.schema.json',
  $comment:
    'Generated by `npm run gen` from src/ui; edit the code, not this file. The schema says what each key means.',
  figmaFileUrl: figmaMap.figmaFileUrl,
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
