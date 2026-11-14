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

import { cssColor, EXTENSION, slug } from './shared.ts'
import type {
  DtcgToken,
  DtcgTree,
  FigmaColor,
  FigmaEasing,
  FigmaSpring,
  FigmaTextStyle,
  FigmaValue,
  FigmaVariable,
} from './types.ts'
import { isToken } from './types.ts'

/** code-tokens.json's CSS for a Figma variable in a mode, if it sets one. */
export type FigmaOverride = (variable: FigmaVariable, mode: string) => string | undefined

const COLLECTIONS: Record<string, string> = {
  Palette: 'palette',
  Color: 'color',
  Spacing: 'spacing',
  Typography: 'typography',
  Opacity: 'opacity',
  Layout: 'layout',
  Motion: 'motion',
}
const MODES: Record<string, string> = { Dark: 'dark', Light: 'light' }

const tokenPath = (figmaName: string) => figmaName.split('/')
const reference = (figmaName: string) => `{${tokenPath(figmaName).join('.')}}`
const px = (value: number) => ({ value, unit: 'px' })
const round = (n: number) => +n.toFixed(4)

/** A Figma colour as a DTCG colour; `hex` drops the alpha, as DTCG asks. */
function dtcgColor({ r, g, b, a }: FigmaColor) {
  return { colorSpace: 'srgb', components: [r, g, b], ...(a < 1 ? { alpha: a } : {}), hex: cssColor([r, g, b]) }
}

/** `'Inter', system-ui, sans-serif` as ['Inter', 'system-ui', 'sans-serif']. */
const fontStack = (css: string) => css.split(',').map((s) => s.trim().replace(/^'|'$/g, ''))

/** Put a token at a path, refusing a name that is both a token and a group. */
function placeToken(tree: DtcgTree, segments: string[], token: DtcgToken) {
  let node = tree
  for (const [i, key] of segments.entries()) {
    if (i === segments.length - 1) {
      if (node[key]) throw new Error(`DTCG: ${segments.join('.')} is defined twice`)
      node[key] = token
    } else {
      const child = (node[key] ??= {})
      if (isToken(child)) throw new Error(`DTCG: ${segments.slice(0, i + 1).join('.')} is both a token and a group`)
      node = child
    }
  }
}

/** A variable's value in a mode, or in its only mode for a single-mode collection. */
export function valueInMode(variable: FigmaVariable, mode: string): FigmaValue {
  const value = variable.values[mode] ?? Object.values(variable.values)[0]
  if (value === undefined) throw new Error(`${variable.name} has no value`)
  return value
}

/** The variable a value points at, if it's an alias. */
export const aliasOf = (value: FigmaValue): string | undefined =>
  typeof value === 'object' && 'alias' in value ? value.alias : undefined

/** A Figma variable's value in a mode as a DTCG token; `figmaOverride` gives code-tokens.json's value, if any. */
function figmaToken(v: FigmaVariable, mode: string, figmaOverride: FigmaOverride): DtcgToken {
  const value = valueInMode(v, mode)
  const descriptionAndExtensions: Omit<DtcgToken, '$value'> = {
    ...(v.description ? { $description: v.description } : {}),
    ...(v.code ? {} : { $extensions: { [EXTENSION]: { css: false } } }),
  }
  const override = figmaOverride(v, mode)
  if (v.type === 'STRING') {
    if (!v.name.startsWith('font-family/')) throw new Error(`DTCG: no type for the string variable ${v.name}`)
    return { $type: 'fontFamily', $value: override ? fontStack(override) : value, ...descriptionAndExtensions }
  }
  const easing = value as FigmaEasing
  if (v.type === 'EASING' && easing.spring) return springToken(v, easing.spring, descriptionAndExtensions)
  const type = dtcgType(v)
  const alias = aliasOf(value)
  if (alias) return { $type: type, $value: reference(alias), ...descriptionAndExtensions }
  return { $type: type, $value: dtcgValue(type, value), ...descriptionAndExtensions }
}

/**
 * A spring easing. DTCG has no spring type and CSS no spring curve, so its CSS
 * is the spring drawn as a `linear()` curve, untyped, and the bounce rides in
 * an extension.
 */
function springToken(
  v: FigmaVariable,
  spring: FigmaSpring,
  descriptionAndExtensions: Omit<DtcgToken, '$value'>,
): DtcgToken {
  return {
    $value: springCurve(v.name, spring.bounce),
    ...descriptionAndExtensions,
    $extensions: { ...descriptionAndExtensions.$extensions, [EXTENSION]: { spring } },
  }
}

