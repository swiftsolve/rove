/**
 * Check that text in src/ takes a Figma text style, never a font size alone
 * (DESIGN.md: "Set text with a text style's class"). A bare size is how text
 * drifts off the system: it picks up whatever weight and line height it
 * inherits, and no Figma style matches it.
 *
 *   - a class sets type with a `type-*` class (`type-body-small text-tertiary`),
 *     not a font size utility: no `text-sm`, `md:text-lg` or `text-[13px]`;
 *   - a stylesheet sets `font-size` from a style's variable,
 *     `var(--type-<style>-size)`, next to its weight, line height and letter
 *     spacing (CSS can't apply the class);
 *   - code sets no `fontSize` (an SVG `<text>`, a style object).
 *
 * A utility beside the class still adjusts it (`font-medium`, `leading-[1.2]`,
 * `uppercase`, the `num` face); only the size has to come from the style. The
 * size utilities are read from the Tailwind theme's `--text-*` names
 * (rove-tokens' tailwind-theme.css), so a new step is covered without editing
 * this.
 *
 * Text no style fits goes in ALLOWED, with why; each entry is a gap to settle
 * in Figma. The dev mock
 * (src/bridge/mock-network-api.ts), tests and assets aren't checked.
 *
 *   node scripts/checks/text-styles.mjs
 */
import { readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SRC = join(ROOT, 'src')
const SKIPPED = [join(SRC, 'assets'), join(SRC, 'bridge', 'mock-network-api.ts')]
// The Tailwind theme src/styles/tailwind.css imports.
const THEME = createRequire(import.meta.url).resolve('@swiftsolve/rove-tokens/tailwind-theme.css')

/** Sizes that stay, by file and the exact text flagged. */
const ALLOWED = [
  // The About page's wordmark, at Number/Display's size: no sans style is that large.
  { file: 'src/features/about/AboutView.tsx', value: 'text-3xl' },
  // A flag emoji in a fixed slot, sized like an icon, not text.
  { file: 'src/features/apps/components/HostRow.tsx', value: 'text-md' },
  // Day names on the chart's axis, at Number/Small's size in the sans face:
  // Number/Small is Questrial, for figures.
  { file: 'src/features/usage/components/WeekChart.tsx', value: 'fontSize' },
]

async function listFiles(dir) {
  if (SKIPPED.includes(dir)) return []
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((entry) => (entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)])),
  )
  return nested.flat().filter((path) => !SKIPPED.includes(path))
}

/** Blank out comments, keeping line numbers. `//` after a `:` is a URL, not a comment. */
function stripComments(code, isCss) {
  const blank = (text) => text.replace(/[^\n]/g, ' ')
  const withoutBlocks = code.replace(/\/\*[\s\S]*?\*\//g, blank)
  return isCss
    ? withoutBlocks
    : withoutBlocks.replace(/(^|[^:])(\/\/.*)$/gm, (_, before, comment) => before + blank(comment))
}

const theme = await readFile(THEME, 'utf8')
const SIZES = [...theme.matchAll(/--text-([\w-]+)\s*:\s*var\(--font-size-/g)].map(([, step]) => step)
if (SIZES.length === 0) {
  console.error(`scripts/checks/text-styles.mjs: found no --text-* sizes in ${relative(ROOT, THEME)}`)
  process.exit(1)
}

// `text-sm`, with any variants (`md:`, `group-hover:`), but not a colour
// (`text-secondary`) or a custom property (`var(--text-sm)`).
const SIZE_UTILITY = new RegExp(`(?<![\\w-])!?text-(?:${SIZES.join('|')})(?![\\w-])`, 'g')
// `text-[13px]`, `text-[1.1rem]`, `text-(length:--x)`: a size, not an arbitrary colour.
const ARBITRARY_SIZE = /(?<![\w-])!?text-(?:\[(?:length:)?[\d.]+(?:px|r?em|%)?\]|\(length:[^)]*\))/g
const FONT_SIZE_PROP = /\bfontSize\b/g
const CSS_FONT_SIZE = /(?<![\w-])font-size\s*:\s*([^;}\n]+)/g
const STYLE_SIZE = /^var\(--type-[\w-]+-size\)$/

const files = (await listFiles(SRC)).filter((file) => /\.(?:css|tsx?)$/.test(file) && !/\.test\.tsx?$/.test(file))
const problems = []
const allowedUsed = new Set()

for (const file of files) {
  const path = relative(ROOT, file)
  const isCss = file.endsWith('.css')
  const code = stripComments(await readFile(file, 'utf8'), isCss)

  const report = (index, value, message) => {
    const entry = ALLOWED.find((allowed) => allowed.file === path && allowed.value === value)
    if (entry) {
      allowedUsed.add(entry)
      return
    }
    const line = code.slice(0, index).split('\n').length
    problems.push(`${path}:${line}: ${message}`)
  }

  for (const match of code.matchAll(CSS_FONT_SIZE)) {
    const value = match[1].trim()
    if (STYLE_SIZE.test(value)) continue
    report(
      match.index,
      match[0],
      `font-size: ${value} is a size alone; use a style's var(--type-<style>-size), with its weight, line height and letter spacing`,
    )
  }
  if (isCss) continue

  for (const pattern of [SIZE_UTILITY, ARBITRARY_SIZE]) {
    for (const match of code.matchAll(pattern)) {
      report(match.index, match[0], `${match[0]} is a font size alone; use a text style's type-* class`)
    }
  }
  for (const match of code.matchAll(FONT_SIZE_PROP)) {
    report(match.index, match[0], `fontSize sets a size alone; use a text style's type-* class`)
  }
}

for (const entry of ALLOWED) {
  if (!allowedUsed.has(entry))
    problems.push(
      `scripts/checks/text-styles.mjs: ALLOWED lists ${entry.value} in ${entry.file}, which no longer has it`,
    )
}

if (problems.length > 0) {
  console.error(problems.join('\n'))
  console.error(`\n${problems.length} font size${problems.length === 1 ? '' : 's'} set without a text style`)
  console.error(
    "Which style: DESIGN.md's typography, each style with its use (node_modules/@swiftsolve/rove-tokens/DESIGN.md). " +
      'Text no style fits goes in ALLOWED here, with why: a gap to settle in Figma.',
  )
  process.exit(1)
}
console.log(`Text styles OK (${files.length} files in src/)`)
