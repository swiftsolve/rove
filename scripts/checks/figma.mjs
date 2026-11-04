/**
 * Check the library against the Figma file, so a design change that lands on
 * one side only fails here instead of waiting for review:
 *
 *   - every node src/ui/figma.json names exists and is still called the name
 *     written beside it, and is a component or component set, not one variant;
 *   - every Figma variant property (Tone, Size) is a prop of a component mapped
 *     to it, with the same values: `Tone=Accent` is `tone="accent"`, a
 *     `true`/`false` variant is a boolean prop (`Disabled` is `isDisabled`), and
 *     a part's prop takes its part's name (`Body layout` is CardBody's `layout`);
 *   - every prop with a fixed set of values has a Figma variant property;
 *   - every usage guide in the stories (`guidance`) has its twin in the
 *     component's Figma docs section: the same sections, as many lines in each,
 *     and every alternative the code names under Avoid (`use
 *     `EmptyState``) named there too ("Empty state"). Figma words its lines for
 *     designers, so the wording itself is left to review.
 *
 * `State` (Hover, Focus) is how it looks under the pointer, not a prop, so it
 * isn't matched. A deliberate difference is written in the component's
 * figma.json entry, with why: `codeOnly` for a prop Figma can't show (where a
 * tooltip opens), `figmaOnly` for a variant code derives from other props (a
 * Link is External when it has `href`), and `valuesDiffer`. An exception that
 * no longer applies fails too, so the list stays true.
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
 *   node scripts/checks/figma.mjs [--from figma.json]
 */
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const FIGMA = join(ROOT, 'src/ui/figma.json')
const CATALOGUE = join(ROOT, 'src/ui/components.gen.json')
const API = 'https://api.figma.com/v1'
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
  use: 'Use',
  avoid: 'Avoid',
  accessibility: 'Accessibility',
  builtIn: 'Built in',
  toHandle: 'To handle',
}
// What follows the guide in a docs section: the examples and the props table.
const GUIDE_ENDS = new Set(['Dark', 'Light', 'Property', 'Code'])

/** Lowercase letters and digits only, so `Body layout`, `bodyLayout` and `Down only` compare. */
const key = (text) =>
  String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

