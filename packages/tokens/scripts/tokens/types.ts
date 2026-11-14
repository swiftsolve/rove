/**
 * The shapes the build reads and writes: the Figma plugin's three exports in
 * src/figma/, src/code-tokens.json, and the DTCG token files in dist/tokens/.
 * figma-plugin/code.js writes the exports; these types are what the build
 * expects of them.
 */

// ── The Figma export (src/figma/*.json) ────────────────────────────────────

/** The Figma file an export came from. */
export type FigmaFile = { name: string; key: string }

/** An sRGB colour, each channel 0–1. */
export type FigmaColor = { r: number; g: number; b: number; a: number }

/** A spring easing: Figma's bounce, 0 to below 1. */
export type FigmaSpring = { bounce: number }

/** An easing variable's value: a cubic Bézier, or a spring. */
export type FigmaEasing = {
  type: string
  cubicBezier?: { x1: number; y1: number; x2: number; y2: number }
  spring?: FigmaSpring
}

/** A variable's value in one mode: a raw value, or a pointer at another variable. */
export type FigmaValue = number | string | FigmaColor | FigmaEasing | { alias: string }

export type FigmaVariable = {
  /** `bg/base`. */
  name: string
  /** The collection it sits in: `Color`, `Spacing`, `Palette`… */
  collection: string
  type: 'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN' | 'TIMING' | 'EASING'
  /** Its Web code syntax, `var(--bg-base)`; absent for a variable that isn't a CSS variable. */
  code?: string
  description?: string
  scopes: string[]
  /** Its value in each mode, by mode name. */
  values: Record<string, FigmaValue>
}

export type FigmaVariables = {
  file: FigmaFile
  collections: { name: string; modes: string[] }[]
  variables: FigmaVariable[]
}

/** A Figma length with its unit: `{ unit: 'PIXELS', value: 24 }`. */
export type FigmaLength = { unit: 'PIXELS' | 'PERCENT' | 'AUTO'; value: number }

export type FigmaTextStyle = {
  /** `Heading/Large`. */
  name: string
  description?: string
  fontFamily: string
  fontStyle: string
  fontWeight: number
  fontSize: number
  lineHeight: FigmaLength
  letterSpacing: FigmaLength
  /** `UPPER`, `LOWER` or `TITLE`; absent when the style keeps the text's case. */
  textCase?: string
  /** The variable bound to each field, by field: `{ fontSize: 'font-size/2xl' }`. */
  boundVariables: Record<string, string>
}

export type FigmaTextStyles = { file: FigmaFile; styles: FigmaTextStyle[] }

/** One layer of a shadow; `color` names the colour variable bound to it. */
export type FigmaShadowLayer = { x: number; y: number; blur: number; spread: number; color: string | FigmaColor }

export type FigmaEffectStyle = { name: string; description?: string; layers: FigmaShadowLayer[] }

export type FigmaEffectStyles = { file: FigmaFile; styles: FigmaEffectStyle[] }

/** src/code-tokens.json: what Figma can't hold. */
export type CodeTokens = {
  description: string
  /** How a Figma variable is written in CSS, by its Figma name; `{figma/name}` pulls a value in. */
  figma: Record<string, string>
  /** Code-only CSS variables, by `--name`. */
  tokens: Record<string, string>
}

// ── DTCG (dist/tokens/*.tokens.json) ───────────────────────────────────────

export type DtcgToken = {
  $type?: string
  $value: unknown
  $description?: string
  $extensions?: Record<string, Record<string, unknown>>
}

/** A group of tokens and groups, by key. */
export type DtcgTree = { [key: string]: DtcgTree | DtcgToken }

export const isToken = (node: DtcgTree | DtcgToken): node is DtcgToken => '$value' in node