/** Where the spring counts as settled: this close to its end, as a share of the travel. */
const SPRING_SETTLED = 0.0001
/** Points along the curve; at a 450ms run, one every 32ms. */
const SPRING_STOPS = 15

/**
 * A Figma spring as a CSS `linear()` curve over the token's whole duration.
 *
 * Figma's bounce is 1 minus the damping ratio (its physicalSpringToNormalized
 * gives 0.15 for a ratio of 0.85). Figma doesn't say how fast the spring moves
 * within a duration, so it runs the whole duration and settles at its end:
 * its swing shrinks to SPRING_SETTLED of the travel by the last stop.
 */
function springCurve(name: string, bounce: number) {
  // A bounce of 1 is an undamped spring, which never settles.
  if (!(bounce >= 0 && bounce < 1))
    throw new Error(`${name}: a spring's bounce must be from 0 to below 1, not ${bounce}`)
  const dampingRatio = 1 - bounce
  // The swing shrinks as e^(-dampingRatio × naturalFrequency × time), with time
  // from 0 to 1 over the duration, so this frequency brings it to SPRING_SETTLED at 1.
  const naturalFrequency = Math.log(1 / SPRING_SETTLED) / dampingRatio
  const decayRate = dampingRatio * naturalFrequency

  /** How far along the spring is at `time` (0 to 1): 0 at the start, settling on 1. */
  const progressAt = (time: number) => {
    const decay = Math.exp(-decayRate * time)
    if (dampingRatio === 1) return 1 - decay * (1 + naturalFrequency * time)
    const swingFrequency = naturalFrequency * Math.sqrt(1 - dampingRatio ** 2)
    const swing = Math.cos(swingFrequency * time) + (decayRate / swingFrequency) * Math.sin(swingFrequency * time)
    return 1 - decay * swing
  }

  const stops: number[] = []
  for (let i = 0; i < SPRING_STOPS; i++) stops.push(round(progressAt(i / (SPRING_STOPS - 1))))
  // It ends exactly at rest.
  stops[SPRING_STOPS - 1] = 1
  return `linear(${stops.join(', ')})`
}

/**
 * The DTCG type of a variable. Figma numbers carry no unit, so the collection
 * or name says what they measure.
 */
function dtcgType(v: FigmaVariable) {
  if (v.type === 'COLOR') return 'color'
  if (v.type === 'TIMING') return 'duration'
  if (v.type === 'EASING') return 'cubicBezier'
  // A percentage in Figma. opacity/disabled is in Layout, with the other semantic tokens.
  if (v.collection === 'Opacity' || v.name.startsWith('opacity/')) return 'number'
  if (v.name.startsWith('weight/')) return 'fontWeight'
  return 'dimension' // in px
}

/** A raw Figma value as the DTCG value for its type. */
function dtcgValue(type: string, value: FigmaValue) {
  switch (type) {
    case 'color':
      return dtcgColor(value as FigmaColor)
    case 'number':
      return (value as number) / 100
    // Figma times in seconds; CSS and Rove's code in ms.
    case 'duration':
      return { value: Math.round((value as number) * 1000), unit: 'ms' }
    case 'cubicBezier': {
      const bezier = (value as FigmaEasing).cubicBezier
      if (!bezier) throw new Error(`DTCG: an easing with no curve: ${JSON.stringify(value)}`)
      return [bezier.x1, bezier.y1, bezier.x2, bezier.y2]
    }
    case 'fontWeight':
      return value
    default:
      return px(value as number)
  }
}

