/**
 * Check the colours meet WCAG 2.2 AA in both themes, on what they sit on, as
 * README's Contrast section promises: words 4.5:1 (1.4.3), icons, bars, dots
 * and lines 3:1 (1.4.11).
 *
 * Each pair below is a placement DESIGN.md allows: a text token on every
 * background and on the tint it's used on, a status or accent shade as a
 * graphic, a label on a solid. A see-through background (an overlay, a tint)
 * is laid over the backdrop it sits on before measuring. The values are read
 * from the built tokens.css, so run the build first.
 *
 * A pair that fails is fixed in Figma, not here: darken the foreground's shade
 * (docs/rationale.md, Text and Status, says how the others were picked), export
 * and build.
 *
 *   npm run build && node scripts/checks/contrast.ts
 */
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** A colour as [r, g, b, a]: r, g and b 0–255, a 0–1. */
type Rgba = [number, number, number, number]
/** A theme's declarations, by name without --. */
type Theme = Record<string, string>
/** A background's opaque colour in a theme. */
type Backgrounds = Record<string, (theme: Theme) => Rgba>

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const css = await readFile(resolve(ROOT, 'dist/tokens.css'), 'utf8')

// The minimum contrast ratios.
const WORDS = 4.5
const GRAPHICS = 3

const ruleBody = (selector: string) => {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`dist/tokens.css has no ${selector} block: run npm run build`)
  return css.slice(start, css.indexOf('\n}', start))
}
const declarations = (text: string): Theme =>
  Object.fromEntries(
    [...text.matchAll(/^\s*--([\w-]+):\s*([^;]+);/gm)].map(([, name = '', value = '']) => [name, value.trim()]),
  )
const dark = declarations(ruleBody(':root'))
const THEMES: Record<string, Theme> = { Dark: dark, Light: { ...dark, ...declarations(ruleBody(':root.theme-light')) } }

