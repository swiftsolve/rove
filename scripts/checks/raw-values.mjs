/**
 * Check src/ for raw values where a design token belongs:
 *
 *   - colours: every colour is a token, so no hex, `rgb()`/`hsl()`/`oklch()`…
 *     or `white`/`black` in a class, a style or a stylesheet;
 *   - easings: every curve is a token, so no `cubic-bezier()`, and no keyword
 *     easing (`ease-in-out`) inside an arbitrary value or a stylesheet (the
 *     `ease-out` utility is the token and stays);
 *   - a length, weight or duration that equals a token on its scale: `p-[12px]`
 *     is `p-12`, `rounded-[8px]` is `rounded-sm`, `duration-[140ms]` is
 *     `duration-(--duration-fast)`, and the same in CSS (font sizes are
 *     text-styles.mjs's: text takes a text style, not a size);
 *   - spacing: every gap, padding and margin is built from spacing tokens
 *     (`gap-8`, `px-(--card-padding)`, a `calc()` of tokens), so one off the
 *     scale (`gap-[5px]`, `calc(var(--card-padding) - 1px)`) needs a reason;
 *   - radius: every corner is a radius token, so one off the scale
 *     (`rounded-[16px]`) needs a reason. A thin bar takes `rounded-full`,
 *     which rounds to half its width.
 *
 * Other values off the token scales (`size-[28px]`, `leading-[1.2]`, a 2.4s
 * pulse) aren't flagged: the system has no token for them. The token values are read
 * from @swiftsolve/rove-tokens, so a token update moves the rules with it.
 *
 * A raw value that has to stay goes in ALLOWED with its reason. The dev mock
 * (src/bridge/mock-network-api.ts), tests and assets aren't checked.
 *
 *   node scripts/checks/raw-values.mjs
 */
import { readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SRC = join(ROOT, 'src')
const SKIPPED = [join(SRC, 'assets'), join(SRC, 'bridge', 'mock-network-api.ts')]
const TOKENS_CSS = createRequire(import.meta.url).resolve('@swiftsolve/rove-tokens/tokens.css')

/** Raw values that stay, by file and the exact text flagged. */
const ALLOWED = [
  // A scanner needs dark modules on white in both themes.
  { file: 'src/features/connection/components/WifiShareDialog.tsx', value: '#ffffff' },
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

  // Spacing off the scale. Set by an icon's ink, not its box: Lucide's arrows
  // leave ~2px empty each side at 11px, ~3px at 13px.
  { file: 'src/features/apps/components/TransferFigures.tsx', value: 'gap-[5px]' },
  { file: 'src/features/apps/components/UsageRow.tsx', value: 'ml-[3px]' },
  { file: 'src/ui/link/Link.tsx', value: 'gap-[5px]' },
  { file: 'src/ui/link/Link.tsx', value: '-mx-[3px]' },
  // The pill's padding hangs outside the words, so they line up with the text around them.
  { file: 'src/ui/link/Link.tsx', value: 'ml-[-9.5px]' },
  { file: 'src/ui/link/Link.tsx', value: 'mr-[-9px]' },
  // A 1px border given back, so the content stays on the grid above.
  {
    file: 'src/features/capabilities/components/CapabilityDetailCard.tsx',
    value: 'px-[calc(var(--card-header-padding-x)-1px)]',
  },
  { file: 'src/features/speed/components/HistoryCard.tsx', value: 'px-[calc(var(--card-body-padding)-1px)]' },
  // Lined up with something that isn't spacing: an icon's width, a label column.
  { file: 'src/features/apps/components/AppGroup.tsx', value: 'pl-[calc(var(--card-body-padding)+21px)]' },
  { file: 'src/features/services/components/ServiceRow.tsx', value: 'pl-[calc(16px+var(--spacing-12))]' },
  { file: 'src/features/live-throughput/components/ThroughputChart.tsx', value: 'pr-[26px]' },
  { file: 'src/ui/timeline/TimelineNode.tsx', value: 'pl-[5px]' },
  { file: 'src/ui/timeline/TimelineNode.tsx', value: 'pb-[22px]' },
  // Lifts the empty state a little above centre, under the page header.
  { file: 'src/ui/empty-state/EmptyState.tsx', value: 'pb-[56px]' },

  // Corners off the scale. The About tile redraws the app icon, whose corner is its own.
  { file: 'src/features/about/AboutView.tsx', value: 'rounded-[16px]' },
  // No reason recorded yet: check each against Figma, then snap it to a step or say why.
  { file: 'src/features/apps/components/HostRow.tsx', value: 'gap-[7px]' },
  { file: 'src/features/timeline/components/TimelineDay.tsx', value: 'mt-[18px]' },
  { file: 'src/app/components/UpdateDialog.tsx', value: 'pl-[26px]' },
]

async function listFiles(dir) {
  if (SKIPPED.includes(dir)) return []
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(dir, entry.name)
      return entry.isDirectory() ? listFiles(path) : [path]
    }),
  )
  return nested.flat().filter((path) => !SKIPPED.includes(path))
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
  return isCss
    ? withoutBlocks
    : withoutBlocks.replace(/(^|[^:])(\/\/.*)$/gm, (_, before, comment) => before + blank(comment))
}

