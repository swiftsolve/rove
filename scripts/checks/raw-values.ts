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
 *     text-styles.ts's: text takes a text style, not a size);
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
 * (apps/rove/src/bridge/mock-network-api.ts), tests and assets aren't checked.
 *
 *   node scripts/checks/raw-values.ts
 */
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

import { APP_SRC, resolveFromLibrary, ROOT, SOURCE_DIRS } from '../lib/source-dirs.ts'

const SKIPPED = [join(APP_SRC, 'assets'), join(APP_SRC, 'bridge', 'mock-network-api.ts')]
const TOKENS_CSS = resolveFromLibrary('@swiftsolve/rove-tokens/tokens.css')

type AllowedEntry = { file: string; value: string }

/** Raw values that stay, by file and the exact text flagged. */
const ALLOWED: AllowedEntry[] = [
  // A scanner needs dark modules on white in both themes, and the mark's tile is that white.
  { file: 'apps/rove/src/features/current-network/components/WifiQrCode.tsx', value: '#ffffff' },
  // The brand icon's gradient, the same as the app icon's.
  { file: 'packages/ui/src/icons/BrandIcon.tsx', value: '#7aa4ff' },
  { file: 'packages/ui/src/icons/BrandIcon.tsx', value: '#5484f5' },
  // The About tile draws the app icon, which looks the same in both themes:
  // its tile, the ring's groove and the dot copy the icon's own colours.
  { file: 'apps/rove/src/features/about/components/AppIconTile.tsx', value: 'rgba(' },
  { file: 'apps/rove/src/features/about/components/AppIconTile.tsx', value: '#282a2f' },
  { file: 'apps/rove/src/features/about/components/AppIconTile.tsx', value: '#1c1d21' },
  { file: 'apps/rove/src/features/about/components/AppIconTile.tsx', value: '#16171a' },
  { file: 'apps/rove/src/features/about/components/AppIconTile.tsx', value: '#7aa4ff' },
  { file: 'apps/rove/src/features/about/components/AppIconTile.tsx', value: '#5484f5' },
  { file: 'apps/rove/src/features/about/components/AppIconTile.tsx', value: '#76a0ff' },
  { file: 'apps/rove/src/features/about/components/AppIconTile.tsx', value: '#6893fa' },
  { file: 'apps/rove/src/features/about/components/AppIconTile.tsx', value: '#5f8df7' },
  { file: 'apps/rove/src/features/about/components/AppIconTile.tsx', value: '#020617' },
  { file: 'apps/rove/src/features/about/components/AppIconTile.tsx', value: '#cfdcff' },
  { file: 'apps/rove/src/features/about/components/AppIconTile.tsx', value: '#ffffff' },
  // The theme swap's circular reveal, tuned on its own.
  { file: 'apps/rove/src/app/utils/theme-transition.ts', value: 'cubic-bezier(' },
  // A mask reads only alpha, so its colour is no design choice.
  { file: 'packages/ui/src/empty-state/EmptyState.tsx', value: '#000' },
  // The Path card's glint is its line's own token colour, brightened in
  // OKLCH: derived from whichever token the line holds, with no fixed value.
  { file: 'apps/rove/src/features/connection/components/PathCard.tsx', value: 'oklch(' },

  // Spacing off the scale. Set by an icon's ink, not its box: Lucide's arrows
  // leave ~2px empty each side at 11px, ~3px at 13px.
  { file: 'apps/rove/src/features/apps/components/TransferFigures.tsx', value: 'gap-[5px]' },
  { file: 'apps/rove/src/features/apps/components/UsageRow.tsx', value: 'ml-[3px]' },
  { file: 'packages/ui/src/link/Link.tsx', value: '-mx-[3px]' },
  // The pill's padding hangs outside the words, so they line up with the text around them.
  { file: 'packages/ui/src/link/Link.tsx', value: 'ml-[-9.5px]' },
  { file: 'packages/ui/src/link/Link.tsx', value: 'mr-[-9px]' },
  // A 1px border given back, so the content stays on the grid above.
  {
    file: 'apps/rove/src/features/capabilities/components/CapabilityDetailCard.tsx',
    value: 'px-[calc(var(--card-padding)-1px)]',
  },
  { file: 'apps/rove/src/features/speed/components/HistoryCard.tsx', value: 'px-[calc(var(--card-padding)-1px)]' },
  // Lined up with something that isn't spacing: an icon's width, a label column.
  { file: 'apps/rove/src/features/apps/components/AppGroup.tsx', value: 'pl-[calc(var(--card-padding)+19px)]' },
  { file: 'apps/rove/src/features/apps/components/HostRow.tsx', value: 'gap-[calc(var(--gap-icon-label)-1px)]' },
  { file: 'apps/rove/src/features/services/components/ServiceRow.tsx', value: 'pl-[calc(16px+var(--gap-media-text))]' },
  {
    file: 'apps/rove/src/features/live-throughput/components/ThroughputChart.tsx',
    value: 'pr-[calc(28px+var(--spacing-12))]',
  },
  { file: 'packages/ui/src/timeline/TimelineNode.tsx', value: 'pl-[5px]' },
  { file: 'packages/ui/src/timeline/TimelineNode.tsx', value: 'pb-[22px]' },
  // Lifts the empty state a little above centre, under the page header.
  { file: 'packages/ui/src/empty-state/EmptyState.tsx', value: 'pb-[56px]' },

  // Corners off the scale. The About tile draws the app icon, whose corner is its own.
  { file: 'apps/rove/src/features/about/components/AppIconTile.tsx', value: 'rounded-[16px]' },
  // No reason recorded yet: check each against Figma, then snap it to a step or say why.
  { file: 'apps/rove/src/features/timeline/components/TimelineDay.tsx', value: 'mt-[18px]' },
  { file: 'apps/rove/src/app/components/UpdateDialog.tsx', value: 'pl-[26px]' },
]

