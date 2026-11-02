/**
 * Write tokens.css from the DTCG files in tokens/, with Style Dictionary.
 *
 * Style Dictionary reads each theme (every file plus color.dark or
 * color.light) and resolves the references; the `rove/css` format writes the
 * Dark theme on :root and only what differs in Light on :root.theme-light.
 *
 * - Names follow the token paths: `bg.base` is `--bg-base`.
 * - A reference to a token that's in the CSS stays a var() (`var(--accent-default)`);
 *   a reference to one that isn't (a Palette shade, a shadow colour) becomes its value.
 * - Tokens marked `css: false` (Figma variables without a code syntax, the Palette)
 *   are inputs only.
 * - Each text style becomes four variables, --type-<style>-size, -weight,
 *   -line-height and -letter-spacing (in em), rather than a `font` shorthand,
 *   which has no room for letter spacing.
 */
import { basename } from 'node:path'
import StyleDictionary from 'style-dictionary'
import { EXTENSION } from './figma-to-dtcg.mjs'

/** Source files in output order, with the section comment each opens. */
const FILES = [
  ['palette', null],
  ['color', 'Color'],
  ['spacing', 'Spacing'],
  ['typography', 'Typography'],
  ['opacity', 'Opacity'],
  ['layout', 'Layout'],
  ['motion', 'Motion'],
  ['code', 'Code-only'],
  ['text-styles', 'Type styles'],
]
const GENERIC_FONTS = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong', '-apple-system', 'BlinkMacSystemFont'])

const isCss = (token) => token.$extensions?.[EXTENSION]?.css !== false
const fileOf = (token) => basename(token.filePath).replace(/\.tokens\.json$/, '').replace(/\.(dark|light)$/, '')
const hex = (n) => Math.round(n * 255).toString(16).padStart(2, '0')
const round = (n) => +n.toFixed(4)

/** A DTCG dimension, or a value already written as CSS, as CSS. */
const dimension = (d) => (typeof d === 'string' ? d : `${d.value}${d.unit}`)
/** Zero without a unit, as shadows are written by hand. */
const length = (d) => (parseFloat(dimension(d)) === 0 ? '0' : dimension(d))

function color(c) {
  const [r, g, b] = c.components
  const alpha = c.alpha ?? 1
  if (alpha >= 1) return `#${hex(r)}${hex(g)}${hex(b)}`
  const ch = (n) => Math.round(n * 255)
  return `rgba(${ch(r)}, ${ch(g)}, ${ch(b)}, ${+alpha.toFixed(3)})`
}

/** A token's type: its own, or (for a bare alias) the type of what it points at. */
function typeOf(token, byPath) {
  for (let t = token, hops = 0; t && hops < 8; hops++) {
    if (t.$type) return t.$type
    t = byPath.get(String(t.original.$value).slice(1, -1))
  }
  return undefined
}

/** A resolved simple value as CSS. */
function cssValue(token, type) {
  const value = token.$value
  if (typeof value === 'string') return value
  switch (type) {
    case 'color': return color(value)
    case 'dimension':
    case 'duration': return dimension(value)
    // Opacity, as a percentage for color-mix().
    case 'number': return `${round(value * 100)}%`
    case 'fontWeight': return String(value)
    case 'cubicBezier': return `cubic-bezier(${value.join(', ')})`
    case 'fontFamily': return [value].flat().map((f) => (GENERIC_FONTS.has(f) ? f : `'${f}'`)).join(', ')
    default: throw new Error(`tokens.css: no CSS for ${token.path.join('.')} (${type})`)
  }
}

