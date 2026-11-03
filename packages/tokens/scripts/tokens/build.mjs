/**
 * Build the tokens in these steps:
 *
 *   1. Figma export -> DTCG files in tokens/ (scripts/tokens/figma-to-dtcg.mjs)
 *   2. DTCG files -> tokens.css, with Style Dictionary (scripts/tokens/dtcg-to-css.mjs)
 *   3. DTCG text styles -> text-styles.css, a class per style (scripts/tokens/dtcg-to-text-styles.mjs)
 *   4. The token reference at the end of DESIGN.md (scripts/tokens/token-reference.mjs)
 *
 * so the CSS is generated from the same files other tools read.
 *
 *   src/figma/variables.json    raw export of the Figma variables (see figma-plugin/)
 *   src/figma/text-styles.json  raw export of the Figma text styles
 *   src/code-tokens.json        what Figma variables can't hold, which may pull Figma values in
 *
 * A Figma variable's code syntax must be its name with `/` as `-` (`bg/base`
 * is `--bg-base`); variables without one are inputs only, not CSS variables.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildCss } from './dtcg-to-css.mjs'
import { buildTextStylesCss } from './dtcg-to-text-styles.mjs'
import { writeDtcg } from './figma-to-dtcg.mjs'
import { writeDesign } from './token-reference.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const read = async (path) => JSON.parse(await readFile(resolve(ROOT, path), 'utf8'))

const figma = await read('src/figma/variables.json')
const textStyles = await read('src/figma/text-styles.json')
const code = await read('src/code-tokens.json')
const pkg = await read('package.json')

for (const v of figma.variables) {
  const expected = `var(--${v.name.replace(/\//g, '-')})`
  if (v.code && v.code !== expected) throw new Error(`${v.name} has code syntax ${v.code}; it must be ${expected}`)
}

const byName = new Map(figma.variables.map((v) => [v.name, v]))

function hex(n) {
  return Math.round(n * 255)
    .toString(16)
    .padStart(2, '0')
}

/** A Figma variable's raw value in a mode, following aliases, as CSS. */
function rawValue(v, mode) {
  let value = v.values[mode] ?? Object.values(v.values)[0]
  for (let hops = 0; value && value.alias && hops < 8; hops++) {
    const target = byName.get(value.alias)
    value = target.values[mode] ?? Object.values(target.values)[0]
  }
  if (v.type !== 'COLOR') return value
  const { r, g, b, a } = value
  return a >= 1
    ? `#${hex(r)}${hex(g)}${hex(b)}`
    : `rgba(${[r, g, b].map((n) => Math.round(n * 255)).join(', ')}, ${+a.toFixed(3)})`
}

/** A code-tokens.json template with `{figma/name}` filled in for a mode. */
function interpolate(template, mode) {
  return template.replace(/\{([\w/-]+)\}/g, (_, name) => {
    const v = byName.get(name)
    if (!v) throw new Error(`code-tokens.json references unknown Figma variable ${name}`)
    return rawValue(v, mode)
  })
}

const dir = resolve(ROOT, 'tokens')
const { written, cssOnly } = await writeDtcg({
  dir,
  variables: figma.variables,
  textStyles: textStyles.styles,
  code,
  figmaOverride: (v, mode) => code.figma[v.name] && interpolate(code.figma[v.name], mode),
})
console.log(`tokens/: ${written.join(', ')}`)

const header = `/* ${pkg.name} ${pkg.version}. Generated from Figma by scripts/tokens/build.mjs; do not edit. */`
const { css, count, overrides } = await buildCss({ dir, header, cssOnly })
// At the package root, where `@swiftsolve/rove-tokens/tokens.css` points, so
// every tool (bundlers and editors alike) finds the same file.
await writeFile(resolve(ROOT, 'tokens.css'), css)
console.log(`tokens.css: ${count} tokens, ${overrides} light overrides`)

const textStylesCss = await buildTextStylesCss({ dir, header })
await writeFile(resolve(ROOT, 'text-styles.css'), textStylesCss.css)
console.log(`text-styles.css: ${textStylesCss.count} classes`)

const design = await writeDesign({
  path: resolve(ROOT, 'DESIGN.md'),
  variables: figma.variables,
  textStyles: textStyles.styles,
  code,
  css,
})
console.log(
  `DESIGN.md: ${design.colours} colours, ${design.others} other tokens, ${design.styles} text styles, ${design.code} code-only tokens`,
)
