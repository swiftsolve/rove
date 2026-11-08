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
 * names a Figma variant code has no prop for, with how code chooses it (a Link
 * is External when it has `href`); `propsWithDifferentValuesInFigma` names a prop
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
 *   node scripts/checks/figma-library.mjs [--from figma-data.json]
 */
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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
/** Lowercase letters and digits only, so `Body layout`, `bodyLayout` and `Down only` compare. */
const comparisonKey = (text) =>
  String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

/** FIGMA_TOKEN from the shell, else from the git-ignored .env.local. */
async function readToken() {
  if (process.env.FIGMA_TOKEN) return process.env.FIGMA_TOKEN
  const env = await readFile(join(ROOT, '.env.local'), 'utf8').catch(() => '')
  return env.match(/^\s*FIGMA_TOKEN\s*=\s*["']?([^"'\s]+)/m)?.[1]
}

/**
 * A REST API answer, as JSON. Offline skips, and so does a server error that
 * outlasts two retries; a bad token or file key answers, and fails.
 */
async function fetchFigmaJson(token, path) {
  let response
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((done) => setTimeout(done, attempt * 2000))
    response = await fetch(`${FIGMA_API}${path}`, { headers: { 'X-Figma-Token': token } }).catch((error) => {
      console.log(`Figma skipped: Figma couldn't be reached (${error.cause?.code ?? error.message})`)
      process.exit(0)
    })
    if (response.status < 500) break
  }
  if (response.status >= 500) {
    console.log(`Figma skipped: Figma answered ${response.status} three times`)
    process.exit(0)
  }
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
    const figmaData = JSON.parse(await readFile(resolve(process.argv[fromIndex + 1]), 'utf8'))
    return 'nodes' in figmaData ? figmaData : { nodes: figmaData }
  }

  const token = await readToken()
  if (!token) {
    console.log('Figma skipped: no FIGMA_TOKEN in the shell or .env.local')
    process.exit(0)
  }
  const { nodes } = await fetchFigmaJson(token, `/files/${fileKey}/nodes?ids=${nodeIds.join(',')}&depth=1`)

  // A docs section is a frame on a page's top frame, named for its component.
  const { document } = await fetchFigmaJson(token, `/files/${fileKey}?depth=3`)
  const sectionIds = document.children
    .flatMap((page) => page.children ?? [])
    .flatMap((frame) => frame.children ?? [])
    .filter((section) => sectionNames.has(section.name))
    .map((section) => section.id)
  const sections =
    sectionIds.length > 0
      ? (await fetchFigmaJson(token, `/files/${fileKey}/nodes?ids=${sectionIds.join(',')}`)).nodes
      : {}
  const docs = {}
  for (const { document: section } of Object.values(sections)) {
    const texts = textsOf(section)
    if (texts.includes(GUIDE_LABELS.whenToUse)) docs[section.name] = texts
  }
  return { nodes: Object.fromEntries(Object.entries(nodes).map(([id, node]) => [id, node?.document])), docs }
}

