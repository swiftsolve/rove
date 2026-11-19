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
import type { FormatFnArguments, TransformedToken } from 'style-dictionary/types'

import { cssColor, EXTENSION } from './shared.ts'

/** A declaration: [name, value, comment?]. */
type Declaration = [name: string, value: string, comment?: string]

/** The `rove/css` format's options, set per theme. */
type ThemeOptions = {
  selector: string
  /** Each Dark value by name: the Dark block fills it, the Light block reads it. */
  darkValues: Map<string, string>
  isLight?: boolean
  cssOnly: Declaration[]
}

type TokensByPath = Map<string, TransformedToken>

/** A DTCG dimension: `{ value: 12, unit: 'px' }`. */
type Dimension = { value: number; unit: string }
/** A DTCG colour. */
type Color = { components: [number, number, number]; alpha?: number }
/** A DTCG typography value; a field is CSS once its reference resolves. */
type Typography = {
  fontSize: Dimension | string
  fontWeight: number | string
  lineHeight: number | string
  letterSpacing: Dimension | string
}
type ShadowLayer = {
  offsetX: Dimension | string
  offsetY: Dimension | string
  blur: Dimension | string
  spread?: Dimension | string
  color: Color | string
}
type Border = { width: Dimension | string; style: string; color: Color | string }
/** A composite value as written in the file, each field a reference or a value. */
type OriginalFields = Record<string, unknown>

/** Source files in output order, with the section comment each opens. */
const FILES: [file: string, section: string | null][] = [
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
const GENERIC_FONTS = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'emoji',
  'math',
  'fangsong',
  '-apple-system',
  'BlinkMacSystemFont',
])

const isCss = (token: TransformedToken) => {
  const extensions = token.$extensions as Record<string, { css?: boolean } | undefined> | undefined
  return extensions?.[EXTENSION]?.css !== false
}
const fileOf = (token: TransformedToken) =>
  basename(token.filePath)
    .replace(/\.tokens\.json$/, '')
    .replace(/\.(dark|light)$/, '')
const round = (n: number) => +n.toFixed(4)

/** A DTCG dimension, or a value already written as CSS, as CSS. */
const formatDimension = (d: Dimension | string) => (typeof d === 'string' ? d : `${d.value}${d.unit}`)
/** A dimension with zero written bare, as a shadow is written in CSS. */
const formatShadowLength = (d: Dimension | string) => (parseFloat(formatDimension(d)) === 0 ? '0' : formatDimension(d))

/** A DTCG colour, or a value already written as CSS, as CSS. */
const formatColor = (c: Color | string) => (typeof c === 'string' ? c : cssColor(c.components, c.alpha))

/** A token's type: its own, or (for a bare alias) the type of what it points at. */
function typeOf(token: TransformedToken, byPath: TokensByPath) {
  let current: TransformedToken | undefined = token
  // Eight hops is far more than any real chain of aliases.
  for (let hops = 0; current && hops < 8; hops++) {
    if (current.$type) return current.$type
    // A bare alias's value is `{path}`; without the braces it's the path it points at.
    current = byPath.get(String(current.original.$value).slice(1, -1))
  }
  return undefined
}

/** A resolved simple value as CSS. */
function cssValue(token: TransformedToken, type: string | undefined): string {
  const value: unknown = token.$value
  if (typeof value === 'string') return value
  switch (type) {
    case 'color':
      return formatColor(value as Color)
    case 'dimension':
    case 'duration':
      return formatDimension(value as Dimension)
    // Opacity, as a percentage for color-mix().
    case 'number':
      return `${round((value as number) * 100)}%`
    case 'fontWeight':
      return String(value)
    case 'cubicBezier':
      return `cubic-bezier(${(value as number[]).join(', ')})`
    case 'fontFamily':
      return (value as string[]).map((f) => (GENERIC_FONTS.has(f) ? f : `'${f}'`)).join(', ')
    default:
      throw new Error(`tokens.css: no CSS for ${token.path.join('.')} (${type})`)
  }
}

/** The declarations for one token: [name, value, comment?][]. */
function declarations(token: TransformedToken, byPath: TokensByPath): Declaration[] {
  const name = `--${token.name}`
  // A reference to a token in the CSS stays a var(); anything else is the resolved value.
  const referenceOr = (original: unknown, resolved: string) => {
    const isReference = typeof original === 'string' && /^\{([^}]+)\}$/.test(original)
    const target = isReference ? byPath.get(original.slice(1, -1)) : undefined
    return target && isCss(target) ? `var(--${target.name})` : resolved
  }
  const original: unknown = token.original.$value
  if (token.$type === 'typography') {
    const value = token.$value as Typography
    const originalFields = original as OriginalFields
    const size = parseFloat(formatDimension(value.fontSize))
    const spacing = parseFloat(formatDimension(value.letterSpacing))
    return [
      [`${name}-size`, referenceOr(originalFields.fontSize, formatDimension(value.fontSize))],
      [`${name}-weight`, referenceOr(originalFields.fontWeight, String(value.fontWeight))],
      [`${name}-line-height`, referenceOr(originalFields.lineHeight, String(value.lineHeight))],
      // DTCG holds letter spacing in px; CSS keeps it relative to the size, as Figma does.
      [
        `${name}-letter-spacing`,
        referenceOr(originalFields.letterSpacing, spacing === 0 ? '0' : `${round(spacing / size)}em`),
      ],
    ]
  }
  if (token.$type === 'shadow') {
    const layers = [token.$value as ShadowLayer | ShadowLayer[]].flat()
    const originals = [original as OriginalFields | OriginalFields[]].flat()
    const layersCss = layers.map((layer, i) => {
      const spread = formatShadowLength(layer.spread ?? '0')
      return [
        formatShadowLength(layer.offsetX),
        formatShadowLength(layer.offsetY),
        formatShadowLength(layer.blur),
        ...(spread === '0' ? [] : [spread]),
        referenceOr(originals[i]?.color, formatColor(layer.color)),
      ].join(' ')
    })
    return [[name, layersCss.join(', ')]]
  }
  if (token.$type === 'border') {
    const value = token.$value as Border
    const originalFields = original as OriginalFields
    return [
      [
        name,
        `${referenceOr(originalFields.width, formatDimension(value.width))} ${value.style} ${referenceOr(originalFields.color, formatColor(value.color))}`,
      ],
    ]
  }
  return [[name, referenceOr(original, cssValue(token, typeOf(token, byPath))), token.$description]]
}