/** The declarations for one token: [name, value, comment?][]. */
function declarations(token, byPath) {
  const name = `--${token.name}`
  // A reference to a token in the CSS stays a var(); anything else is the resolved value.
  const refOr = (original, resolved) => {
    const target = typeof original === 'string' && /^\{([^}]+)\}$/.test(original) && byPath.get(original.slice(1, -1))
    return target && isCss(target) ? `var(--${target.name})` : resolved
  }
  const original = token.original.$value
  const value = token.$value
  if (token.$type === 'typography') {
    const size = parseFloat(dimension(value.fontSize))
    const spacing = parseFloat(dimension(value.letterSpacing))
    return [
      [`${name}-size`, refOr(original.fontSize, dimension(value.fontSize))],
      [`${name}-weight`, refOr(original.fontWeight, String(value.fontWeight))],
      [`${name}-line-height`, refOr(original.lineHeight, String(value.lineHeight))],
      // DTCG holds letter spacing in px; CSS keeps it relative to the size, as Figma does.
      [`${name}-letter-spacing`, refOr(original.letterSpacing, spacing === 0 ? '0' : `${round(spacing / size)}em`)],
    ]
  }
  if (token.$type === 'shadow') {
    const layers = [value].flat()
    const originals = [original].flat()
    const css = layers.map((l, i) => {
      const spread = length(l.spread ?? '0')
      return [length(l.offsetX), length(l.offsetY), length(l.blur), ...(spread === '0' ? [] : [spread]), refOr(originals[i].color, typeof l.color === 'string' ? l.color : color(l.color))].join(' ')
    })
    return [[name, css.join(', ')]]
  }
  if (token.$type === 'border') {
    return [[name, `${refOr(original.width, dimension(value.width))} ${value.style} ${refOr(original.color, typeof value.color === 'string' ? value.color : color(value.color))}`]]
  }
  return [[name, refOr(original, cssValue(token, typeOf(token, byPath))), token.$description]]
}

/**
 * The `rove/css` format: one block of declarations. With `options.dark` (the
 * Dark block's values by name) it keeps only what differs, for the Light block.
 */
function format({ dictionary, options }) {
  const byPath = new Map(dictionary.allTokens.map((t) => [t.path.join('.'), t]))
  const lines = []
  let section = null
  const declare = ([name, value, comment]) => {
    if (options.dark) {
      if (options.dark.get(name) !== value) lines.push(`  ${name}: ${value};`)
      return
    }
    options.record.set(name, value)
    lines.push(`  ${name}: ${value};${comment ? ` /* ${comment} */` : ''}`)
  }
  for (const token of dictionary.allTokens.filter(isCss)) {
    const file = fileOf(token)
    if (!options.dark && file !== section) {
      // CSS-only expressions close the code section.
      if (section === 'code') options.cssOnly.forEach(declare)
      section = file
      lines.push(`\n  /* ${FILES.find(([f]) => f === file)[1]} */`)
    }
    declarations(token, byPath).forEach(declare)
  }
  if (options.dark) options.cssOnly.forEach(declare)
  return options.dark ? `${options.selector} {\n${lines.join('\n')}\n}\n` : `${options.selector} {${lines.join('\n')}\n}\n`
}

async function block({ dir, mode, options }) {
  // Style Dictionary reads `source` as globs, which need forward slashes (on Windows too).
  const base = dir.replaceAll('\\', '/')
  const sd = new StyleDictionary({
    usesDtcg: true,
    log: { verbosity: 'silent', warnings: 'error' },
    source: FILES.map(([f]) => `${base}/${f === 'color' ? `color.${mode}` : f}.tokens.json`),
    hooks: {
      transforms: { 'rove/name': { type: 'name', transform: (token) => token.path.join('-') } },
      formats: { 'rove/css': format },
    },
    platforms: { css: { transforms: ['rove/name'], files: [{ destination: 'tokens.css', format: 'rove/css', options }] } },
  })
  const tokens = (await sd.getPlatformTokens('css')).allTokens
  if (tokens.length === 0) throw new Error(`tokens.css: Style Dictionary found no tokens in ${base} (${mode})`)
  const [{ output }] = await sd.formatPlatform('css')
  return output
}

/**
 * tokens.css as a string. `cssOnly` is [name, value][] for the code-only
 * tokens DTCG can't type (CSS expressions), written the same in both themes.
 */
export async function buildCss({ dir, header, cssOnly }) {
  const record = new Map()
  const dark = await block({ dir, mode: 'dark', options: { selector: ':root', record, cssOnly } })
  const light = await block({ dir, mode: 'light', options: { selector: ':root.theme-light', dark: record, cssOnly } })
  return { css: `${header}\n${dark}\n${light}`, count: record.size, overrides: light.split('\n').filter((l) => l.startsWith('  --')).length }
}
