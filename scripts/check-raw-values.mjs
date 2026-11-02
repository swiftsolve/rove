/**
 * Check src/ for raw values where a design token belongs:
 *
 *   - colours: every colour is a token, so no hex, `rgb()`/`hsl()`/`oklch()`…
 *     or `white`/`black` in a class, a style or a stylesheet;
 *   - easings: every curve is a token, so no `cubic-bezier()`, and no keyword
 *     easing (`ease-in-out`) inside an arbitrary value or a stylesheet (the
 *     `ease-out` utility is the token and stays);
 *   - a length, weight or duration that equals a token on its scale: `p-[12px]`
 *     is `p-12`, `rounded-[8px]` is `rounded-sm`, `text-[13px]` is `text-md`,
 *     `duration-[140ms]` is `duration-(--duration-fast)`, and the same in CSS.
 *
 * Values off the token scales (`size-[28px]`, `leading-[1.2]`, a 2.4s pulse)
 * aren't flagged: the system has no token for them. The token values are read
 * from @swiftsolve/rove-design, so a token update moves the rules with it.
 *
 * A raw value that has to stay goes in ALLOWED with its reason. Dev mocks
 * (src/dev), tests and assets aren't checked.
 *
 *   node scripts/check-raw-values.mjs
 */
import { readFile, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src')
const SKIPPED = [join(SRC, 'assets'), join(SRC, 'dev')]
const TOKENS_CSS = createRequire(import.meta.url).resolve('@swiftsolve/rove-design/tokens.css')

/** Raw values that stay, by file and the exact text flagged. */
const ALLOWED = [
  // A scanner needs dark modules on white in both themes.
  { file: 'src/features/connection/WifiShareDialog.tsx', value: '#ffffff' },
  // The brand icon's gradient, the same as the app icon's.
  { file: 'src/ui/icons/BrandIcon.tsx', value: '#7aa4ff' },
  { file: 'src/ui/icons/BrandIcon.tsx', value: '#5484f5' },
  // The About tile redraws the dock icon, which looks the same in both themes.
  { file: 'src/features/about/AboutView.tsx', value: 'rgba(' },
  { file: 'src/features/about/AboutView.tsx', value: '#1f2125' },
  { file: 'src/features/about/AboutView.tsx', value: '#16171a' },
  // The theme swap's circular reveal, tuned on its own.
  { file: 'src/app/utils/theme-transition.ts', value: 'cubic-bezier(' },
  // A mask reads only alpha, so its colour is no design choice.
  { file: 'src/ui/empty-state/EmptyState.tsx', value: '#000' },
  // StatusDot's breathing pulses want a symmetric curve, and no easing token is one.
  { file: 'src/styles/tailwind.css', value: 'ease-in-out' },
]

async function listFiles(dir) {
  if (SKIPPED.includes(dir)) return []
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? listFiles(path) : [path]
  }))
  return nested.flat()
}

/** Each `--name: value` the tokens define, plain values only (not `var()`). */
async function readTokens() {
  const css = await readFile(TOKENS_CSS, 'utf8')
  const tokens = new Map()
  for (const [, name, value] of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    if (!value.includes('var(') && !tokens.has(name)) tokens.set(name, value.trim())
  }
  return tokens
}

/** A scale's tokens by value: `{ '12px': '--spacing-12' }`. */
function scale(tokens, prefix) {
  const byValue = new Map()
  for (const [name, value] of tokens) if (name.startsWith(prefix)) byValue.set(value, name)
  return byValue
}

/** Blank out comments, keeping line numbers. `//` after a `:` is a URL, not a comment. */
function stripComments(code, isCss) {
  const blank = (text) => text.replace(/[^\n]/g, ' ')
  const withoutBlocks = code.replace(/\/\*[\s\S]*?\*\//g, blank)
  return isCss ? withoutBlocks : withoutBlocks.replace(/(^|[^:])(\/\/.*)$/gm, (_, before, comment) => before + blank(comment))
}

const tokens = await readTokens()
const SPACING = scale(tokens, '--spacing-')
const RADIUS = scale(tokens, '--radius-')
const FONT_SIZE = scale(tokens, '--font-size-')
const WEIGHT = scale(tokens, '--weight-')
const DURATION = scale(tokens, '--duration-')

const tokenSuffix = (name, prefix) => name.slice(prefix.length)

// Tailwind utilities whose bare value is a spacing step (`p-12`, `size-4`, `-mt-6`).
const SPACING_UTILITY = /^(?:p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy]|inset(?:-[xy])?|top|right|bottom|left|start|end|w|h|size|min-w|min-h|max-w|max-h|translate-[xy]|scroll-[mp][xytrblse]?)$/
const RADIUS_UTILITY = /^rounded(?:-[a-z]{1,2})?$/

// CSS properties by the scale their lengths come from.
const SPACING_PROPERTY = /^(?:padding|margin|gap|row-gap|column-gap|inset|top|right|bottom|left|width|height|min-width|min-height|max-width|max-height)(?:-[a-z-]+)?$/
const RADIUS_PROPERTY = /^border(?:-[a-z]+)*-radius$/