async function listFiles(dir: string): Promise<string[]> {
  if (SKIPPED.includes(dir)) return []
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name)
      return entry.isDirectory() ? listFiles(path) : [path]
    }),
  )
  return nested.flat().filter((path) => !SKIPPED.includes(path))
}

/** Each `--name: value` the tokens define, plain values only (not `var()`). */
async function readTokens(): Promise<Map<string, string>> {
  const css = await readFile(TOKENS_CSS, 'utf8')
  const tokens = new Map<string, string>()
  for (const [, name = '', value = ''] of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    if (!value.includes('var(') && !tokens.has(name)) tokens.set(name, value.trim())
  }
  return tokens
}

/** A scale's tokens by value: `{ '12px': '--spacing-12' }`. */
function tokensByValue(tokens: Map<string, string>, prefix: string): Map<string, string> {
  const byValue = new Map<string, string>()
  for (const [name, value] of tokens) if (name.startsWith(prefix)) byValue.set(value, name)
  return byValue
}

/** Blank out comments, keeping line numbers. `//` after a `:` is a URL, not a comment. */
function stripComments(code: string, isCss: boolean): string {
  const blank = (text: string) => text.replace(/[^\n]/g, ' ')
  const withoutBlocks = code.replace(/\/\*[\s\S]*?\*\//g, blank)
  return isCss
    ? withoutBlocks
    : withoutBlocks.replace(/(^|[^:])(\/\/.*)$/gm, (_match, before: string, comment: string) => before + blank(comment))
}

const tokens = await readTokens()
const SPACING_SCALE = tokensByValue(tokens, '--spacing-')
const RADIUS_SCALE = tokensByValue(tokens, '--radius-')
const WEIGHT_SCALE = tokensByValue(tokens, '--weight-')
const DURATION_SCALE = tokensByValue(tokens, '--duration-')

const tokenSuffix = (name: string, prefix: string) => name.slice(prefix.length)

/** The token scale a CSS property's values come from, or null for one no scale covers. */
function scaleForProperty(property: string): Map<string, string> | null {
  if (SPACING_PROPERTY.test(property)) return SPACING_SCALE
  if (RADIUS_PROPERTY.test(property)) return RADIUS_SCALE
  if (property === 'font-weight') return WEIGHT_SCALE
  return null
}

/** Tailwind utilities whose bare value is a spacing step (`p-12`, `size-4`, `-mt-6`). */
const SPACING_UTILITY =
  /^(?:p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy]|inset(?:-[xy])?|top|right|bottom|left|start|end|w|h|size|min-w|min-h|max-w|max-h|translate-[xy]|scroll-[mp][xytrblse]?)$/
const RADIUS_UTILITY = /^rounded(?:-[a-z]{1,2})?$/
/** The utilities DESIGN.md holds to the spacing scale: gaps, paddings and margins. */
const SPACE_UTILITY = /^(?:p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy])$/
const SPACE_PROPERTY = /^(?:padding|margin|gap|row-gap|column-gap)(?:-[a-z-]+)?$/

const TOKEN_READ = /var\(--[\w-]+\)/g
/** A number with a unit, not part of a name or a longer number. */
const RAW_LENGTH = /(?<![A-Za-z0-9_.])\d*\.?\d+(?:px|rem|em|%)/
/**
 * A value built from tokens alone, with no raw length once its `var()`s are
 * set aside: `var(--card-padding)`, `calc(-1 * var(--spacing-12))`, `0`,
 * `auto`, `inherit`.
 */
