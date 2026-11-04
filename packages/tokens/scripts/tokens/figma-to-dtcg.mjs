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

const path = (figmaName) => figmaName.split('/')
const ref = (figmaName) => `{${path(figmaName).join('.')}}`
const px = (value) => ({ value, unit: 'px' })
const round = (n) => +n.toFixed(4)

/** A Figma colour as a DTCG colour; `hex` drops the alpha, as DTCG asks. */
function color({ r, g, b, a }) {
  return { colorSpace: 'srgb', components: [r, g, b], ...(a < 1 ? { alpha: a } : {}), hex: cssColor([r, g, b]) }
}

/** `'Inter', system-ui, sans-serif` as ['Inter', 'system-ui', 'sans-serif']. */
const fontStack = (css) => css.split(',').map((s) => s.trim().replace(/^'|'$/g, ''))

/** Put a token at a path, refusing a name that is both a token and a group. */
function place(tree, segments, token) {
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

function figmaToken(v, mode, figmaOverride) {
  const value = v.values[mode] ?? Object.values(v.values)[0]
  const description = {
    ...(v.description ? { $description: v.description } : {}),
    ...(v.code ? {} : { $extensions: { [EXTENSION]: { css: false } } }),
  }
  const override = figmaOverride(v, mode)
  if (v.type === 'STRING') {
    if (!v.name.startsWith('font-family/')) throw new Error(`DTCG: no type for the string variable ${v.name}`)
    return { $type: 'fontFamily', $value: override ? fontStack(override) : value, ...description }
  }
  const type = dtcgType(v)
  if (value.alias) return { $type: type, $value: ref(value.alias), ...description }
  return { $type: type, $value: dtcgValue(type, value), ...description }
}

/**
 * The DTCG type of a colour or number variable. Figma numbers carry no unit,
 * so the collection or name says what they measure.
 */
function dtcgType(v) {
  if (v.type === 'COLOR') return 'color'
  if (v.collection === 'Opacity') return 'number' // a percentage in Figma
  if (v.collection === 'Motion') return 'duration' // in ms
  if (v.name.startsWith('weight/')) return 'fontWeight'
  return 'dimension' // in px
}

/** A raw Figma value as the DTCG value for its type. */
function dtcgValue(type, value) {
  switch (type) {
    case 'color':
      return color(value)
    case 'number':
      return value / 100
    case 'duration':
      return { value, unit: 'ms' }
    case 'fontWeight':
      return value
    default:
      return px(value)
  }
}

function textStyleToken(style) {
  const bound = (field, value) => (style.boundVariables[field] ? ref(style.boundVariables[field]) : value)
  const { lineHeight: lh, letterSpacing: ls, fontSize } = style
  if (lh.unit === 'AUTO') throw new Error(`DTCG: ${style.name} has an auto line height, which DTCG can't express`)
  return {
    $type: 'typography',
    $value: {
      fontFamily: bound('fontFamily', style.fontFamily),
      fontSize: bound('fontSize', px(fontSize)),
      fontWeight: bound('fontWeight', style.fontWeight),
      // DTCG letter spacing is a dimension (px or rem), so Figma's percent of the size becomes px.
      letterSpacing: bound('letterSpacing', px(ls.unit === 'PERCENT' ? round((ls.value / 100) * fontSize) : ls.value)),
      lineHeight: bound('lineHeight', lh.unit === 'PERCENT' ? round(lh.value / 100) : round(lh.value / fontSize)),
    },
    ...(style.description ? { $description: style.description } : {}),
    // DTCG typography has no text case, so Overline's uppercase rides in an extension.
    ...(style.textCase ? { $extensions: { [EXTENSION]: { textCase: style.textCase } } } : {}),
  }
}

/** A code-only token's CSS as DTCG, or null for CSS expressions DTCG can't type. */
function codeToken(name, css, refTo) {
  const varRef = (s) => /^var\((--[\w-]+)\)$/.exec(s)?.[1]
  const dim = (s) => (s === '0' ? px(0) : /^-?[\d.]+px$/.test(s) ? px(parseFloat(s)) : null)
  let m
  if (varRef(css)) return { $value: refTo(varRef(css)) }
  if (dim(css)) return { $type: 'dimension', $value: dim(css) }
  if ((m = /^(\d+)ms$/.exec(css))) return { $type: 'duration', $value: { value: Number(m[1]), unit: 'ms' } }
  if ((m = /^cubic-bezier\(([^)]+)\)$/.exec(css))) return { $type: 'cubicBezier', $value: m[1].split(',').map(Number) }
  if (name.startsWith('--weight-') && /^\d+$/.test(css)) return { $type: 'fontWeight', $value: Number(css) }
  if (name.startsWith('--shadow-')) {
    const layers = css.split(/,\s*(?![^{]*\})/).map((layer) => {
      const [x, y, blur, spread, colorRef] = /^(\S+) (\S+) (\S+)(?: (\S+))? \{([\w/-]+)\}$/.exec(layer)?.slice(1) ?? []
      if (!colorRef) throw new Error(`DTCG: can't read the shadow ${name}: ${layer}`)
      return { color: ref(colorRef), offsetX: dim(x), offsetY: dim(y), blur: dim(blur), spread: dim(spread ?? '0') }
    })
    return { $type: 'shadow', $value: layers.length === 1 ? layers[0] : layers }
  }
  if ((m = /^var\((--[\w-]+)\) (solid|dashed|dotted) var\((--[\w-]+)\)$/.exec(css))) {
    return { $type: 'border', $value: { width: refTo(m[1]), style: m[2], color: refTo(m[3]) } }
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
  const refs = JSON.stringify(trees).match(/"\{[^}"]+\}"/g) ?? []
  const missing = [...new Set(refs.map((r) => r.slice(2, -2)))].filter((r) => !tokens.has(r))
  if (missing.length) throw new Error(`DTCG ${label}: unresolved references ${missing.join(', ')}`)
}

