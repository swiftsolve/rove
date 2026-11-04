/**
 * Helpers more than one build step needs, so every file writes a colour or
 * names a text style the same way.
 */

/** The `$extensions` key this package's own token metadata sits under. */
export const EXTENSION = 'net.swiftsolve.rove-tokens'

/** A 0–1 channel as two hex digits. */
const hexByte = (n) =>
  Math.round(n * 255)
    .toString(16)
    .padStart(2, '0')

/** An sRGB colour (channels 0–1) as CSS: `#rrggbb` when opaque, else `rgba()`. */
export function cssColor([r, g, b], alpha = 1) {
  if (alpha >= 1) return `#${hexByte(r)}${hexByte(g)}${hexByte(b)}`
  const channels = [r, g, b].map((n) => Math.round(n * 255))
  return `rgba(${channels.join(', ')}, ${+alpha.toFixed(3)})`
}

/** A Figma text style's name as a class or token slug: `Heading/Large` is `heading-large`. */
export const slug = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