/**
 * The `rove/css` format: one block of declarations. For the Dark block it
 * records each value in `options.darkValues`; for the Light block
 * (`options.isLight`) it keeps only what differs from them.
 */
function format({ dictionary, options: formatOptions }: FormatFnArguments) {
  const options = formatOptions as unknown as ThemeOptions
  const byPath: TokensByPath = new Map(dictionary.allTokens.map((t) => [t.path.join('.'), t]))
  const lines: string[] = []
  let section: string | null = null
  const declare = ([name, value, comment]: Declaration) => {
    if (options.isLight) {
      if (options.darkValues.get(name) !== value) lines.push(`  ${name}: ${value};`)
      return
    }
    options.darkValues.set(name, value)
    lines.push(`  ${name}: ${value};${comment ? ` /* ${comment} */` : ''}`)
  }
  // The CSS-only expressions close the code section: written once, as the
  // section after it opens, or at the end if nothing follows it.
  let isCssOnlyWritten = false
  const declareCssOnly = () => {
    if (!isCssOnlyWritten) options.cssOnly.forEach(declare)
    isCssOnlyWritten = true
  }
  // Style Dictionary merges groups across files (focus.ring is Color, focus.offset
  // Layout), so put each file's tokens back together, in file order.
  const fileOrder = (token: TransformedToken) => FILES.findIndex(([f]) => f === fileOf(token))
  const tokens = dictionary.allTokens.filter(isCss).sort((a, b) => fileOrder(a) - fileOrder(b))
  for (const token of tokens) {
    const file = fileOf(token)
    if (!options.isLight && file !== section) {
      if (section === 'code') declareCssOnly()
      section = file
      lines.push(`\n  /* ${FILES.find(([f]) => f === file)?.[1]} */`)
    }
    declarations(token, byPath).forEach(declare)
  }
  declareCssOnly()
  return options.isLight
    ? `${options.selector} {\n${lines.join('\n')}\n}\n`
    : `${options.selector} {${lines.join('\n')}\n}\n`
}

/** One theme's rule of tokens.css, through Style Dictionary. */
async function buildThemeRule({ dir, mode, options }: { dir: string; mode: string; options: ThemeOptions }) {
  // Style Dictionary reads `source` as globs, which need forward slashes (on Windows too).
  const base = dir.replaceAll('\\', '/')
  const styleDictionary = new StyleDictionary({
    usesDtcg: true,
    log: { verbosity: 'silent', warnings: 'error' },
    source: FILES.map(([f]) => `${base}/${f === 'color' ? `color.${mode}` : f}.tokens.json`),
    hooks: {
      transforms: { 'rove/name': { type: 'name', transform: (token: TransformedToken) => token.path.join('-') } },
      formats: { 'rove/css': format },
    },
    platforms: {
      css: { transforms: ['rove/name'], files: [{ destination: 'tokens.css', format: 'rove/css', options }] },
    },
  })
  const tokens = (await styleDictionary.getPlatformTokens('css')).allTokens
  if (tokens.length === 0) throw new Error(`tokens.css: Style Dictionary found no tokens in ${base} (${mode})`)
  const [firstFile] = await styleDictionary.formatPlatform('css')
  return typeof firstFile?.output === 'string' ? firstFile.output : ''
}

/**
 * tokens.css as a string. `cssOnly` is [name, value][] for the code-only
 * tokens DTCG can't type (CSS expressions), written the same in both themes.
 */
export async function buildCss({ dir, header, cssOnly }: { dir: string; header: string; cssOnly: Declaration[] }) {
  const darkValues = new Map<string, string>()
  const dark = await buildThemeRule({ dir, mode: 'dark', options: { selector: ':root', darkValues, cssOnly } })
  const light = await buildThemeRule({
    dir,
    mode: 'light',
    options: { selector: ':root.theme-light', isLight: true, darkValues, cssOnly },
  })
  return {
    css: `${header}\n${dark}\n${light}`,
    count: darkValues.size,
    overrides: light.split('\n').filter((line) => line.startsWith('  --')).length,
  }
}