/** A Figma guide's lines per section, read off its docs section's text. */
function figmaGuide(texts) {
  const at = (label, from) => texts.indexOf(label, from)
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
function variantsOf(node) {
  return Object.fromEntries(
    Object.entries(node.componentPropertyDefinitions ?? {})
      .filter(([name, { type }]) => type === 'VARIANT' && name !== INTERACTION_STATE)
      .map(([name, { variantOptions }]) => [name, variantOptions]),
  )
}

/** A code prop's values to compare, or null when it takes anything (a string, a node). */
function valuesOf(prop) {
  if (prop.allowedValues) return prop.allowedValues
  if (prop.typeScriptType === 'boolean') return ['false', 'true']
  // A single literal (`variant: 'error'`) reaches the component list as its type.
  if (LITERAL_UNION.test(prop.typeScriptType ?? ''))
    return prop.typeScriptType.split(' | ').map((literal) => literal.slice(1, -1))
  return null
}

/** The keys a Figma variant property may use for a prop: `isDisabled` is `Disabled`, CardBody's `layout` is `Body layout`. */
function keysFor(component, wholeComponent, propName) {
  const part = component.startsWith(wholeComponent) ? component.slice(wholeComponent.length) : ''
  const bare = propName.replace(BOOLEAN_PREFIX, '')
  return new Set([
    comparisonKey(propName),
    comparisonKey(bare),
    ...(part ? [comparisonKey(part + propName), comparisonKey(part + bare)] : []),
  ])
}

const isSameSet = (a, b) => a.length === b.length && a.every((value) => b.includes(value))

const { figmaFileUrl, components: mapping } = JSON.parse(await readFile(FIGMA_COMPONENTS_JSON, 'utf8'))
const { components: componentList } = JSON.parse(await readFile(COMPONENT_LIST, 'utf8'))
const fileKey = figmaFileUrl.match(/figma\.com\/design\/([^/]+)/)?.[1]
if (!fileKey) {
  console.error(`figma-components.json's figmaFileUrl isn't a figma.com/design URL: ${figmaFileUrl}`)
  process.exit(1)
}

// Several components can share one Figma node (Card, CardBody, CardFooter), so
// each node is asked for once and its variants are matched against all of them.
const mappedEntries = Object.entries(mapping).filter(([, entry]) => entry !== null)
const componentsByNode = new Map()
for (const [component, entry] of mappedEntries)
  componentsByNode.set(entry.figmaNodeId, [...(componentsByNode.get(entry.figmaNodeId) ?? []), component])

const guidedEntries = mappedEntries.filter(([component]) => componentList[component]?.guidance)
const { nodes, docs } = await readFigma(
  fileKey,
  [...componentsByNode.keys()],
  new Set(guidedEntries.map(([, { figmaName }]) => figmaName)),
)
const problems = []

for (const [nodeId, components] of componentsByNode) {
  const figmaNode = nodes[nodeId]
  if (!figmaNode) {
    problems.push(`${components.join(', ')}: node ${nodeId} isn't in the Figma file`)
    continue
  }
  for (const component of components) {
    if (figmaNode.name !== mapping[component].figmaName) {
      problems.push(
        `${component}: node ${nodeId} is "${figmaNode.name}" in Figma, not "${mapping[component].figmaName}"`,
      )
    }
  }
  if (!COMPONENT_TYPES.has(figmaNode.type) || VARIANT_NAME.test(figmaNode.name)) {
    problems.push(
      `${components.join(', ')}: node ${nodeId} isn't a component: map the component or its set, not a variant`,
    )
    continue
  }

  // The shortest name is the whole (Card); the rest are its parts (CardBody).
  const wholeComponent = [...components].sort((a, b) => a.length - b.length)[0]
  const figmaVariants = variantsOf(figmaNode)
  const figmaVariantPropertiesNotInCode = Object.assign(
    {},
    ...components.map((component) => mapping[component].figmaVariantPropertiesNotInCode),
  )
  const matchedFigma = new Set()

  for (const component of components) {
    const { propsNotInFigma = {}, propsWithDifferentValuesInFigma = {} } = mapping[component]
    const props = componentList[component]?.props ?? {}

    for (const [propName, prop] of Object.entries(props)) {
      const values = valuesOf(prop)
      if (!values) continue
      const keys = keysFor(component, wholeComponent, propName)
      const figmaName = Object.keys(figmaVariants).find((name) => keys.has(comparisonKey(name)))

      if (!figmaName) {
        if (prop.allowedValues && !(propName in propsNotInFigma)) {
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

      const codeValues = values.map(comparisonKey)
      const hasDefault = prop.defaultValue !== undefined
      // Figma's None stands for an optional prop left unset, which code has no value for.
      const isUnsetStandIn = (value) => value === UNSET_OPTION && !hasDefault && !codeValues.includes(UNSET_OPTION)
      const figmaValues = figmaVariants[figmaName].map(comparisonKey).filter((value) => !isUnsetStandIn(value))
      const isSame = isSameSet(codeValues, figmaValues)
      if (!isSame && !(propName in propsWithDifferentValuesInFigma)) {
        problems.push(
          `${component}.${propName} is ${values.join(' | ')} in code, ` +
            `but ${figmaName} on Figma's "${figmaNode.name}" is ${figmaVariants[figmaName].join(' | ')}`,
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

  for (const figmaName of Object.keys(figmaVariants)) {
    if (matchedFigma.has(figmaName) || figmaName in figmaVariantPropertiesNotInCode) continue
    problems.push(
      `Figma's "${figmaNode.name}" has a ${figmaName} variant (${figmaVariants[figmaName].join(', ')}) that no prop of ` +
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
const figmaNameOf = (component) => mapping[component]?.figmaName ?? component
for (const [component, { figmaName }] of docs ? guidedEntries : []) {
  const guide = componentList[component].guidance
  const texts = docs[figmaName]
  const figmaGuideLines = texts && figmaGuide(texts)
  if (!figmaGuideLines) {
    problems.push(`${component} has a usage guide, but Figma's "${figmaName}" docs section has none: add it there`)
    continue
  }
  const sections = [
    ['whenToUse', GUIDE_LABELS.whenToUse, guide.whenToUse],
    ['whenNotToUse', GUIDE_LABELS.whenNotToUse, guide.whenNotToUse],
  ]
  for (const [section, label, lines] of sections) {
    if (lines.length !== figmaGuideLines[section].length) {
      problems.push(
        `${component}'s usage guide has ${lines.length} ${label} lines in code, ${figmaGuideLines[section].length} in Figma's "${figmaName}": ` +
          `bring the side that's behind up to date`,
      )
    }
  }
  const insteadText = comparisonKey(figmaGuideLines.whenNotToUse.join(' '))
  const namedAlternatives = new Set(
    guide.whenNotToUse.flatMap((line) => [...line.matchAll(/`([A-Z]\w+)`/g)].map(([, alternative]) => alternative)),
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