/** FIGMA_TOKEN from the shell, else from the git-ignored .env.local. */
async function readToken() {
  if (process.env.FIGMA_TOKEN) return process.env.FIGMA_TOKEN
  const env = await readFile(join(ROOT, '.env.local'), 'utf8').catch(() => '')
  return env.match(/^\s*FIGMA_TOKEN\s*=\s*["']?([^"'\s]+)/m)?.[1]
}

/** A REST API answer, as JSON. Offline skips; a bad token or file key answers, and fails. */
async function get(token, path) {
  const response = await fetch(`${API}${path}`, { headers: { 'X-Figma-Token': token } }).catch((error) => {
    console.log(`Figma skipped: Figma couldn't be reached (${error.cause?.code ?? error.message})`)
    process.exit(0)
  })
  if (!response.ok) {
    console.error(`Figma answered ${response.status}: ${await response.text()}`)
    process.exit(1)
  }
  return response.json()
}

/** A node's text in document order, leaving out what's inside a component or its instances. */
function textsOf(node) {
  if (INSTANCE_TYPES.has(node.type)) return []
  if (node.type === 'TEXT') return [node.characters]
  return (node.children ?? []).flatMap(textsOf)
}

/**
 * The mapped nodes by id (`{ name, type, componentPropertyDefinitions }`) and
 * the docs sections' text by section name, from a file or the REST API.
 */
async function readFigma(fileKey, nodeIds, sectionNames) {
  const fromIndex = process.argv.indexOf('--from')
  if (fromIndex !== -1) {
    const data = JSON.parse(await readFile(resolve(process.argv[fromIndex + 1]), 'utf8'))
    return 'nodes' in data ? data : { nodes: data }
  }

  const token = await readToken()
  if (!token) {
    console.log('Figma skipped: no FIGMA_TOKEN in the shell or .env.local')
    process.exit(0)
  }
  const { nodes } = await get(token, `/files/${fileKey}/nodes?ids=${nodeIds.join(',')}&depth=1`)

  // A docs section is a frame on a page's top frame, named for its component.
  const { document } = await get(token, `/files/${fileKey}?depth=3`)
  const sectionIds = document.children
    .flatMap((page) => page.children ?? [])
    .flatMap((frame) => frame.children ?? [])
    .filter((section) => sectionNames.has(section.name))
    .map((section) => section.id)
  const sections =
    sectionIds.length > 0 ? (await get(token, `/files/${fileKey}/nodes?ids=${sectionIds.join(',')}`)).nodes : {}
  const docs = {}
  for (const { document: section } of Object.values(sections)) {
    const texts = textsOf(section)
    if (texts.includes(GUIDE_LABELS.use)) docs[section.name] = texts
  }
  return { nodes: Object.fromEntries(Object.entries(nodes).map(([id, node]) => [id, node?.document])), docs }
}

/** A Figma guide's lines per section, read off its docs section's text. */
function figmaGuide(texts) {
  const at = (label, from) => texts.indexOf(label, from)
  const use = at(GUIDE_LABELS.use, 0)
  const avoid = at(GUIDE_LABELS.avoid, use)
  const accessibility = at(GUIDE_LABELS.accessibility, avoid)
  const builtIn = at(GUIDE_LABELS.builtIn, accessibility)
  const toHandle = at(GUIDE_LABELS.toHandle, builtIn)
  if ([use, avoid, accessibility, builtIn, toHandle].includes(-1)) return null
  const after = texts.findIndex((text, i) => i > toHandle && GUIDE_ENDS.has(text))
  return {
    use: texts.slice(use + 1, avoid),
    avoid: texts.slice(avoid + 1, accessibility),
    builtIn: texts.slice(builtIn + 1, toHandle),
    toHandle: texts.slice(toHandle + 1, after === -1 ? texts.length : after),
  }
}

/** A Figma node's variant properties, `{ Tone: ['Accent', …] }`, without the interaction state. */
function variantsOf(node) {
  return Object.fromEntries(
    Object.entries(node.componentPropertyDefinitions ?? {})
      .filter(([name, { type }]) => type === 'VARIANT' && name !== INTERACTION_STATE)
      .map(([name, { variantOptions }]) => [name, variantOptions]),
  )
}

/** A code prop's values to compare, or null when it takes anything (a string, a node). */
function valuesOf(prop) {
  if (prop.values) return prop.values
  if (prop.type === 'boolean') return ['false', 'true']
  // A single literal (`variant: 'error'`) reaches the catalogue as its type.
  if (LITERAL_UNION.test(prop.type ?? '')) return prop.type.split(' | ').map((literal) => literal.slice(1, -1))
  return null
}

/** The keys a Figma variant property may use for a prop: `isDisabled` is `Disabled`, CardBody's `layout` is `Body layout`. */
function keysFor(component, main, propName) {
  const part = component.startsWith(main) ? component.slice(main.length) : ''
  const bare = propName.replace(BOOLEAN_PREFIX, '')
  return new Set([key(propName), key(bare), ...(part ? [key(part + propName), key(part + bare)] : [])])
}

const sameSet = (a, b) => a.length === b.length && a.every((value) => b.includes(value))

const { file, components: mapping } = JSON.parse(await readFile(FIGMA, 'utf8'))
const { components: catalogue } = JSON.parse(await readFile(CATALOGUE, 'utf8'))
const fileKey = file.match(/figma\.com\/design\/([^/]+)/)?.[1]
if (!fileKey) {
  console.error(`figma.json's file isn't a figma.com/design URL: ${file}`)
  process.exit(1)
}

// Several components can share one Figma node (Card, CardBody, CardFooter), so
// each node is asked for once and its variants are matched against all of them.
const entries = Object.entries(mapping).filter(([, entry]) => entry !== null)
const byNode = new Map()
for (const [component, entry] of entries) byNode.set(entry.node, [...(byNode.get(entry.node) ?? []), component])

const guided = entries.filter(([component]) => catalogue[component]?.guidance)
const { nodes, docs } = await readFigma(fileKey, [...byNode.keys()], new Set(guided.map(([, { name }]) => name)))
const problems = []

for (const [nodeId, components] of byNode) {
  const found = nodes[nodeId]
  if (!found) {
    problems.push(`${components.join(', ')}: node ${nodeId} isn't in the Figma file`)
    continue
  }
  for (const component of components) {
    if (found.name !== mapping[component].name) {
      problems.push(`${component}: node ${nodeId} is "${found.name}" in Figma, not "${mapping[component].name}"`)
    }
  }
  if (!COMPONENT_TYPES.has(found.type) || VARIANT_NAME.test(found.name)) {
    problems.push(
      `${components.join(', ')}: node ${nodeId} isn't a component: map the component or its set, not a variant`,
    )
    continue
  }

  // The shortest name is the whole (Card); the rest are its parts (CardBody).
  const main = [...components].sort((a, b) => a.length - b.length)[0]
  const figmaVariants = variantsOf(found)
  const figmaOnly = Object.assign({}, ...components.map((component) => mapping[component].figmaOnly))
  const matchedFigma = new Set()

  for (const component of components) {
    const { codeOnly = {}, valuesDiffer = {} } = mapping[component]
    const props = catalogue[component]?.props ?? {}

    for (const [propName, prop] of Object.entries(props)) {
      const values = valuesOf(prop)
      if (!values) continue
      const keys = keysFor(component, main, propName)
      const figmaName = Object.keys(figmaVariants).find((name) => keys.has(key(name)))

      if (!figmaName) {
        if (prop.values && !(propName in codeOnly)) {
          problems.push(
            `${component}.${propName} (${values.join(', ')}) has no variant property on Figma's "${found.name}": ` +
              `add one, or list it in figma.json's codeOnly with why`,
          )
        }
        continue
      }
      matchedFigma.add(figmaName)
      if (propName in codeOnly) {
        problems.push(`${component}.${propName} is in codeOnly, but Figma's "${found.name}" has it as ${figmaName}`)
      }

      const code = values.map(key)
      const hasDefault = prop.default !== undefined
      const design = figmaVariants[figmaName]
        .map(key)
        .filter((value) => !(value === UNSET_OPTION && !hasDefault && !code.includes(UNSET_OPTION)))
      const isSame = sameSet(code, design)
      if (!isSame && !(propName in valuesDiffer)) {
        problems.push(
          `${component}.${propName} is ${values.join(' | ')} in code, ` +
            `but ${figmaName} on Figma's "${found.name}" is ${figmaVariants[figmaName].join(' | ')}`,
        )
      } else if (isSame && propName in valuesDiffer) {
        problems.push(`${component}.${propName} is in valuesDiffer, but its values now match Figma's`)
      }
    }

    for (const propName of Object.keys(codeOnly)) {
      if (!(propName in props)) problems.push(`${component}: codeOnly names ${propName}, which isn't a prop`)
    }
    for (const propName of Object.keys(valuesDiffer)) {
      if (!(propName in props)) problems.push(`${component}: valuesDiffer names ${propName}, which isn't a prop`)
    }
  }

  for (const figmaName of Object.keys(figmaVariants)) {
    if (matchedFigma.has(figmaName) || figmaName in figmaOnly) continue
    problems.push(
      `Figma's "${found.name}" has a ${figmaName} variant (${figmaVariants[figmaName].join(', ')}) that no prop of ` +
        `${components.join(', ')} matches: add the prop, or list it in figma.json's figmaOnly with what it stands for`,
    )
  }
  for (const figmaName of Object.keys(figmaOnly)) {
    if (!(figmaName in figmaVariants)) {
      problems.push(`${main}: figmaOnly names ${figmaName}, which Figma's "${found.name}" doesn't have`)
    } else if (matchedFigma.has(figmaName)) {
      problems.push(`${main}: figmaOnly names ${figmaName}, but a prop now matches it`)
    }
  }
}

// The usage guides. A component the code names is looked for by its Figma
// name, or its own for one Figma lacks; spaces and case don't count, so
// StretchedLink is found as "Stretched link".
const figmaNameOf = (component) => mapping[component]?.name ?? component
for (const [component, { name }] of docs ? guided : []) {
  const guide = catalogue[component].guidance
  const texts = docs[name]
  const figma = texts && figmaGuide(texts)
  if (!figma) {
    problems.push(`${component} has a usage guide, but Figma's "${name}" docs section has none: add it there`)
    continue
  }
  const sections = [
    ['use', GUIDE_LABELS.use, guide.use],
    ['avoid', GUIDE_LABELS.avoid, guide.avoid],
    ['builtIn', GUIDE_LABELS.builtIn, guide.accessibility.builtIn],
    ['toHandle', GUIDE_LABELS.toHandle, guide.accessibility.toHandle],
  ]
  for (const [section, label, lines] of sections) {
    if (lines.length !== figma[section].length) {
      problems.push(
        `${component}'s usage guide has ${lines.length} ${label} lines in code, ${figma[section].length} in Figma's "${name}": ` +
          `bring the side that's behind up to date`,
      )
    }
  }
  const avoidText = key(figma.avoid.join(' '))
  const named = new Set(guide.avoid.flatMap((line) => [...line.matchAll(/`([A-Z]\w+)`/g)].map(([, ref]) => ref)))
  for (const ref of named) {
    if (!(ref in catalogue) || avoidText.includes(key(figmaNameOf(ref)))) continue
    problems.push(`${component}'s usage guide names ${ref} under ${GUIDE_LABELS.avoid}; Figma's "${name}" doesn't`)
  }
}

if (problems.length > 0) {
  console.error(`The library and Figma are out of step:\n  ${problems.join('\n  ')}`)
  process.exit(1)
}
const guides = docs ? `, and ${guided.length} usage guides` : ''
console.log(`Figma OK (${byNode.size} nodes, their names and variants${guides})`)