/** A token's colour as [r, g, b, a], r g b 0–255, following var() references. */
function colour(theme: Theme, name: string): Rgba {
  let value = theme[name]
  for (let match; (match = /^var\(--([\w-]+)\)$/.exec(value ?? ''));) value = theme[match[1] ?? '']
  const hex = /^#([0-9a-f]{6})$/i.exec(value ?? '')?.[1]
  const hexChannel = (start: number) => parseInt(hex?.slice(start, start + 2) ?? '', 16)
  if (hex) return [hexChannel(0), hexChannel(2), hexChannel(4), 1]
  const rgba = /^rgba?\(([^)]+)\)$/.exec(value ?? '')?.[1]
  // rgb() has no alpha, so it's 1: rgba() keeps its own.
  if (rgba) {
    const [r = 0, g = 0, b = 0, a = 1] = rgba.split(',').map(Number)
    return [r, g, b, a]
  }
  throw new Error(`--${name} isn't a colour this check reads: ${value}`)
}
/** A see-through colour laid over an opaque one, as the opaque colour it shows. */
const over = ([r, g, b, a]: Rgba, below: Rgba): Rgba => [
  r * a + below[0] * (1 - a),
  g * a + below[1] * (1 - a),
  b * a + below[2] * (1 - a),
  1,
]
const withAlpha = ([r, g, b]: Rgba, a: number): Rgba => [r, g, b, a]
/** WCAG's relative luminance. */
const LUMINANCE_WEIGHTS = [0.2126, 0.7152, 0.0722]
const luminance = (rgb: Rgba) =>
  rgb
    .slice(0, 3)
    .map((c) => c / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((sum, c, i) => sum + c * (LUMINANCE_WEIGHTS[i] ?? 0), 0)
/** WCAG's contrast ratio, lighter over darker. */
const contrastRatio = (a: Rgba, b: Rgba) => {
  const [lighter = 0, darker = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (lighter + 0.05) / (darker + 0.05)
}

// What text and graphics sit on: the five opaque backgrounds, and a hovered row
// (the hover overlay on a card and on the backdrop).
const BACKGROUNDS: Backgrounds = {
  'bg-base': (t: Theme) => colour(t, 'bg-base'),
  'bg-surface': (t: Theme) => colour(t, 'bg-surface'),
  'bg-inset': (t: Theme) => colour(t, 'bg-inset'),
  'bg-popover': (t: Theme) => colour(t, 'bg-popover'),
  'bg-chrome': (t: Theme) => colour(t, 'bg-chrome'),
  'overlay-hover on bg-surface': (t: Theme) => over(colour(t, 'overlay-hover'), colour(t, 'bg-surface')),
  'overlay-hover on bg-base': (t: Theme) => over(colour(t, 'overlay-hover'), colour(t, 'bg-base')),
}
const HOVER: Backgrounds = { 'bg-hover': (t: Theme) => colour(t, 'bg-hover') }
// Each background is a function of the theme, giving its opaque colour.
const tintOf = (name: string, below: string) => (t: Theme) =>
  over(withAlpha(colour(t, name), parseFloat(t['opacity-tint-md'] ?? '') / 100), colour(t, below))
const onTint = (name: string): Backgrounds => ({
  [`${name} tint on bg-base`]: tintOf(name, 'bg-base'),
  [`${name} tint on bg-surface`]: tintOf(name, 'bg-surface'),
})
const solid = (name: string): Backgrounds => ({ [name]: (t: Theme) => colour(t, name) })

const STATUSES = ['positive', 'good', 'warning', 'poor', 'negative']
const DEVICE_GROUPS = ['network', 'personal', 'entertainment', 'smart-home']
/** A foreground, every background it sits on, and the ratio it must clear. */
type Pair = [foreground: string, backgrounds: Backgrounds, minimum: number]
const PAIRS: Pair[] = [
  // Words. A hovered control turns its label --text-primary, so --text-tertiary
  // meets --bg-hover only as an icon, below.
  ...['text-primary', 'text-secondary'].map((fg): Pair => [fg, { ...BACKGROUNDS, ...HOVER }, WORDS]),
  ['text-tertiary', BACKGROUNDS, WORDS],
  [
    'text-accent',
    {
      ...BACKGROUNDS,
      ...HOVER,
      'accent-muted on bg-surface': (t: Theme) => over(colour(t, 'accent-muted'), colour(t, 'bg-surface')),
      'accent-muted on bg-base': (t: Theme) => over(colour(t, 'accent-muted'), colour(t, 'bg-base')),
    },
    WORDS,
  ],
  // Status words, also on a badge: a tint of their own hue.
  ...STATUSES.map((s): Pair => [`text-${s}`, { ...BACKGROUNDS, ...HOVER, ...onTint(`status-${s}`) }, WORDS]),
  // Labels and icons on solids, resting and hovered.
  [
    'text-on-solid',
    {
      ...solid('accent-solid'),
      ...solid('accent-solid-hover'),
      ...solid('status-negative-solid'),
      ...solid('status-negative-solid-hover'),
    },
    WORDS,
  ],
  // Graphics: icons, bars, dots, chart lines and the focus ring.
  ['text-tertiary', HOVER, GRAPHICS],
  ...STATUSES.map((s): Pair => [`status-${s}`, { ...BACKGROUNDS, ...HOVER, ...onTint(`status-${s}`) }, GRAPHICS]),
  // Device icons, on their own tile's tint as well.
  ...DEVICE_GROUPS.map((g): Pair => [`device-${g}`, { ...BACKGROUNDS, ...HOVER, ...onTint(`device-${g}`) }, GRAPHICS]),
  ...['accent-default', 'accent-hover', 'accent-press', 'series-down', 'series-up', 'focus-ring'].map((fg): Pair => [
    fg,
    { ...BACKGROUNDS, ...HOVER },
    GRAPHICS,
  ]),
]

const failures: string[] = []
let checked = 0
for (const [themeName, theme] of Object.entries(THEMES)) {
  for (const [fg, backgrounds, minimum] of PAIRS) {
    for (const [bgName, background] of Object.entries(backgrounds)) {
      checked++
      const bg = background(theme)
      const ratio = contrastRatio(over(colour(theme, fg), bg), bg)
      // `overlay-hover on bg-base` reads `--overlay-hover on --bg-base`.
      const bgTokens = bgName
        .split(' on ')
        .map((part) => `--${part}`)
        .join(' on ')
      if (ratio < minimum)
        failures.push(`${themeName}: --${fg} on ${bgTokens} is ${ratio.toFixed(2)}:1, under ${minimum}:1`)
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'))
  console.error(
    `\n${failures.length} pair${failures.length === 1 ? '' : 's'} under WCAG AA. Darken the foreground's shade in ` +
      'Figma (docs/rationale.md, Text and Status), then export and build.',
  )
  process.exit(1)
}
console.log(`Contrast OK (${checked} pairs, Dark and Light)`)
