import code from '../tokens/code.tokens.json'
import colorDark from '../tokens/color.dark.tokens.json'
import colorLight from '../tokens/color.light.tokens.json'
import layout from '../tokens/layout.tokens.json'
import motion from '../tokens/motion.tokens.json'
import opacity from '../tokens/opacity.tokens.json'
import palette from '../tokens/palette.tokens.json'
import spacing from '../tokens/spacing.tokens.json'
import textStyles from '../tokens/text-styles.tokens.json'
import typography from '../tokens/typography.tokens.json'

export { palette, colorDark, colorLight, spacing, typography, opacity, layout, motion, textStyles, code }

// Every token in a DTCG tree, in file order, with its path (`['bg', 'base']`).
export function flatten(tree, path = []) {
  return Object.entries(tree).flatMap(([key, node]) => {
    if (key.startsWith('$')) return []
    if ('$value' in node) return [{ ...node, path: [...path, key] }]
    return flatten(node, [...path, key])
  })
}

// The palette and the shadow colours are marked as not CSS variables.
export const isCss = (token) => token.$extensions?.['net.swiftsolve.rove-tokens']?.css !== false

export const cssName = (path) => `--${path.join('-')}`

// A reference in the Figma name's form: `{neutral.850}` is neutral/850.
export const refName = (value) => value.slice(1, -1).replaceAll('.', '/')

// The token's value in the current theme, as tokens.css resolves it. Chrome
// drops a leading zero (`-.02em`); tokens.css writes it.
export const cssValue = (name) =>
  getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
    .replace(/(^|[^\d.])\.(\d)/g, '$10.$2')

// A palette colour as CSS: its hex, or rgb() with its alpha.
export function paletteColor({ components, alpha = 1, hex }) {
  if (alpha === 1) return hex
  const [r, g, b] = components.map((c) => Math.round(c * 255))
  return `rgb(${r} ${g} ${b} / ${Math.round(alpha * 100)}%)`
}

// The tokens under one top-level group, such as `spacing` or `radius`.
export const group = (tree, name) => flatten(tree).filter((token) => token.path[0] === name)

// The pages show Dark and Light side by side, as Figma's frames do, so they
// read each theme from its file rather than from tokens.css.
const THEMES = { dark: colorDark, light: colorLight }
const at = (tree, path) => path.reduce((node, key) => node?.[key], tree)
const refPath = (ref) => ref.slice(1, -1).split('.')

// The palette shade a reference (`{accent.default}`) lands on in one theme.
export function shadeOf(theme, ref) {
  const token = at(THEMES[theme], refPath(ref))
  return token ? shadeOf(theme, token.$value) : at(palette, refPath(ref)).$value
}

// What a colour token points at in one theme, in the Figma name's form.
export const pointsAt = (theme, path) => refName(at(THEMES[theme], path).$value)

// A colour token's CSS colour in one theme: `colorIn('light', 'bg.surface')`.
export const colorIn = (theme, name) => paletteColor(shadeOf(theme, `{${name}}`))

// Whether a theme's tokens point straight at a palette shade.
export const isUsedIn = (theme, shadePath) =>
  flatten(THEMES[theme]).some((token) => token.$value === `{${shadePath.join('.')}}`)

// A shadow token in one theme, as CSS.
export function shadowIn(theme, name) {
  return [code[name].$value]
    .flat()
    .map(({ offsetX, offsetY, blur, spread, color }) => {
      const lengths = [offsetX, offsetY, blur, spread].map((length) => `${length.value}px`).join(' ')
      return `${lengths} ${paletteColor(shadeOf(theme, color))}`
    })
    .join(', ')
}