// Word edges leave out `_`: Tailwind writes a space as `_` in an arbitrary value.
const HEX = /(?<![A-Za-z0-9&#/$-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![A-Za-z0-9-])/g
const COLOUR_FUNCTION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/g
const NAMED_COLOUR = /(?<![A-Za-z0-9-])(?:white|black)(?![A-Za-z0-9-])/g
const EASING_KEYWORD = /(?<![A-Za-z0-9-])(?:ease|ease-in|ease-out|ease-in-out)(?![A-Za-z0-9-])/g
const LENGTH = /^-?\d*\.?\d+px$/
const TIME = /(?<![A-Za-z0-9.-])(\d*\.?\d+)(ms|s)(?![A-Za-z0-9-])/g

const toMs = (amount, unit) => (unit === 's' ? Number(amount) * 1000 : Number(amount))
const durationToken = (amount, unit) => [...DURATION].find(([value]) => {
  const [, tokenAmount, tokenUnit] = value.match(/^(\d*\.?\d+)(ms|s)$/) ?? []
  return tokenAmount !== undefined && toMs(tokenAmount, tokenUnit) === toMs(amount, unit)
})?.[1]

const files = (await listFiles(SRC)).filter((f) => /\.(?:tsx?|css)$/.test(f) && !/\.test\.tsx?$/.test(f))
const problems = []
const allowedUsed = new Set()

for (const file of files) {
  const path = relative(ROOT, file)
  const isCss = file.endsWith('.css')
  const code = stripComments(await readFile(file, 'utf8'), isCss)
  const lineAt = (index) => code.slice(0, index).split('\n').length

  const report = (index, value, message) => {
    const allowed = ALLOWED.find((entry) => entry.file === path && entry.value === value)
    if (allowed) {
      allowedUsed.add(allowed)
      return
    }
    problems.push(`${path}:${lineAt(index)}: ${message}`)
  }

  for (const match of code.matchAll(HEX)) report(match.index, match[0], `${match[0]} is a raw colour; use a colour token`)
  for (const match of code.matchAll(COLOUR_FUNCTION)) report(match.index, match[0], `${match[0]}…) is a raw colour; use a colour token`)
  for (const match of code.matchAll(/cubic-bezier\(/g)) report(match.index, match[0], `${match[0]}…) is a raw easing; use --ease-out or --ease-in-out`)

  // Arbitrary values (`[...]`) and stylesheet declarations get the stricter rules.
  const checkValue = (index, value, describe, suggest = (token) => `var(${token})`) => {
    for (const match of value.matchAll(NAMED_COLOUR)) report(index, match[0], `${describe(match[0])} is a raw colour; use a colour token`)
    for (const match of value.matchAll(EASING_KEYWORD)) report(index, match[0], `${describe(match[0])} is a keyword easing; use var(--ease-out) or var(--ease-in-out)`)
    for (const [time, amount, unit] of value.matchAll(TIME)) {
      const token = durationToken(amount, unit)
      if (token) report(index, time, `${describe(time)} is ${token}; use ${suggest(token)}`)
    }
  }

  if (isCss) {
    // An @font-face's descriptors describe the font file, not a style.
    const styles = code.replace(/@font-face\s*\{[^}]*\}/g, (block) => block.replace(/[^\n]/g, ' '))
    for (const match of styles.matchAll(/(?<![\w-])([a-z-]+)\s*:\s*([^;{}]+)(?=[;}])/g)) {
      const [, property, value] = match
      checkValue(match.index, value, (raw) => `${property}: ${raw}`)
      for (const part of value.trim().split(/\s+/)) {
        const fromScale = SPACING_PROPERTY.test(property) ? SPACING
          : RADIUS_PROPERTY.test(property) ? RADIUS
          : property === 'font-size' ? FONT_SIZE
          : property === 'font-weight' ? WEIGHT
          : null
        const token = fromScale?.get(part)
        if (token) report(match.index, part, `${property}: ${part} is ${token}; use var(${token})`)
      }
    }
    continue
  }

  // Tailwind utilities, with any variants (`hover:`, `not-last:`) and a leading `-`.
  for (const match of code.matchAll(/(?<![\w-])-?([a-z][a-z-]*?)-\[([^\]\s'"`]+)\]/g)) {
    const [whole, utility, value] = match
    const isTiming = utility === 'duration' || utility === 'delay'
    checkValue(match.index, value, () => whole, isTiming ? (token) => `${utility}-(${token})` : undefined)
    const length = value.replace(/^-/, '')
    if (!LENGTH.test(length)) continue
    if (SPACING_UTILITY.test(utility) && SPACING.has(length)) {
      const step = tokenSuffix(SPACING.get(length), '--spacing-')
      report(match.index, whole, `${whole} is ${SPACING.get(length)}; use ${whole.startsWith('-') || value.startsWith('-') ? '-' : ''}${utility}-${step}`)
    } else if (RADIUS_UTILITY.test(utility) && RADIUS.has(length)) {
      report(match.index, whole, `${whole} is ${RADIUS.get(length)}; use ${utility}-${tokenSuffix(RADIUS.get(length), '--radius-')}`)
    } else if (utility === 'text' && FONT_SIZE.has(length)) {
      report(match.index, whole, `${whole} is ${FONT_SIZE.get(length)}; use text-${tokenSuffix(FONT_SIZE.get(length), '--font-size-')}`)
    }
  }

  // Bare-number durations and delays (`duration-140`), which Tailwind reads as ms.
  for (const match of code.matchAll(/(?<![\w-])(duration|delay)-(\d+)(?![\w-])/g)) {
    const token = durationToken(match[2], 'ms')
    if (token) report(match.index, match[0], `${match[0]} is ${token}; use ${match[1]}-(${token})`)
  }
}

for (const entry of ALLOWED) {
  if (!allowedUsed.has(entry)) problems.push(`scripts/check-raw-values.mjs: ALLOWED lists ${entry.value} in ${entry.file}, which no longer has it`)
}

if (problems.length > 0) {
  console.error(problems.join('\n'))
  console.error(`\n${problems.length} raw value${problems.length === 1 ? '' : 's'} where a token belongs`)
  process.exit(1)
}
console.log(`Raw values OK (${files.length} files in src/)`)