export async function writeDtcg({ dir, variables, textStyles, code, figmaOverride }) {
  const files = {}
  for (const v of variables) {
    const file = COLLECTIONS[v.collection]
    if (!file) continue // Figma-only collections (Icon tone, Capability level)
    const modes = v.collection === 'Color' ? Object.keys(MODES) : [Object.keys(v.values)[0]]
    for (const mode of modes) {
      const name = v.collection === 'Color' ? `${file}.${MODES[mode]}` : file
      place((files[name] ??= {}), path(v.name), figmaToken(v, mode, figmaOverride))
    }
  }

  files['text-styles'] = {}
  for (const style of textStyles) place(files['text-styles'], ['type', slug(style.name)], textStyleToken(style))

  // A code-only token is named as in CSS, without the dashes: --card-padding is card-padding.
  const figmaByCss = new Map(variables.filter((v) => v.code).map((v) => [/--[\w-]+/.exec(v.code)[0], v.name]))
  const refTo = (cssName) => {
    if (figmaByCss.has(cssName)) return ref(figmaByCss.get(cssName))
    if (cssName in code.tokens) return `{${cssName.slice(2)}}`
    throw new Error(`DTCG: no token for ${cssName}`)
  }
  files.code = {}
  const cssOnly = []
  for (const [name, css] of Object.entries(code.tokens)) {
    const token = codeToken(name, css, refTo)
    if (token) place(files.code, [name.slice(2)], token)
    else if (css.includes('{')) throw new Error(`${name}: a CSS-only token can't pull Figma values in`)
    else cssOnly.push([name, css])
  }

  const shared = Object.keys(files).filter((f) => !f.startsWith('color.'))
  for (const mode of Object.values(MODES))
    checkReferences(
      [...shared, `color.${mode}`].map((f) => files[f]),
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