const tokens = await readTokens()
const SPACING = scale(tokens, '--spacing-')
const RADIUS = scale(tokens, '--radius-')
const WEIGHT = scale(tokens, '--weight-')
const DURATION = scale(tokens, '--duration-')

const tokenSuffix = (name, prefix) => name.slice(prefix.length)

/** The token scale a CSS property's values come from, or null for one no scale covers. */
function scaleForProperty(property) {
  if (SPACING_PROPERTY.test(property)) return SPACING
  if (RADIUS_PROPERTY.test(property)) return RADIUS
  if (property === 'font-weight') return WEIGHT
  return null
}

// Tailwind utilities whose bare value is a spacing step (`p-12`, `size-4`, `-mt-6`).
const SPACING_UTILITY =
  /^(?:p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy]|inset(?:-[xy])?|top|right|bottom|left|start|end|w|h|size|min-w|min-h|max-w|max-h|translate-[xy]|scroll-[mp][xytrblse]?)$/
const RADIUS_UTILITY = /^rounded(?:-[a-z]{1,2})?$/
/** A radius built from tokens alone: `var(--radius-sm)`, `inherit`, `0`. */
const isRadiusValue = (value) =>
  !/(?<![A-Za-z0-9_.])\d*\.?\d+(?:px|rem|em|%)/.test(value.replace(/var\(--[\w-]+\)/g, ''))
// The utilities DESIGN.md holds to the spacing scale: gaps, paddings and margins.
const SPACE_UTILITY = /^(?:p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy])$/
const SPACE_PROPERTY = /^(?:padding|margin|gap|row-gap|column-gap)(?:-[a-z-]+)?$/
/** A spacing value built from tokens alone: `var(--card-padding)`, `calc(-1 * var(--spacing-12))`, `0`, `auto`. */
const isSpacingValue = (value) =>
  !/(?<![A-Za-z0-9_.])\d*\.?\d+(?:px|rem|em|%)/.test(value.replace(/var\(--[\w-]+\)/g, ''))

// CSS properties by the scale their lengths come from.
const SPACING_PROPERTY =
  /^(?:padding|margin|gap|row-gap|column-gap|inset|top|right|bottom|left|width|height|min-width|min-height|max-width|max-height)(?:-[a-z-]+)?$/
const RADIUS_PROPERTY = /^border(?:-[a-z]+)*-radius$/

