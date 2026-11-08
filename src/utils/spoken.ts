/** A bracketed part with the space before it; its text is the capture. */
const BRACKETED_PART = /\s*\(([^()]*)\)/g
/** A slash with any space around it. */
const SLASH = /\s*\/\s*/g

/**
 * A label as a screen reader should say it: a bracketed part becomes a pause
 * and a slash becomes "or", so neither is read out as a symbol.
 * "36 (80 MHz)" → "36, 80 MHz", "WPA/WPA2" → "WPA or WPA2". For labels and
 * values, never an address, whose slashes are part of it.
 */
export function spokenText(text: string): string {
  return text.replace(BRACKETED_PART, ', $1').replace(SLASH, ' or ')
}
