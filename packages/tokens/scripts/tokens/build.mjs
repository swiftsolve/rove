/**
 * Build the tokens in these steps:
 *
 *   1. Figma export -> DTCG files in dist/tokens/ (scripts/tokens/figma-to-dtcg.mjs)
 *   2. DTCG files -> dist/tokens.css, with Style Dictionary (scripts/tokens/dtcg-to-css.mjs)
 *   3. DTCG text styles -> dist/text-styles.css, a class per style (scripts/tokens/dtcg-to-text-styles.mjs)
 *   4. The token reference at the end of DESIGN.md (scripts/tokens/token-reference.mjs)
 *
 * so the CSS is generated from the same files other tools read.
 *
 *   src/figma/variables.json      raw export of the Figma variables (see figma-plugin/)
 *   src/figma/text-styles.json    raw export of the Figma text styles
 *   src/figma/effect-styles.json  raw export of the Figma Shadow/* effect styles
 *   src/code-tokens.json          what Figma can't hold, which may pull Figma values in
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
import { cssColor } from './shared.mjs'
import { writeDesign } from './token-reference.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const read = async (path) => JSON.parse(await readFile(resolve(ROOT, path), 'utf8'))

const figma = await read('src/figma/variables.json')
const textStyles = await read('src/figma/text-styles.json')
const effectStyles = await read('src/figma/effect-styles.json')
const code = await read('src/code-tokens.json')
const pkg = await read('package.json')

for (const v of figma.variables) {
  const expected = `var(--${v.name.replace(/\//g, '-')})`
  if (v.code && v.code !== expected) throw new Error(`${v.name} has code syntax ${v.code}; it must be ${expected}`)
}

// A token's description is its use, shown in Figma's picker, the Storybook and
// DESIGN.md, so a token without one can't be chosen by its job. Add it in Figma.
const undescribed = [...figma.variables, ...textStyles.styles, ...effectStyles.styles]
  .filter((token) => !token.description?.trim())
  .map((token) => token.name)
if (undescribed.length) throw new Error(`No description in Figma: ${undescribed.join(', ')}`)

const byName = new Map(figma.variables.map((v) => [v.name, v]))

/** A variable's value in a mode, or in its only mode for a single-mode collection. */
const valueIn = (v, mode) => v.values[mode] ?? Object.values(v.values)[0]

/** A Figma variable's raw value in a mode, following aliases, as CSS. */
function rawValue(v, mode) {
  let value = valueIn(v, mode)
  for (let hops = 0; value?.alias; hops++) {
    if (hops === 8) throw new Error(`${v.name}: its aliases go round in a loop`)
    const target = byName.get(value.alias)
    if (!target) throw new Error(`${v.name}: alias to unknown Figma variable ${value.alias}`)
    value = valueIn(target, mode)
  }
  if (v.type !== 'COLOR') return value
  const { r, g, b, a } = value
  return cssColor([r, g, b], a)
}

/** A code-tokens.json template with `{figma/name}` filled in for a mode. */
function interpolate(template, mode) {
  return template.replace(/\{([\w/-]+)\}/g, (_, name) => {
    const v = byName.get(name)
    if (!v) throw new Error(`code-tokens.json references unknown Figma variable ${name}`)
    return rawValue(v, mode)
  })
}

/** A length as CSS: 0 bare, anything else in px. */
const px = (n) => (n === 0 ? '0' : `${n}px`)

/**
 * A Shadow/* effect style as a shadow token: `Shadow/Panel` is `--shadow-panel`,
 * each layer `x y blur [spread] {colour variable}`, as the build reads code tokens.
 */
function shadowToken({ name, layers }) {
  const token = `--shadow-${name
    .replace(/^Shadow\//, '')
    .toLowerCase()
    .replace(/\s+/g, '-')}`
  const css = layers.map(({ x, y, blur, spread, color }) => {
    if (typeof color !== 'string') throw new Error(`${name}: bind each layer's colour to a variable in Figma`)
    return [px(x), px(y), px(blur), ...(spread ? [px(spread)] : []), `{${color}}`].join(' ')
  })
  return [token, css.join(', ')]
}

// Shadows are designed in Figma, so code-tokens.json mustn't define its own.
const ownShadows = Object.keys(code.tokens).filter((t) => t.startsWith('--shadow-'))
if (ownShadows.length) throw new Error(`code-tokens.json defines ${ownShadows.join(', ')}; shadows come from Figma`)
const shadows = Object.fromEntries(effectStyles.styles.map(shadowToken))

const DIST = resolve(ROOT, 'dist')
const dir = resolve(DIST, 'tokens')
const { written, cssOnly } = await writeDtcg({
  dir,
  variables: figma.variables,
  textStyles: textStyles.styles,
  code: { ...code, tokens: { ...shadows, ...code.tokens } },
  figmaOverride: (v, mode) => code.figma[v.name] && interpolate(code.figma[v.name], mode),
})
console.log(`dist/tokens/: ${written.join(', ')}`)

const header = `/* ${pkg.name} ${pkg.version}. Generated from Figma by scripts/tokens/build.mjs; do not edit. */`
const { css, count, overrides } = await buildCss({ dir, header, cssOnly })
// package.json's `exports` maps `@swiftsolve/rove-tokens/tokens.css` here.
await writeFile(resolve(DIST, 'tokens.css'), css)
console.log(`dist/tokens.css: ${count} tokens, ${overrides} light overrides`)

const textStylesCss = await buildTextStylesCss({ dir, header })
await writeFile(resolve(DIST, 'text-styles.css'), textStylesCss.css)
console.log(`dist/text-styles.css: ${textStylesCss.count} classes`)

const design = await writeDesign({
  path: resolve(ROOT, 'DESIGN.md'),
  variables: figma.variables,
  textStyles: textStyles.styles,
  shadows: effectStyles.styles,
  code,
  css,
})
console.log(
  `DESIGN.md: ${design.colours} colours, ${design.others} other tokens, ${design.styles} text styles, ${design.code} code-only tokens`,
)