const isBuiltFromTokens = (value: string) => !RAW_LENGTH.test(value.replace(TOKEN_READ, ''))

/** CSS properties by the scale their lengths come from. */
const SPACING_PROPERTY =
  /^(?:padding|margin|gap|row-gap|column-gap|inset|top|right|bottom|left|width|height|min-width|min-height|max-width|max-height)(?:-[a-z-]+)?$/
const RADIUS_PROPERTY = /^border(?:-[a-z]+)*-radius$/

/** Word edges leave out `_`: Tailwind writes a space as `_` in an arbitrary value. */
const HEX = /(?<![A-Za-z0-9&#/$-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![A-Za-z0-9-])/g
const COLOUR_FUNCTION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/g
const NAMED_COLOUR = /(?<![A-Za-z0-9-])(?:white|black)(?![A-Za-z0-9-])/g
const EASING_KEYWORD = /(?<![A-Za-z0-9-])(?:ease|ease-in|ease-out|ease-in-out)(?![A-Za-z0-9-])/g
const PX_LENGTH = /^-?\d*\.?\d+px$/
/** An arbitrary value (`p-[12px]`, `-mt-[3px]`): the utility and the value in its brackets. */
const ARBITRARY_VALUE = /(?<![\w-])-?([a-z][a-z-]*?)-\[([^\]\s'"`]+)\]/g
const TIME = /(?<![A-Za-z0-9.-])(\d*\.?\d+)(ms|s)(?![A-Za-z0-9-])/g

const toMs = (amount: string, unit: string) => (unit === 's' ? Number(amount) * 1000 : Number(amount))

/** The duration token equal to `amount` `unit`, in ms or s either side (`0.14s` is `140ms`), if any. */
function durationToken(amount: string, unit: string): string | undefined {
  const ms = toMs(amount, unit)
  for (const [value, name] of DURATION_SCALE) {
    const [, tokenAmount, tokenUnit] = /^(\d*\.?\d+)(ms|s)$/.exec(value) ?? []
    if (tokenAmount && tokenUnit && toMs(tokenAmount, tokenUnit) === ms) return name
  }
  return undefined
}

const sourceFiles = (await Promise.all(SOURCE_DIRS.map(listFiles))).flat()
const files = sourceFiles.filter((f) => /\.(?:tsx?|css)$/.test(f) && !/\.test\.tsx?$/.test(f))
const problems: string[] = []
const usedAllowedEntries = new Set<AllowedEntry>()

for (const file of files) {
  const relativePath = relative(ROOT, file)
  const isCss = file.endsWith('.css')
  const code = stripComments(await readFile(file, 'utf8'), isCss)
  const lineAt = (index: number) => code.slice(0, index).split('\n').length

  const report = (index: number, value: string, message: string) => {
    const allowed = ALLOWED.find((entry) => entry.file === relativePath && entry.value === value)
    if (allowed) {
      usedAllowedEntries.add(allowed)
      return
    }
    problems.push(`${relativePath}:${lineAt(index)}: ${message}`)
  }

  for (const match of code.matchAll(HEX))
    report(match.index, match[0], `${match[0]} is a raw colour; use a colour token`)
  for (const match of code.matchAll(COLOUR_FUNCTION))
    report(match.index, match[0], `${match[0]}…) is a raw colour; use a colour token`)
  for (const match of code.matchAll(/cubic-bezier\(/g))
    report(match.index, match[0], `${match[0]}…) is a raw easing; use --ease-out, --ease-in-out or --ease-pulse`)

  // Arbitrary values (`[...]`) and stylesheet declarations get the stricter rules.
  const checkValue = (
    index: number,
    value: string,
    describe: (raw: string) => string,
    suggest = (token: string) => `var(${token})`,
  ) => {
    for (const match of value.matchAll(NAMED_COLOUR))
      report(index, match[0], `${describe(match[0])} is a raw colour; use a colour token`)
    for (const match of value.matchAll(EASING_KEYWORD))
      report(
        index,
        match[0],
        `${describe(match[0])} is a keyword easing; use var(--ease-out), var(--ease-in-out) or var(--ease-pulse)`,
      )
    for (const [time, amount = '', unit = ''] of value.matchAll(TIME)) {
      const token = durationToken(amount, unit)
      if (token) report(index, time, `${describe(time)} is ${token}; use ${suggest(token)}`)
    }
  }

  if (isCss) {
    // An @font-face's descriptors describe the font file, not a style.
    const cssWithoutFontFaces = code.replace(/@font-face\s*\{[^}]*\}/g, (block) => block.replace(/[^\n]/g, ' '))
    for (const match of cssWithoutFontFaces.matchAll(/(?<![\w-])([a-z-]+)\s*:\s*([^;{}]+)(?=[;}])/g)) {
      const [, property = '', value = ''] = match
      checkValue(match.index, value, (raw) => `${property}: ${raw}`)
      const propertyScale = scaleForProperty(property)
      const valueParts = value.trim().split(/\s+/)
      for (const part of valueParts) {
        const token = propertyScale?.get(part)
        if (token) report(match.index, part, `${property}: ${part} is ${token}; use var(${token})`)
      }
      const isTokenEqual = valueParts.some((part) => propertyScale?.has(part))
      if (RADIUS_PROPERTY.test(property) && !isTokenEqual && !isBuiltFromTokens(value)) {
        const declaration = `${property}: ${value.trim()}`
        report(
          match.index,
          declaration,
          `${declaration} is off the radius scale; use a --radius-* token, or say why in ALLOWED`,
        )
      }
      if (SPACE_PROPERTY.test(property) && !isTokenEqual && !isBuiltFromTokens(value)) {
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
  for (const match of code.matchAll(ARBITRARY_VALUE)) {
    const [arbitraryClass, utility = '', value = ''] = match
    const isTiming = utility === 'duration' || utility === 'delay'
    checkValue(match.index, value, () => arbitraryClass, isTiming ? (token) => `${utility}-(${token})` : undefined)
    const unsignedLength = value.replace(/^-/, '')
    if (!PX_LENGTH.test(unsignedLength)) continue
    const spacingToken = SPACING_SCALE.get(unsignedLength)
    const radiusToken = RADIUS_SCALE.get(unsignedLength)
    if (SPACING_UTILITY.test(utility) && spacingToken) {
      const step = tokenSuffix(spacingToken, '--spacing-')
      const sign = arbitraryClass.startsWith('-') || value.startsWith('-') ? '-' : ''
      report(match.index, arbitraryClass, `${arbitraryClass} is ${spacingToken}; use ${sign}${utility}-${step}`)
    } else if (RADIUS_UTILITY.test(utility) && radiusToken) {
      report(
        match.index,
        arbitraryClass,
        `${arbitraryClass} is ${radiusToken}; use ${utility}-${tokenSuffix(radiusToken, '--radius-')}`,
      )
    }
  }

  // Every gap, padding and margin is a spacing step and every corner a radius
  // (DESIGN.md, Layout and Shapes), so one off the scale needs a reason in ALLOWED.
  for (const match of code.matchAll(ARBITRARY_VALUE)) {
    const [arbitraryClass, utility = '', value = ''] = match
    if (SPACE_UTILITY.test(utility) && !isBuiltFromTokens(value) && !SPACING_SCALE.has(value.replace(/^-/, ''))) {
      report(
        match.index,
        arbitraryClass,
        `${arbitraryClass} is off the spacing scale; use a --spacing-* step, or say why in ALLOWED`,
      )
    }
    if (RADIUS_UTILITY.test(utility) && !isBuiltFromTokens(value) && !RADIUS_SCALE.has(value)) {
      report(
        match.index,
        arbitraryClass,
        `${arbitraryClass} is off the radius scale; use a --radius-* token, or say why in ALLOWED`,
      )
    }
  }

  // Bare-number durations and delays (`duration-140`), which Tailwind reads as ms.
  for (const match of code.matchAll(/(?<![\w-])(duration|delay)-(\d+)(?![\w-])/g)) {
    const [utilityClass, utility = '', amount = ''] = match
    const token = durationToken(amount, 'ms')
    if (token) report(match.index, utilityClass, `${utilityClass} is ${token}; use ${utility}-(${token})`)
  }
}

for (const entry of ALLOWED) {
  if (!usedAllowedEntries.has(entry))
    problems.push(`scripts/checks/raw-values.ts: ALLOWED lists ${entry.value} in ${entry.file}, which no longer has it`)
}

if (problems.length > 0) {
  console.error(problems.join('\n'))
  console.error(`\n${problems.length} raw value${problems.length === 1 ? '' : 's'} where a token belongs`)
  console.error(
    "Which token, and when a value may leave the scale: DESIGN.md's Do's and Don'ts and Layout " +
      '(packages/tokens/DESIGN.md). One that has to stay goes in ALLOWED here, with why.',
  )
  process.exit(1)
}
console.log(`Raw values OK (${files.length} files in apps/rove/src and packages/ui/src)`)
