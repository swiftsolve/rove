/**
 * Write `src/ui/components.gen.json`: the UI library's public API in one file, so
 * an agent (or a person) learns it without opening every component. For each
 * component it lists:
 *
 *   - its group, from the comment above it in `src/ui/index.ts`;
 *   - its description and props (type, variant values, default), read from
 *     the code with react-docgen-typescript, as Storybook's docs tables are;
 *   - its Figma component, from `src/ui/figma.json`;
 *   - its stories' ids, for `localhost:6006/?path=/story/<id>`;
 *   - its usage guide (when to use it, when not, accessibility), from its
 *     stories' `guidance` parameter, as its Docs page shows it.
 *
 * Icons, hooks and helpers follow, by name and doc comment.
 *
 *   node scripts/build-ui-catalogue.mjs           # rewrite components.json
 *   node scripts/build-ui-catalogue.mjs --check   # fail if it's stale or incomplete
 *
 * `--check`, part of `npm run lint`, also fails when a component or one of its
 * own props has no doc comment, a prop has a default the Default column misses
 * (one in a recipe's `defaultVariants`, or only in its words), or a component
 * has no entry in figma.json (`null` says it has no Figma counterpart) or no
 * row in docs/develop/frontend.md's Components table, or a component with a
 * Docs page of its own (`Actions/Button`, `Containers/Card/Card`, not a part's
 * `Containers/Card/CardHeader`) has no usage guide.
 */
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { withCustomConfig } from 'react-docgen-typescript'
import { storyNameFromExport, toId } from 'storybook/internal/csf'
import ts from 'typescript'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const UI = join(ROOT, 'src/ui')
const INDEX = join(UI, 'index.ts')
const CATALOGUE = join(UI, 'components.gen.json')
const FIGMA = join(UI, 'figma.json')
const FRONTEND_DOC = join(ROOT, 'docs/develop/frontend.md')
const isCheck = process.argv.includes('--check')

// The Default column shows only a default written into the destructured props
// (or an @default tag). These find one it would miss: a prop doc that states
// its default, or a recipe's `defaultVariants` axis named like the prop.
const NAMES_A_DEFAULT = /\(the default\)|\bby default\b|\bdefaults to\b/i

async function readRecipeDefaults(source) {
  const text = await readFile(source, 'utf8')
  const blocks = [...text.matchAll(/defaultVariants: \{([^}]*)\}/g)].map(([, axes]) => axes)
  return new Set(blocks.flatMap((axes) => [...axes.matchAll(/(\w+):/g)].map(([, axis]) => axis)))
}

const problems = []
const rel = (path) => relative(ROOT, path)