/** A Figma text style as a DTCG typography token; a field bound to a variable is a reference to it. */
function textStyleToken(style: FigmaTextStyle): DtcgToken {
  const boundOr = (field: string, value: unknown) => {
    const boundVariable = style.boundVariables[field]
    return boundVariable ? reference(boundVariable) : value
  }
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
function codeToken(name: string, css: string, referenceTo: (cssName: string) => string): DtcgToken | null {
  /** The --name in a bare `var(--name)`, or undefined. */
  const referencedCssName = (text: string) => /^var\((--[\w-]+)\)$/.exec(text)?.[1]
  /** A length in px (or a bare 0) as a DTCG dimension, or null. */
  const dimension = (text: string) => {
    if (text === '0') return px(0)
    if (/^-?[\d.]+px$/.test(text)) return px(parseFloat(text))
    return null
  }

  const referencedName = referencedCssName(css)
  if (referencedName) return { $value: referenceTo(referencedName) }
  const cssDimension = dimension(css)
  if (cssDimension) return { $type: 'dimension', $value: cssDimension }

  const duration = /^(\d+)ms$/.exec(css)
  if (duration) return { $type: 'duration', $value: { value: Number(duration[1]), unit: 'ms' } }

  const cubicBezier = /^cubic-bezier\(([^)]+)\)$/.exec(css)
  if (cubicBezier?.[1]) return { $type: 'cubicBezier', $value: cubicBezier[1].split(',').map(Number) }

  if (name.startsWith('--weight-') && /^\d+$/.test(css)) return { $type: 'fontWeight', $value: Number(css) }

  if (name.startsWith('--shadow-')) {
    // Split at the commas between layers, not those inside a {colour} reference.
    const layers = css.split(/,\s*(?![^{]*\})/).map((layer) => {
      const [x, y, blur, spread, colorName] = /^(\S+) (\S+) (\S+)(?: (\S+))? \{([\w/-]+)\}$/.exec(layer)?.slice(1) ?? []
      if (!x || !y || !blur || !colorName) throw new Error(`DTCG: can't read the shadow ${name}: ${layer}`)
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
    const [, widthName = '', style, colorName = ''] = border
    return { $type: 'border', $value: { width: referenceTo(widthName), style, color: referenceTo(colorName) } }
  }
  return null
}

/** Every reference in a theme must point at a token. */
function checkReferences(trees: DtcgTree[], label: string) {
  const tokens = new Set<string>()
  const walk = (node: DtcgTree, at: string[]) => {
    for (const [key, child] of Object.entries(node)) {
      if (key.startsWith('$')) continue
      if (isToken(child)) tokens.add([...at, key].join('.'))
      else walk(child, [...at, key])
    }
  }
  for (const tree of trees) walk(tree, [])
  // Each reference is a whole JSON string, "{a.b}"; slice(2, -2) leaves its path, a.b.
  const references = JSON.stringify(trees).match(/"\{[^}"]+\}"/g) ?? []
  const missing = [...new Set(references.map((quoted) => quoted.slice(2, -2)))].filter((path) => !tokens.has(path))
  if (missing.length) throw new Error(`DTCG ${label}: unresolved references ${missing.join(', ')}`)
}

type WriteDtcgOptions = {
  dir: string
  variables: FigmaVariable[]
  textStyles: FigmaTextStyle[]
  /** The code-only tokens, by `--name`, shadows included. */
  codeTokens: Record<string, string>
  figmaOverride: FigmaOverride
}

export async function writeDtcg({ dir, variables, textStyles, codeTokens, figmaOverride }: WriteDtcgOptions) {
  const files: Record<string, DtcgTree> = {}
  for (const v of variables) {
    const file = COLLECTIONS[v.collection]
    if (!file) continue // Figma-only collections (Icon tone, Capability level)
    const modes = v.collection === 'Color' ? Object.keys(MODES) : Object.keys(v.values).slice(0, 1)
    for (const mode of modes) {
      const fileName = v.collection === 'Color' ? `${file}.${MODES[mode]}` : file
      placeToken((files[fileName] ??= {}), tokenPath(v.name), figmaToken(v, mode, figmaOverride))
    }
  }

  const textStyleTree: DtcgTree = (files['text-styles'] = {})
  for (const style of textStyles) placeToken(textStyleTree, ['type', slug(style.name)], textStyleToken(style))

  // A code-only token is named as in CSS, without the dashes: --card-padding is card-padding.
  const figmaByCss = new Map<string, string>()
  for (const v of variables) {
    const cssName = v.code && /--[\w-]+/.exec(v.code)?.[0]
    if (cssName) figmaByCss.set(cssName, v.name)
  }
  const referenceTo = (cssName: string) => {
    const figmaName = figmaByCss.get(cssName)
    if (figmaName) return reference(figmaName)
    if (cssName in codeTokens) return `{${cssName.slice(2)}}`
    throw new Error(`DTCG: no token for ${cssName}`)
  }
  const codeTree: DtcgTree = (files.code = {})
  const cssOnly: [string, string][] = []
  for (const [name, css] of Object.entries(codeTokens)) {
    const token = codeToken(name, css, referenceTo)
    if (token) placeToken(codeTree, [name.slice(2)], token)
    else if (css.includes('{')) throw new Error(`${name}: a CSS-only token can't pull Figma values in`)
    else cssOnly.push([name, css])
  }

  const filesInEveryTheme = Object.keys(files).filter((f) => !f.startsWith('color.'))
  for (const mode of Object.values(MODES))
    checkReferences(
      [...filesInEveryTheme, `color.${mode}`].map((f) => files[f] ?? {}),
      mode,
    )

  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
  const written: string[] = []
  for (const [name, tree] of Object.entries(files)) {
    await writeFile(resolve(dir, `${name}.tokens.json`), `${JSON.stringify(tree, null, 2)}\n`)
    written.push(`${name}.tokens.json`)
  }
  return { written, cssOnly }
}
