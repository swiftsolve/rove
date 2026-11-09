/**
 * Write the tokens as DTCG files (Design Tokens Format Module 2025.10) in tokens/.
 *
 * One file per Figma collection, two for Color (one per mode), plus the text
 * styles and the code-only tokens. Paths follow the Figma names (`bg/base` is
 * `bg.base`), and Figma aliases stay references (`{neutral.850}`). A theme is every
 * file except one of color.dark / color.light.
 *
 * Figma variables without a code syntax (the Palette, the shadow colours) are
 * marked `"$extensions": { "net.swiftsolve.rove-tokens": { "css": false } }`:
 * other tokens refer to them, but they aren't CSS variables of their own.
 *
 * Code-only tokens that are CSS expressions (calc()) have no DTCG type; they're
 * returned for tokens.css instead.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { cssColor, EXTENSION, slug } from './shared.mjs'

const COLLECTIONS = {
  Palette: 'palette',
  Color: 'color',
  Spacing: 'spacing',
  Typography: 'typography',
  Opacity: 'opacity',
  Layout: 'layout',
  Motion: 'motion',
}
const MODES = { Dark: 'dark', Light: 'light' }

const tokenPath = (figmaName) => figmaName.split('/')
const reference = (figmaName) => `{${tokenPath(figmaName).join('.')}}`
const px = (value) => ({ value, unit: 'px' })
const round = (n) => +n.toFixed(4)

/** A Figma colour as a DTCG colour; `hex` drops the alpha, as DTCG asks. */
function dtcgColor({ r, g, b, a }) {
  return { colorSpace: 'srgb', components: [r, g, b], ...(a < 1 ? { alpha: a } : {}), hex: cssColor([r, g, b]) }
}

/** `'Inter', system-ui, sans-serif` as ['Inter', 'system-ui', 'sans-serif']. */
const fontStack = (css) => css.split(',').map((s) => s.trim().replace(/^'|'$/g, ''))

/** Put a token at a path, refusing a name that is both a token and a group. */
function placeToken(tree, segments, token) {
  let node = tree
  for (const [i, key] of segments.entries()) {
    if (i === segments.length - 1) {
      if (node[key]) throw new Error(`DTCG: ${segments.join('.')} is defined twice`)
      node[key] = token
    } else {
      node[key] ??= {}
      if ('$value' in node[key])
        throw new Error(`DTCG: ${segments.slice(0, i + 1).join('.')} is both a token and a group`)
      node = node[key]
    }
  }
}

/** A Figma variable's value in a mode as a DTCG token; `figmaOverride` gives code-tokens.json's value, if any. */
function figmaToken(v, mode, figmaOverride) {
  const value = v.values[mode] ?? Object.values(v.values)[0]
  const descriptionAndExtensions = {
    ...(v.description ? { $description: v.description } : {}),
    ...(v.code ? {} : { $extensions: { [EXTENSION]: { css: false } } }),
  }
  const override = figmaOverride(v, mode)
  if (v.type === 'STRING') {
    if (!v.name.startsWith('font-family/')) throw new Error(`DTCG: no type for the string variable ${v.name}`)
    return { $type: 'fontFamily', $value: override ? fontStack(override) : value, ...descriptionAndExtensions }
  }
  if (v.type === 'EASING' && value.spring) return springToken(v, value.spring, override, descriptionAndExtensions)
  const type = dtcgType(v)
  if (value.alias) return { $type: type, $value: reference(value.alias), ...descriptionAndExtensions }
  return { $type: type, $value: dtcgValue(type, value), ...descriptionAndExtensions }
}

/**
 * A spring easing. DTCG has no spring and CSS no spring curve, so its CSS is
 * the `linear()` curve code-tokens.json's `figma` gives it, untyped, and its
 * bounce rides in an extension.
 */
function springToken(v, spring, css, descriptionAndExtensions) {
  if (!css)
    throw new Error(`${v.name} is a spring, which CSS can't draw: give its linear() curve in code-tokens.json's figma`)
  return {
    $value: css,
    ...descriptionAndExtensions,
    $extensions: { ...descriptionAndExtensions.$extensions, [EXTENSION]: { spring } },
  }
}

