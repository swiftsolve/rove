/**
 * Check that cn()'s tailwind-merge theme (src/ui/foundations/cn.ts) names exactly what
 * the Tailwind theme (src/styles/tailwind.css) defines.
 *
 * tailwind-merge only knows a utility's group from these lists. A theme name
 * missing from them isn't recognised, so `cn('text-md', 'text-lg')` keeps both;
 * a whole namespace missing means its utilities never merge. Names in the lists
 * that the theme no longer has are dead. Its text style classes must match
 * rove-tokens' text-styles.css the same way.
 *
 *   node scripts/checks/cn-theme.mjs
 */
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const THEME_CSS = 'src/styles/tailwind.css'
const CN_TS = 'src/ui/foundations/cn.ts'
const TEXT_STYLES_CSS = '@swiftsolve/rove-tokens/text-styles.css'

// Colours Tailwind has without a theme entry; cn.ts lists them so they still merge.
const BUILT_IN_COLORS = ['transparent', 'current', 'inherit']
// Longest first, so `--font-weight-*` isn't read as a `--font-*` name.
const NAMESPACES = [
  'font-weight',
  'font',
  'spacing',
  'text',
  'color',
  'leading',
  'tracking',
  'radius',
  'shadow',
  'ease',
  'animate',
]

const problems = []

const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

/** Theme names by namespace, from every `@theme` block: `--text-md` is `text: md`. */
function themeNames(css) {
  const names = new Map()
  for (const [, block] of stripComments(css).matchAll(/@theme[^{]*\{([\s\S]*?)\n\}/g)) {
    for (const [, variable] of block.matchAll(/^\s*--([a-z0-9-]+)\s*:/gm)) {
      const namespace = NAMESPACES.find((ns) => variable.startsWith(`${ns}-`))
      if (!namespace) {
        problems.push(`${THEME_CSS}: --${variable} is in no namespace this check knows; add it to NAMESPACES and cn.ts`)
        continue
      }
      if (!names.has(namespace)) names.set(namespace, new Set())
      names.get(namespace).add(variable.slice(namespace.length + 1))
    }
  }
  return names
}

/** The names under `theme: { … }` in cn.ts, with a `const X = [...]` resolved. */
function cnNames(ts) {
  const code = stripComments(ts)
  const strings = (list) => [...list.matchAll(/'([^']*)'/g)].map((match) => match[1])
  const constants = new Map(
    [...code.matchAll(/const (\w+) = \[([\s\S]*?)\]/g)].map(([, name, list]) => [name, strings(list)]),
  )
  const theme = code.match(/theme: \{([\s\S]*?)\n\s*\},/)
  if (!theme) throw new Error(`${CN_TS}: no \`theme: { … }\` object found`)
  const names = new Map()
  for (const [, key, value] of theme[1].matchAll(/^\s*'?([\w-]+)'?:\s*(\[[^\]]*\]|\w+),?$/gm)) {
    const list = value.startsWith('[') ? strings(value) : constants.get(value)
    if (!list) throw new Error(`${CN_TS}: theme.${key} is ${value}, which isn't a list here`)
    names.set(key, new Set(list))
  }
  return names
}

const theme = themeNames(await readFile(join(ROOT, THEME_CSS), 'utf8'))
const cn = cnNames(await readFile(join(ROOT, CN_TS), 'utf8'))

for (const [namespace, defined] of theme) {
  const listed = cn.get(namespace)
  if (!listed) {
    problems.push(`${CN_TS}: theme has no '${namespace}' list for ${THEME_CSS}'s --${namespace}-*`)
    continue
  }
  for (const name of defined) {
    if (!listed.has(name)) problems.push(`${CN_TS}: theme.${namespace} is missing '${name}' (--${namespace}-${name})`)
  }
}
for (const [namespace, listed] of cn) {
  const defined = theme.get(namespace) ?? new Set()
  for (const name of listed) {
    const isBuiltIn = namespace === 'color' && BUILT_IN_COLORS.includes(name)
    if (!defined.has(name) && !isBuiltIn)
      problems.push(`${CN_TS}: theme.${namespace} lists '${name}', which ${THEME_CSS} doesn't define`)
  }
}

const textStyles = new Set(
  [
    ...(await readFile(createRequire(import.meta.url).resolve(TEXT_STYLES_CSS), 'utf8')).matchAll(
      /^\s*\.(type-[a-z0-9-]+)\s*\{/gm,
    ),
  ].map((match) => match[1]),
)
const listedTextStyles = stripComments(await readFile(join(ROOT, CN_TS), 'utf8')).match(
  /const TEXT_STYLE_CLASSES = \[([\s\S]*?)\]/,
)
if (!listedTextStyles) throw new Error(`${CN_TS}: no TEXT_STYLE_CLASSES list found`)
const listed = new Set([...listedTextStyles[1].matchAll(/'([^']*)'/g)].map((match) => match[1]))
for (const name of textStyles) {
  if (!listed.has(name)) problems.push(`${CN_TS}: TEXT_STYLE_CLASSES is missing '${name}' (${TEXT_STYLES_CSS})`)
}
for (const name of listed) {
  if (!textStyles.has(name))
    problems.push(`${CN_TS}: TEXT_STYLE_CLASSES lists '${name}', which ${TEXT_STYLES_CSS} doesn't define`)
}

if (problems.length > 0) {
  console.error(problems.join('\n'))
  console.error(`\n${problems.length} cn theme problem${problems.length === 1 ? '' : 's'}`)
  process.exit(1)
}
const count = [...theme.values()].reduce((sum, names) => sum + names.size, 0)
console.log(`cn theme OK (${count} names in ${theme.size} namespaces, ${textStyles.size} text styles)`)
