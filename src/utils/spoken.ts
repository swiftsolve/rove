/**
 * A label as a screen reader should say it: a bracketed part becomes a pause
 * and a slash becomes "or", so neither is read out as a symbol.
 * "36 (80 MHz)" → "36, 80 MHz", "WPA/WPA2" → "WPA or WPA2". For labels and
 * values, never an address, whose slashes are part of it.
 */
export function spokenText(text: string): string {
  return text.replace(/\s*\(([^()]*)\)/g, ', $1').replace(/\s*\/\s*/g, ' or ')
}