/**
 * The DTCG type of a variable. Figma numbers carry no unit, so the collection
 * or name says what they measure.
 */
function dtcgType(v) {
  if (v.type === 'COLOR') return 'color'
  if (v.type === 'TIMING') return 'duration'
  if (v.type === 'EASING') return 'cubicBezier'
  // A percentage in Figma. opacity/disabled is in Layout, with the other semantic tokens.
  if (v.collection === 'Opacity' || v.name.startsWith('opacity/')) return 'number'
  if (v.name.startsWith('weight/')) return 'fontWeight'
  return 'dimension' // in px
}

/** A raw Figma value as the DTCG value for its type. */
function dtcgValue(type, value) {
  switch (type) {
    case 'color':
      return dtcgColor(value)
    case 'number':
      return value / 100
    // Figma times in seconds; CSS and Rove's code in ms.
    case 'duration':
      return { value: Math.round(value * 1000), unit: 'ms' }
    case 'cubicBezier': {
      const { x1, y1, x2, y2 } = value.cubicBezier
      return [x1, y1, x2, y2]
    }
    case 'fontWeight':
      return value
    default:
      return px(value)
  }
}

/** A Figma text style as a DTCG typography token; a field bound to a variable is a reference to it. */
function textStyleToken(style) {
  const boundOr = (field, value) => (style.boundVariables[field] ? reference(style.boundVariables[field]) : value)
  const { lineHeight, letterSpacing, fontSize } = style
  if (lineHeight.unit === 'AUTO')
    throw new Error(`DTCG: ${style.name} has an auto line height, which DTCG can't express`)
  return {
    $type: 'typography',
    $value: {
      fontFamily: boundOr('fontFamily', style.fontFamily),
      fontSize: boundOr('fontSize', px(fontSize)),
      fontWeight: boundOr('fontWeight', style.fontWeight),
      // DTCG letter spacing is a dimension (px or rem), so Figma's percent of the size becomes px.
      letterSpacing: boundOr(
        'letterSpacing',
        px(letterSpacing.unit === 'PERCENT' ? round((letterSpacing.value / 100) * fontSize) : letterSpacing.value),
      ),
      // A line height in px becomes a multiple of the size, as a percent does.
      lineHeight: boundOr(
        'lineHeight',
        lineHeight.unit === 'PERCENT' ? round(lineHeight.value / 100) : round(lineHeight.value / fontSize),
      ),
    },
    ...(style.description ? { $description: style.description } : {}),
    // DTCG typography has no text case, so Label/Field's uppercase rides in an extension.
    ...(style.textCase ? { $extensions: { [EXTENSION]: { textCase: style.textCase } } } : {}),
  }
}

/** A code-only token's CSS as DTCG, or null for CSS expressions DTCG can't type. */
function codeToken(name, css, referenceTo) {
  /** The --name in a bare `var(--name)`, or undefined. */
  const referencedCssName = (text) => /^var\((--[\w-]+)\)$/.exec(text)?.[1]
  /** A length in px (or a bare 0) as a DTCG dimension, or null. */
  const dimension = (text) => {
    if (text === '0') return px(0)
    if (/^-?[\d.]+px$/.test(text)) return px(parseFloat(text))
    return null
  }

  if (referencedCssName(css)) return { $value: referenceTo(referencedCssName(css)) }
  if (dimension(css)) return { $type: 'dimension', $value: dimension(css) }

  const duration = /^(\d+)ms$/.exec(css)
  if (duration) return { $type: 'duration', $value: { value: Number(duration[1]), unit: 'ms' } }

  const cubicBezier = /^cubic-bezier\(([^)]+)\)$/.exec(css)
  if (cubicBezier) return { $type: 'cubicBezier', $value: cubicBezier[1].split(',').map(Number) }

  if (name.startsWith('--weight-') && /^\d+$/.test(css)) return { $type: 'fontWeight', $value: Number(css) }

  if (name.startsWith('--shadow-')) {
    // Split at the commas between layers, not those inside a {colour} reference.
    const layers = css.split(/,\s*(?![^{]*\})/).map((layer) => {
      const [x, y, blur, spread, colorName] = /^(\S+) (\S+) (\S+)(?: (\S+))? \{([\w/-]+)\}$/.exec(layer)?.slice(1) ?? []
      if (!colorName) throw new Error(`DTCG: can't read the shadow ${name}: ${layer}`)
      return {
        color: reference(colorName),
        offsetX: dimension(x),
        offsetY: dimension(y),
        blur: dimension(blur),
        spread: dimension(spread ?? '0'),
      }
    })
    return { $type: 'shadow', $value: layers.length === 1 ? layers[0] : layers }
  }

  const border = /^var\((--[\w-]+)\) (solid|dashed|dotted) var\((--[\w-]+)\)$/.exec(css)
  if (border) {
    const [, widthName, style, colorName] = border
    return { $type: 'border', $value: { width: referenceTo(widthName), style, color: referenceTo(colorName) } }
  }
  return null
}