// Word edges leave out `_`: Tailwind writes a space as `_` in an arbitrary value.
const HEX = /(?<![A-Za-z0-9&#/$-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![A-Za-z0-9-])/g
const COLOUR_FUNCTION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/g
const NAMED_COLOUR = /(?<![A-Za-z0-9-])(?:white|black)(?![A-Za-z0-9-])/g
const EASING_KEYWORD = /(?<![A-Za-z0-9-])(?:ease|ease-in|ease-out|ease-in-out)(?![A-Za-z0-9-])/g
const LENGTH = /^-?\d*\.?\d+px$/
const TIME = /(?<![A-Za-z0-9.-])(\d*\.?\d+)(ms|s)(?![A-Za-z0-9-])/g

const toMs = (amount, unit) => (unit === 's' ? Number(amount) * 1000 : Number(amount))
const durationToken = (amount, unit) =>
  [...DURATION].find(([value]) => {
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

  for (const match of code.matchAll(HEX))
    report(match.index, match[0], `${match[0]} is a raw colour; use a colour token`)
  for (const match of code.matchAll(COLOUR_FUNCTION))
    report(match.index, match[0], `${match[0]}…) is a raw colour; use a colour token`)
  for (const match of code.matchAll(/cubic-bezier\(/g))
    report(match.index, match[0], `${match[0]}…) is a raw easing; use --ease-out, --ease-in-out or --ease-pulse`)

  // Arbitrary values (`[...]`) and stylesheet declarations get the stricter rules.
  const checkValue = (index, value, describe, suggest = (token) => `var(${token})`) => {
    for (const match of value.matchAll(NAMED_COLOUR))
      report(index, match[0], `${describe(match[0])} is a raw colour; use a colour token`)
    for (const match of value.matchAll(EASING_KEYWORD))
      report(
        index,
        match[0],
        `${describe(match[0])} is a keyword easing; use var(--ease-out), var(--ease-in-out) or var(--ease-pulse)`,
      )
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
      const fromScale = scaleForProperty(property)
      for (const part of value.trim().split(/\s+/)) {
        const token = fromScale?.get(part)
        if (token) report(match.index, part, `${property}: ${part} is ${token}; use var(${token})`)
      }
      const isTokenEqual = value
        .trim()
        .split(/\s+/)
        .some((part) => fromScale?.has(part))
      if (RADIUS_PROPERTY.test(property) && !isTokenEqual && !isRadiusValue(value)) {
        const declaration = `${property}: ${value.trim()}`
        report(
          match.index,
          declaration,
          `${declaration} is off the radius scale; use a --radius-* token, or say why in ALLOWED`,
        )
      }
      if (SPACE_PROPERTY.test(property) && !isTokenEqual && !isSpacingValue(value)) {
        const declaration = `${property}: ${value.trim()}`
        report(
          match.index,
          declaration,
          `${declaration} is off the spacing scale; use --spacing-* steps, or say why in ALLOWED`,
        )
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
      const sign = whole.startsWith('-') || value.startsWith('-') ? '-' : ''
      report(match.index, whole, `${whole} is ${SPACING.get(length)}; use ${sign}${utility}-${step}`)
    } else if (RADIUS_UTILITY.test(utility) && RADIUS.has(length)) {
      report(
        match.index,
        whole,
        `${whole} is ${RADIUS.get(length)}; use ${utility}-${tokenSuffix(RADIUS.get(length), '--radius-')}`,
      )
    }
  }

  // Every gap, padding and margin is a spacing step and every corner a radius
  // (DESIGN.md, Layout and Shapes), so one off the scale needs a reason in ALLOWED.
  for (const match of code.matchAll(/(?<![\w-])-?([a-z][a-z-]*?)-\[([^\]\s'"`]+)\]/g)) {
    const [whole, utility, value] = match
    if (SPACE_UTILITY.test(utility) && !isSpacingValue(value) && !SPACING.has(value.replace(/^-/, ''))) {
      report(match.index, whole, `${whole} is off the spacing scale; use a --spacing-* step, or say why in ALLOWED`)
    }
    if (RADIUS_UTILITY.test(utility) && !isRadiusValue(value) && !RADIUS.has(value)) {
      report(match.index, whole, `${whole} is off the radius scale; use a --radius-* token, or say why in ALLOWED`)
    }
  }

  // Bare-number durations and delays (`duration-140`), which Tailwind reads as ms.
  for (const match of code.matchAll(/(?<![\w-])(duration|delay)-(\d+)(?![\w-])/g)) {
    const token = durationToken(match[2], 'ms')
    if (token) report(match.index, match[0], `${match[0]} is ${token}; use ${match[1]}-(${token})`)
  }
}

for (const entry of ALLOWED) {
  if (!allowedUsed.has(entry))
    problems.push(
      `scripts/checks/raw-values.mjs: ALLOWED lists ${entry.value} in ${entry.file}, which no longer has it`,
    )
}

if (problems.length > 0) {
  console.error(problems.join('\n'))
  console.error(`\n${problems.length} raw value${problems.length === 1 ? '' : 's'} where a token belongs`)
  console.error(
    "Which token, and when a value may leave the scale: DESIGN.md's Do's and Don'ts and Layout " +
      '(node_modules/@swiftsolve/rove-tokens/DESIGN.md). One that has to stay goes in ALLOWED here, with why.',
  )
  process.exit(1)
}
console.log(`Raw values OK (${files.length} files in src/)`)
