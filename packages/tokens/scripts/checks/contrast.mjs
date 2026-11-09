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
 *   npm run build && node scripts/checks/contrast.mjs
 */
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const css = await readFile(resolve(ROOT, 'dist/tokens.css'), 'utf8')

// The minimum contrast ratios.
const WORDS = 4.5
const GRAPHICS = 3

const ruleBody = (selector) => {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`dist/tokens.css has no ${selector} block: run npm run build`)
  return css.slice(start, css.indexOf('\n}', start))
}
const declarations = (text) =>
  Object.fromEntries([...text.matchAll(/^\s*--([\w-]+):\s*([^;]+);/gm)].map(([, name, value]) => [name, value.trim()]))
const dark = declarations(ruleBody(':root'))
const THEMES = { Dark: dark, Light: { ...dark, ...declarations(ruleBody(':root.theme-light')) } }

/** A token's colour as [r, g, b, a], r g b 0–255, following var() references. */
function colour(theme, name) {
  let value = theme[name]
  for (let match; (match = /^var\(--([\w-]+)\)$/.exec(value));) value = theme[match[1]]
  const hex = /^#([0-9a-f]{6})$/i.exec(value ?? '')
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).concat(1)
  const rgba = /^rgba?\(([^)]+)\)$/.exec(value ?? '')
  // rgb() has no alpha, so add 1 and keep the first four: rgba() keeps its own.
  if (rgba) return rgba[1].split(',').map(Number).concat(1).slice(0, 4)
  throw new Error(`--${name} isn't a colour this check reads: ${value}`)
}
/** A see-through colour laid over an opaque one, as the opaque colour it shows. */
const over = ([r, g, b, a], below) => [r, g, b].map((c, i) => c * a + below[i] * (1 - a)).concat(1)
const withAlpha = ([r, g, b], a) => [r, g, b, a]
/** WCAG's relative luminance. */
const luminance = (rgb) =>
  rgb
    .slice(0, 3)
    .map((c) => c / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0)
/** WCAG's contrast ratio, lighter over darker. */
const contrastRatio = (a, b) => {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (lighter + 0.05) / (darker + 0.05)
}

// What text and graphics sit on: the five opaque backgrounds, and a hovered row
// (the hover overlay on a card and on the backdrop).
const BACKGROUNDS = {
  'bg-base': (t) => colour(t, 'bg-base'),
  'bg-surface': (t) => colour(t, 'bg-surface'),
  'bg-inset': (t) => colour(t, 'bg-inset'),
  'bg-popover': (t) => colour(t, 'bg-popover'),
  'bg-chrome': (t) => colour(t, 'bg-chrome'),
  'overlay-hover on bg-surface': (t) => over(colour(t, 'overlay-hover'), colour(t, 'bg-surface')),
  'overlay-hover on bg-base': (t) => over(colour(t, 'overlay-hover'), colour(t, 'bg-base')),
}
const HOVER = { 'bg-hover': (t) => colour(t, 'bg-hover') }
// Each background is a function of the theme, giving its opaque colour.
const tintOf = (name, below) => (t) =>
  over(withAlpha(colour(t, name), parseFloat(t['opacity-tint-md']) / 100), colour(t, below))
const onTint = (name) => ({
  [`${name} tint on bg-base`]: tintOf(name, 'bg-base'),
  [`${name} tint on bg-surface`]: tintOf(name, 'bg-surface'),
})
const solid = (name) => ({ [name]: (t) => colour(t, name) })

const STATUSES = ['positive', 'good', 'warning', 'poor', 'negative']
const DEVICE_GROUPS = ['network', 'personal', 'entertainment', 'smart-home']
const PAIRS = [
  // Words. A hovered control turns its label --text-primary, so --text-tertiary
  // meets --bg-hover only as an icon, below.
  ...['text-primary', 'text-secondary'].map((fg) => [fg, { ...BACKGROUNDS, ...HOVER }, WORDS]),
  ['text-tertiary', BACKGROUNDS, WORDS],
  [
    'text-accent',
    {
      ...BACKGROUNDS,
      ...HOVER,
      'accent-muted on bg-surface': (t) => over(colour(t, 'accent-muted'), colour(t, 'bg-surface')),
      'accent-muted on bg-base': (t) => over(colour(t, 'accent-muted'), colour(t, 'bg-base')),
    },
    WORDS,
  ],
  // Status words, also on a badge: a tint of their own hue.
  ...STATUSES.map((s) => [`text-${s}`, { ...BACKGROUNDS, ...HOVER, ...onTint(`status-${s}`) }, WORDS]),
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
  ...STATUSES.map((s) => [`status-${s}`, { ...BACKGROUNDS, ...HOVER, ...onTint(`status-${s}`) }, GRAPHICS]),
  // Device icons, on their own tile's tint as well.
  ...DEVICE_GROUPS.map((g) => [`device-${g}`, { ...BACKGROUNDS, ...HOVER, ...onTint(`device-${g}`) }, GRAPHICS]),
  ...['accent-default', 'accent-hover', 'accent-press', 'series-down', 'series-up', 'focus-ring'].map((fg) => [
    fg,
    { ...BACKGROUNDS, ...HOVER },
    GRAPHICS,
  ]),
]

const failures = []
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
