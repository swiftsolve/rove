/**
 * Check that app code gives a library component a `className` only for its
 * place in a layout, never to restyle it.
 *
 * Placement is margin, position and z-index, its size, how it sits as a flex
 * or grid item, its own text alignment, rounding to fit its container, and
 * showing or hiding it. A class that changes how the component looks inside
 * (padding, its own layout, type, colour, surface, or a utility from
 * src/styles/utilities.css) is flagged: that's a variant the component is
 * missing, or a style for an element the view owns.
 *
 * It reads every `className` passed to a component imported from `@/ui` in
 * src/app and src/features, following constants, `cx`/`cn`/`cva` calls and
 * imported constants to their strings. A prop passed through or a CSS module
 * class can't be read, so it isn't checked.
 *
 *   node scripts/checks/ui-classname.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const ts = createRequire(import.meta.url)('typescript')
const SCANNED = ['src/app', 'src/features']
const UTILITIES_CSS = 'src/styles/utilities.css'

/** Components whose className is their whole look, by design. */
function isExempt(name) {
  // A glyph is drawn in currentColor, so its colour is the caller's to set.
  if (name.endsWith('Icon')) return true
  // An unstyled button: the view gives it its look.
  return name === 'CollapsibleTrigger'
}

const ALIGN = /^text-(left|right|center|start|end|justify)$/
const RULES = [
  ['padding', /^p[xytrblse]?-/],
  ['its own layout', /^(flex|inline-flex|grid|inline-grid|contents|table)$/],
  ['its own layout', /^flex-(row|col|wrap|nowrap)/],
  [
    'its own layout',
    /^(grid-cols|grid-rows|grid-flow|gap|gap-x|gap-y|space-x|space-y|items|justify-items|place-items|place-content|divide)(-|$)/,
  ],
  ['its own layout', /^justify-(?!self)/],
  ['type', /^(type-|text-|font-|leading-|tracking-|whitespace-|line-clamp-|wrap-|break-)/],
  ['type', /^(truncate|num|tabular-nums|uppercase|lowercase|capitalize|italic|underline)$/],
  ['surface', /^(bg-|border|shadow|ring|outline|fill-|stroke-)/],
]
const ARBITRARY_PROPERTIES =
  /^(padding|font|color|background|border|box-shadow|display|gap|line-height|letter-spacing|text-|white-space)/

const utilityNames = [...readFileSync(join(ROOT, UTILITIES_CSS), 'utf8').matchAll(/@utility ([\w-]+)/g)].map(
  (m) => m[1],
)

/**
 * A class without its variants (`group-hover:`, `[@media(…)]:`), its `!`
 * important mark or its `-` sign: `md:-mt-4` is `mt-4`. A `:` inside brackets
 * belongs to the value, so only one outside them ends a variant.
 */
function utilityOf(token) {
  let depth = 0
  let start = 0
  for (let i = 0; i < token.length; i++) {
    if ('[('.includes(token[i])) depth++
    else if ('])'.includes(token[i])) depth--
    else if (token[i] === ':' && depth === 0) start = i + 1
  }
  return token.slice(start).replace(/^!|!$/g, '').replace(/^-/, '')
}

/** Whether `utility` is the @utility `name`, or one of its values when `name` ends in `-*`. */
function isCustomUtility(utility, name) {
  if (utility === name) return true
  return name.endsWith('-*') && utility.startsWith(name.slice(0, -1))
}