/** Every reference in a theme must point at a token. */
function checkReferences(trees, label) {
  const tokens = new Set()
  const walk = (node, at) => {
    for (const [key, child] of Object.entries(node)) {
      if (key.startsWith('$')) continue
      if ('$value' in child) tokens.add([...at, key].join('.'))
      else walk(child, [...at, key])
    }
  }
  for (const tree of trees) walk(tree, [])
  // Each reference is a whole JSON string, "{a.b}"; slice(2, -2) leaves its path, a.b.
  const references = JSON.stringify(trees).match(/"\{[^}"]+\}"/g) ?? []
  const missing = [...new Set(references.map((quoted) => quoted.slice(2, -2)))].filter((path) => !tokens.has(path))
  if (missing.length) throw new Error(`DTCG ${label}: unresolved references ${missing.join(', ')}`)
}

export async function writeDtcg({ dir, variables, textStyles, code, figmaOverride }) {
  const files = {}
  for (const v of variables) {
    const file = COLLECTIONS[v.collection]
    if (!file) continue // Figma-only collections (Icon tone, Capability level)
    const modes = v.collection === 'Color' ? Object.keys(MODES) : [Object.keys(v.values)[0]]
    for (const mode of modes) {
      const fileName = v.collection === 'Color' ? `${file}.${MODES[mode]}` : file
      placeToken((files[fileName] ??= {}), tokenPath(v.name), figmaToken(v, mode, figmaOverride))
    }
  }

  files['text-styles'] = {}
  for (const style of textStyles) placeToken(files['text-styles'], ['type', slug(style.name)], textStyleToken(style))

  // A code-only token is named as in CSS, without the dashes: --card-padding is card-padding.
  const figmaByCss = new Map(variables.filter((v) => v.code).map((v) => [/--[\w-]+/.exec(v.code)[0], v.name]))
  const referenceTo = (cssName) => {
    if (figmaByCss.has(cssName)) return reference(figmaByCss.get(cssName))
    if (cssName in code.tokens) return `{${cssName.slice(2)}}`
    throw new Error(`DTCG: no token for ${cssName}`)
  }
  files.code = {}
  const cssOnly = []
  for (const [name, css] of Object.entries(code.tokens)) {
    const token = codeToken(name, css, referenceTo)
    if (token) placeToken(files.code, [name.slice(2)], token)
    else if (css.includes('{')) throw new Error(`${name}: a CSS-only token can't pull Figma values in`)
    else cssOnly.push([name, css])
  }

  const filesInEveryTheme = Object.keys(files).filter((f) => !f.startsWith('color.'))
  for (const mode of Object.values(MODES))
    checkReferences(
      [...filesInEveryTheme, `color.${mode}`].map((f) => files[f]),
      mode,
    )

  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
  const written = []
  for (const [name, tree] of Object.entries(files)) {
    await writeFile(resolve(dir, `${name}.tokens.json`), `${JSON.stringify(tree, null, 2)}\n`)
    written.push(`${name}.tokens.json`)
  }
  return { written, cssOnly }
}
