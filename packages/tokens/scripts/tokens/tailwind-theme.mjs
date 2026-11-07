/**
 * dist/tailwind-theme.css: a Tailwind v4 theme built only from the tokens, so
 * `p-12` is `--spacing-12`, `text-md` is `--font-size-md` and `bg-surface` is
 * `--bg-surface`, and Tailwind's own scales (`p-7`, `text-blue-500`) are
 * cleared. It's generated, so a new token reaches Tailwind with the release
 * and the theme can't fall behind the tokens.
 *
 * `inline` makes each utility use the token itself (`padding:
 * var(--spacing-12)`), so a theme switch or a token update flows through.
 * `reference` stops Tailwind declaring these names on :root: several share a
 * token's own name (`--spacing-12`, `--radius-sm`), and `--radius-sm:
 * var(--radius-sm)` there would be a self-reference that invalidates it.
 *
 * Colours drop their group where the utility already says it: `bg/surface` is
 * `bg-surface`, `text/primary` is `text-primary`, `border/default` is
 * `border-line`. The rest keep it (`bg-status-positive`, `bg-overlay-hover`).
 */
import { writeFile } from 'node:fs/promises'

/** A colour variable's name in the theme's `--color-*` namespace. */
function colourName(figmaName) {
  const [group, ...rest] = figmaName.split('/')
  const name = rest.join('-')
  if (group === 'bg') return `--color-${name}`
  // `text-accent` would be the accent itself, so the accent's word colour is accent-text.
  if (group === 'text') return name === 'accent' ? '--color-accent-text' : `--color-${name}`
  if (group === 'border') return name === 'default' ? '--color-line' : `--color-line-${name}`
  if (group === 'accent') return name === 'default' ? '--color-accent' : `--color-accent-${name}`
  return `--color-${group}-${name}`
}

/** Each theme namespace, the token groups that fill it, and how a token's name maps. */
const SCALES = [
  ['Spacing (p-*, gap-*, m-*), plus 0 for resets and 1px for hairlines', 'spacing', (n) => `--spacing-${n}`],
  ['Font families (font-sans, font-numeric, font-display)', 'font-family', (n) => `--font-${n}`],
  ['Font sizes (text-*)', 'font-size', (n) => `--text-${n}`],
  ['Font weights (font-*)', 'weight', (n) => `--font-weight-${n}`],
  ['Corners (rounded-*)', 'radius', (n) => `--radius-${n}`],
]

export async function writeTailwindTheme({ path, header, variables, textStyles, slugOf, shadows, code }) {
  const cssVar = (v) => `--${v.name.replace(/\//g, '-')}`
  const withCode = variables.filter((v) => v.code)
  const lines = []
  const seen = new Map()
  const add = (name, value) => {
    if (seen.has(name)) throw new Error(`tailwind-theme.css: ${name} is both ${seen.get(name)} and ${value}`)
    seen.set(name, value)
    lines.push(`  ${name}: ${value};`)
  }
  const section = (comment) => lines.push('', `  /* ${comment} */`)

  for (const [comment, group, map] of SCALES) {
    section(comment)
    if (group === 'spacing') {
      add('--spacing-0', '0px')
      add('--spacing-px', '1px')
    }
    for (const v of withCode.filter((v) => v.name.startsWith(`${group}/`)))
      add(map(v.name.slice(group.length + 1)), `var(${cssVar(v)})`)
  }

  section(
    "Line height and letter spacing by text style (leading-body-default, tracking-heading-large), for text that matches a style but takes its own size or colour. A style's .type-* class sets all of it at once.",
  )
  for (const s of textStyles) add(`--leading-${slugOf(s.name)}`, `var(--type-${slugOf(s.name)}-line-height)`)
  for (const s of textStyles) add(`--tracking-${slugOf(s.name)}`, `var(--type-${slugOf(s.name)}-letter-spacing)`)

  // Colours in Figma's groups: bg, text, border, accent, status, series, overlay, focus.
  const colours = withCode.filter((v) => v.type === 'COLOR')
  for (const group of [...new Set(colours.map((v) => v.name.split('/')[0]))]) {
    section(`Colours: ${group}/*`)
    for (const v of colours.filter((v) => v.name.startsWith(`${group}/`))) add(colourName(v.name), `var(${cssVar(v)})`)
  }

  section('Shadows (shadow-*) and easing curves (ease-*)')
  for (const name of shadows) add(name, `var(${name})`)
  for (const name of Object.keys(code.tokens).filter((n) => n.startsWith('--ease-'))) add(name, `var(${name})`)

  const css = `${header}

/* Import it, with tokens.css, in the CSS file that sets Tailwind up. */
@theme inline reference {
  --*: initial;
${lines.join('\n')}
}
`
  await writeFile(path, css)
  return { count: seen.size }
}