/** Why a class restyles a component, or null when it only places it. */
function restyleReason(token) {
  const utility = utilityOf(token)
  if (!utility) return null
  const property = utility.match(/^\[([a-z-]+):/)
  if (property) return ARBITRARY_PROPERTIES.test(property[1]) ? property[1] : null
  if (ALIGN.test(utility)) return null
  for (const [reason, pattern] of RULES) if (pattern.test(utility)) return reason
  const name = utilityNames.find((utilityName) => isCustomUtility(utility, utilityName))
  return name ? `the ${name} utility` : null
}

async function tsxFiles(dir) {
  const files = []
  for (const entry of await readdir(join(ROOT, dir), { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await tsxFiles(path)))
    else if (/\.tsx$/.test(entry.name) && !/\.(test|stories)\.tsx$/.test(entry.name)) files.push(path)
  }
  return files
}

const sources = new Map()
function source(file) {
  if (!sources.has(file)) {
    const text = readFileSync(join(ROOT, file), 'utf8')
    sources.set(
      file,
      ts.createSourceFile(
        file,
        text,
        ts.ScriptTarget.Latest,
        true,
        file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      ),
    )
  }
  return sources.get(file)
}

/** The file a relative or `@/` import points at, if it's in the repo. */
function resolveImport(from, specifier) {
  let base
  if (specifier.startsWith('@/')) base = join('src', specifier.slice(2))
  else if (specifier.startsWith('.')) base = join(dirname(from), specifier)
  else return null
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')])
    if (existsSync(join(ROOT, candidate))) return candidate
  return null
}

/** The initializer of a top-level `const name`, in this file or the one it's imported from. */
function definition(file, name) {
  const sf = source(file)
  for (const statement of sf.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === name && decl.initializer)
          return { file, node: decl.initializer }
      }
    }
    if (
      ts.isImportDeclaration(statement) &&
      statement.importClause?.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      const element = statement.importClause.namedBindings.elements.find((e) => e.name.text === name)
      const target = element && resolveImport(file, statement.moduleSpecifier.text)
      if (target) return definition(target, (element.propertyName ?? element.name).text)
    }
  }
  return null
}

/** Every class string an expression can produce, as far as it can be read statically. */
function classStrings(file, node, seen = new Set()) {
  if (!node) return []
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text]
  if (ts.isTemplateExpression(node)) {
    return [
      node.head.text,
      ...node.templateSpans.flatMap((span) => [span.literal.text, ...classStrings(file, span.expression, seen)]),
    ]
  }
  if (ts.isIdentifier(node)) {
    const key = `${file}:${node.text}`
    if (seen.has(key)) return []
    seen.add(key)
    const found = definition(file, node.text)
    return found ? classStrings(found.file, found.node, seen) : []
  }
  if (ts.isCallExpression(node))
    return [
      ...classStrings(file, node.expression, seen),
      ...node.arguments.flatMap((arg) => classStrings(file, arg, seen)),
    ]
  if (ts.isObjectLiteralExpression(node)) {
    return node.properties.flatMap((p) => (ts.isPropertyAssignment(p) ? classStrings(file, p.initializer, seen) : []))
  }
  if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap((e) => classStrings(file, e, seen))
  if (ts.isConditionalExpression(node))
    return [...classStrings(file, node.whenTrue, seen), ...classStrings(file, node.whenFalse, seen)]
  if (ts.isBinaryExpression(node))
    return [...classStrings(file, node.left, seen), ...classStrings(file, node.right, seen)]
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node))
    return classStrings(file, node.expression, seen)
  if (ts.isJsxExpression(node)) return classStrings(file, node.expression, seen)
  // A CSS module class (`styles.x`) or anything else: not readable here.
  return []
}

const problems = []
let checked = 0

for (const file of (await Promise.all(SCANNED.map(tsxFiles))).flat()) {
  const sf = source(file)
  const uiNames = new Set()
  for (const statement of sf.statements) {
    const bindings =
      ts.isImportDeclaration(statement) &&
      statement.moduleSpecifier.text === '@/ui' &&
      statement.importClause?.namedBindings
    if (bindings && ts.isNamedImports(bindings)) bindings.elements.forEach((e) => uiNames.add(e.name.text))
  }
  if (uiNames.size === 0) continue

  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(sf)
      const attribute =
        uiNames.has(tag) && !isExempt(tag)
          ? node.attributes.properties.find((a) => ts.isJsxAttribute(a) && a.name.getText(sf) === 'className')
          : null
      if (attribute) {
        checked++
        const line = sf.getLineAndCharacterOfPosition(attribute.getStart(sf)).line + 1
        const tokens = new Set(
          classStrings(file, attribute.initializer)
            .flatMap((s) => s.split(/\s+/))
            .filter(Boolean),
        )
        for (const token of tokens) {
          const reason = restyleReason(token)
          if (reason)
            problems.push(`${relative(ROOT, join(ROOT, file))}:${line}  <${tag} className>: '${token}' sets ${reason}`)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
}

if (problems.length > 0) {
  console.error(problems.join('\n'))
  console.error(
    `\n${problems.length} class${problems.length === 1 ? '' : 'es'} restyling a library component. ` +
      'className is only for its place in a layout: use a variant, or style an element the view owns. ' +
      'The rule: src/README.md, Styles.',
  )
  process.exit(1)
}
console.log(`ui className OK (${checked} placements)`)