// The index's grouped exports: a `// Group` line starts a group, a blank line
// ends it. Exports outside a group (icons, hooks, helpers) aren't components.
async function readIndex() {
  const components = []
  let group = null
  for (const line of (await readFile(INDEX, 'utf8')).split('\n')) {
    const comment = line.match(/^\/\/ (.+)$/)
    if (comment) group = comment[1]
    if (line.trim() === '') group = null
    const exported = line.match(/^export \{ (.+) \} from '(.+)'$/)
    if (!exported || !group) continue
    const source = join(UI, `${exported[2]}.tsx`)
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
    throw new Error(`${rel(file)}: guidance holds only strings, arrays and objects`)
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
  const own = join(dirname(source), `${name}.stories.tsx`)
  const file = existsSync(own) ? own : source.replace(/\.tsx$/, '.stories.tsx')
  const text = await readFile(file, 'utf8').catch(() => null)
  if (text === null) return { ids: [] }
  const title = text.match(/title: '(.+?)'/)?.[1]
  if (!title) return { ids: [] }
  const ids = [...text.matchAll(/^export const (\w+)/gm)].map(([, name]) => toId(title, storyNameFromExport(name)))
  const parts = title.split('/')
  const hasOwnPage = parts.at(-1) === name && (parts.length === 2 || parts.at(-2) === name)
  if (!hasOwnPage) return { ids }
  const guidance = readGuidance(file, text)
  if (!guidance) problems.push(`${rel(file)}: ${name}'s Docs page needs a usage guide (a \`guidance\` parameter)`)
  return { ids, guidance }
}

// Every other export of the index, with its doc comment, through the compiler.
function readOtherExports(componentNames) {
  const program = ts.createProgram([INDEX], {
    jsx: ts.JsxEmit.ReactJSX,
    allowImportingTsExtensions: true,
    noEmit: true,
  })
  const checker = program.getTypeChecker()
  const index = checker.getSymbolAtLocation(program.getSourceFile(INDEX))
  const icons = []
  const helpers = {}
  for (const symbol of checker.getExportsOfModule(index)) {
    const name = symbol.getName()
    if (componentNames.has(name)) continue
    const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol
    if (!(target.flags & ts.SymbolFlags.Value)) continue
    const description = ts.displayPartsToString(target.getDocumentationComment(checker)).trim()
    if (name.endsWith('Icon')) icons.push(name)
    else helpers[name] = description
  }
  return { icons: icons.sort(), helpers: Object.fromEntries(Object.entries(helpers).sort()) }
}

// Every component name in backticks in the Components table.
async function readDocumentedNames() {
  const doc = await readFile(FRONTEND_DOC, 'utf8')
  const table = doc.slice(doc.indexOf('## Components'))
  return new Set([...table.matchAll(/`([A-Z]\w+)/g)].map(([, name]) => name))
}

const components = await readIndex()
const { docs, elementProps } = readProps(components)
const figma = JSON.parse(await readFile(FIGMA, 'utf8'))
const documented = await readDocumentedNames()
const storiesByName = new Map()
for (const { name, source } of components) storiesByName.set(name, await readStories(source, name))

const entries = {}
for (const { name, group, source } of components) {
  const doc = docs.get(name)
  if (!doc) {
    problems.push(`${rel(source)}: react-docgen-typescript found no component named ${name}`)
    continue
  }
  const recipeDefaults = await readRecipeDefaults(source)
  if (!doc.description) problems.push(`${rel(source)}: ${name} needs a doc comment saying what it's for`)
  for (const prop of Object.values(doc.props)) {
    if (!prop.description) problems.push(`${rel(source)}: ${name}'s ${prop.name} prop needs a doc comment`)
    const hasDefault = prop.defaultValue?.value !== undefined
    if (!prop.required && !hasDefault && (recipeDefaults.has(prop.name) || NAMES_A_DEFAULT.test(prop.description))) {
      problems.push(
        `${rel(source)}: ${name}'s ${prop.name} prop has a default the docs' Default column misses: write it into the destructured props`,
      )
    }
  }
  if (!(name in figma.components)) {
    problems.push(`${rel(FIGMA)}: add ${name}, with its Figma component, or null if it has none`)
  }
  if (!documented.has(name)) problems.push(`${rel(FRONTEND_DOC)}: ${name} has no row in the Components table`)
  entries[name] = {
    group,
    source: rel(source),
    description: doc.description,
    figma: figma.components[name] ?? null,
    props: Object.fromEntries(
      Object.values(doc.props)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((prop) => [prop.name, describeProp(prop)]),
    ),
    ...(elementProps.has(name) && { hasElementProps: true }),
    stories: storiesByName.get(name).ids,
    ...(storiesByName.get(name).guidance && { guidance: storiesByName.get(name).guidance }),
  }
}
for (const name of Object.keys(figma.components)) {
  if (!components.some((component) => component.name === name)) {
    problems.push(`${rel(FIGMA)}: ${name} isn't a component in src/ui/index.ts`)
  }
}

const catalogue = {
  $comment:
    'Generated by `npm run catalogue` from src/ui; edit the code, not this file. ' +
    'Agent hooks refuse a hand edit, and `npm run lint` fails while it is stale. ' +
    'Import everything from `@/ui`. hasElementProps: other props pass to the rendered element. ' +
    'figma.node is a node id in the Figma file below. A story opens at http://localhost:6006/?path=/story/<id> (npm run storybook).',
  figmaFile: figma.file,
  components: entries,
  ...readOtherExports(new Set(components.map(({ name }) => name))),
}
const json = `${JSON.stringify(catalogue, null, 2)}\n`

if (isCheck) {
  const current = await readFile(CATALOGUE, 'utf8').catch(() => '')
  if (current !== json) problems.push(`${rel(CATALOGUE)} is stale: run npm run catalogue`)
} else {
  await writeFile(CATALOGUE, json)
}

if (problems.length > 0) {
  console.error(problems.join('\n'))
  console.error(`\n${problems.length} UI catalogue problem${problems.length === 1 ? '' : 's'}`)
  process.exit(1)
}
console.log(`UI catalogue ${isCheck ? 'OK' : 'written'} (${components.length} components)`)
