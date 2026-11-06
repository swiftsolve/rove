/**
 * DESIGN.md's YAML front matter, rewritten on every build: the tokens in the
 * DESIGN.md format (https://github.com/google-labs-code/design.md), for tools
 * that read it. The prose below it is edited directly and left alone.
 *
 * The format holds one value per token and has no themes, so the groups hold
 * the Dark values, the default, and the `light` group holds what changes in
 * Light (`.theme-light`), under the same keys, as tokens.css's
 * :root.theme-light block does. Colours keep Rove's names, plus the
 * `primary` the format requires: the accent. Each token's use, its Figma
 * description, is a comment beside it, so the list says what each is for.
 * Every token is here: the format's groups (colours, typography, radius,
 * spacing) and, after them, Rove's own (OWN_GROUPS). The format's linter
 * warns that its export commands skip groups it doesn't know;
 * scripts/checks/design-md-format.mjs allows that warning for these alone.
 */
import { readFile, writeFile } from 'node:fs/promises'

const FENCE = '---'
const PRIMARY = 'accent-default'
/**
 * Rove's own groups, for the tokens the format has no group for: the group,
 * what it holds, and which CSS variables (by prefix) go in it. Keys in them
 * are the CSS variable without --.
 */
export const EXTRA_GROUPS = [
  ['font-size', 'Font sizes; a text style sets its own', ['font-size']],
  ['font-family', 'Font stacks', ['font-family']],
  ['font-weight', 'Font weights', ['weight']],
  ['opacity', 'Tint strengths (color-mix with transparent) and dimming', ['opacity']],
  ['layout', 'Fixed sizes and insets of the shell and cards', ['titlebar', 'rail', 'card', 'row']],
  ['shadows', 'Box shadows; Light has its own (light group)', ['shadow']],
  ['focus', 'The keyboard focus ring', ['focus']],
  ['motion', 'Durations and easing curves', ['duration', 'ease']],
]

/** The group for the Light theme's values. */
const LIGHT = 'light'

/** Every group the format doesn't know, which its linter warns its exports skip. */
export const OWN_GROUPS = [...EXTRA_GROUPS.map(([group]) => group), LIGHT]

/** Text style groups, the first segment of a style's name, in the order a type scale reads. */
const TYPE_GROUPS = ['Heading', 'Body', 'Label', 'Caption', 'Badge', 'Number']

/** `--name: value;` declarations of one rule in tokens.css, trailing comments dropped. */
function declarations(css, selector) {
  const start = css.indexOf(`${selector} {`)
  if (start === -1) throw new Error(`DESIGN.md front matter: tokens.css has no ${selector} rule`)
  const body = css.slice(start, css.indexOf('\n}', start))
  return new Map([...body.matchAll(/^\s*--([\w-]+):\s*(.+?);(?:\s*\/\*.*\*\/)?$/gm)].map(([, n, v]) => [n, v]))
}

// Keys are quoted when YAML would read them as something else (a number);
// strings are always quoted, since a colour starts with #.
const key = (k) => (/^[a-z][\w-]*$/i.test(k) ? k : JSON.stringify(k))
const scalar = (v) => (typeof v === 'number' ? String(v) : JSON.stringify(v))

/** YAML for `value`; `notes` maps a dotted path (colors.bg-base) to a comment for its line. */
function yaml(value, notes, indent = '', path = '') {
  return Object.entries(value)
    .map(([k, v]) => {
      const at = path ? `${path}.${k}` : k
      const note = notes.has(at) ? ` # ${notes.get(at)}` : ''
      return v && typeof v === 'object'
        ? `${indent}${key(k)}:${note}\n${yaml(v, notes, `${indent}  `, at)}`
        : `${indent}${key(k)}: ${scalar(v)}${note}`
    })
    .join('\n')
}

export async function writeFrontMatter({ path, variables, textStyles, shadows, slugOf, css }) {
  const root = declarations(css, ':root')
  // Light is the Dark values with its own on top, as the cascade gives it.
  const lightOnly = declarations(css, ':root.theme-light')
  const light = new Map([...root, ...lightOnly])
  /** A variable's value in a theme, with var() references followed. */
  const value = (name, theme = root) => {
    let v = theme.get(name)
    for (let m; (m = /^var\(--([\w-]+)\)$/.exec(v ?? ''));) v = theme.get(m[1])
    if (v === undefined) throw new Error(`DESIGN.md front matter: tokens.css has no --${name}`)
    return v
  }
  /** A value with every var() inside it resolved, so an expression reads as values. */
  const resolved = (name, theme = root) => {
    let v = value(name, theme)
    for (let i = 0; i < 8 && v.includes('var(--'); i++) v = v.replace(/var\(--([\w-]+)\)/g, (_, n) => value(n, theme))
    return v
  }
  const cssVars = variables.filter((v) => v.code).map((v) => ({ ...v, css: v.name.replace(/\//g, '-') }))
  const notes = new Map()
  const scale = (prefix) => {
    const vars = cssVars
      .filter((v) => v.name.startsWith(`${prefix}/`))
      .sort((a, b) => parseFloat(value(a.css)) - parseFloat(value(b.css)))
    const group = prefix === 'radius' ? 'rounded' : prefix
    for (const v of vars) notes.set(`${group}.${v.name.slice(prefix.length + 1)}`, v.description)
    return Object.fromEntries(vars.map((v) => [v.name.slice(prefix.length + 1), value(v.css)]))
  }

  const colors = { primary: value(PRIMARY) }
  notes.set('colors.primary', `The accent, --${PRIMARY}: the brand and what you act on`)
  // Grouped by name (bg, text, accent…) in Figma's order.
  const colours = cssVars.filter((v) => v.type === 'COLOR')
  const groups = [...new Set(colours.map((v) => v.name.split('/')[0]))]
  const group = (v) => groups.indexOf(v.name.split('/')[0])
  for (const v of colours.sort((a, b) => group(a) - group(b))) {
    colors[v.css] = value(v.css)
    notes.set(`colors.${v.css}`, v.description)
  }

  const typography = {}
  const typeGroup = (s) => {
    const at = TYPE_GROUPS.indexOf(s.name.split('/')[0])
    return at === -1 ? TYPE_GROUPS.length : at
  }
  // By group, then largest first; Figma lists late additions last.
  const styles = [...textStyles].sort(
    (a, b) => typeGroup(a) - typeGroup(b) || b.fontSize - a.fontSize || b.fontWeight - a.fontWeight,
  )
  for (const s of styles) {
    const slug = slugOf(s.name)
    // Figma's description ends in a "Code:" handoff note; it's kept when it says more than the class.
    const [use, handoff] = s.description.split(/\s*Code:\s*/)
    const inCode = handoff && handoff !== `.type-${slug}` ? ` In code: ${handoff}` : ''
    const upper = s.textCase === 'UPPER' ? ', uppercase' : ''
    notes.set(`typography.${slug}`, `${s.name}: ${use}${inCode} Class .type-${slug}${upper}.`)
    const tracking = value(`type-${slug}-letter-spacing`)
    typography[slug] = {
      fontFamily: (s.boundVariables?.fontFamily ? value(s.boundVariables.fontFamily.replace(/\//g, '-')) : s.fontFamily)
        .split(',')[0]
        .replace(/^'|'$/g, ''),
      fontSize: value(`type-${slug}-size`),
      fontWeight: Number(value(`type-${slug}-weight`)),
      lineHeight: Number(value(`type-${slug}-line-height`)),
      ...(tracking !== '0' && { letterSpacing: tracking }),
    }
  }

  // Rove's own groups: every other CSS variable in tokens.css, so none is left out.
  const described = new Map(cssVars.map((v) => [v.css, v.description]))
  for (const s of shadows)
    described.set(
      `shadow-${s.name
        .replace(/^Shadow\//, '')
        .toLowerCase()
        .replace(/\s+/g, '-')}`,
      s.description.replace(/\.$/, ''),
    )
  const inSpec = (name) => colours.some((v) => v.css === name) || /^(type|radius|spacing)-/.test(name)
  const extra = Object.fromEntries(EXTRA_GROUPS.map(([group]) => [group, {}]))
  for (const name of root.keys()) {
    if (inSpec(name)) continue
    const entry = EXTRA_GROUPS.find(([, , prefixes]) => prefixes.some((p) => name.startsWith(`${p}-`)))
    if (!entry) throw new Error(`DESIGN.md front matter: --${name} fits no group; add its prefix to EXTRA_GROUPS`)
    const [group] = entry
    extra[group][name] = group === 'font-family' ? value(name) : resolved(name)
    if (described.get(name)) notes.set(`${group}.${name}`, described.get(name))
  }
  for (const [group, holds] of EXTRA_GROUPS) notes.set(group, `${holds}. Keys: --<key>`)

  // What Light changes, in the order tokens.css sets it.
  const lightValues = {}
  for (const name of lightOnly.keys()) {
    const v = resolved(name, light)
    if (v !== resolved(name)) lightValues[name] = v
  }
  notes.set(
    LIGHT,
    'The Light theme (theme-light on the root): every token whose value differs from the Dark one above. Keys: --<key>',
  )
  notes.set('colors', 'Keys: --<key>')
  notes.set('typography', 'Keys: the class, .type-<key>')
  notes.set('rounded', 'Keys: --radius-<key>')
  notes.set('spacing', 'Keys: --spacing-<key>')

  const tokens = {
    version: 'alpha',
    name: 'Rove',
    description:
      "Rove's design tokens: each group at its Dark value, the default, and the light group with what changes in Light. Each is a CSS variable in tokens.css; in code, use the variable, never the value.",
    colors,
    typography,
    rounded: scale('radius'),
    spacing: scale('spacing'),
    ...extra,
    [LIGHT]: lightValues,
  }

  const current = await readFile(path, 'utf8')
  const body = current.startsWith(`${FENCE}\n`)
    ? current.slice(current.indexOf(`\n${FENCE}\n`, FENCE.length) + FENCE.length + 2)
    : current
  const comment =
    "# Generated by npm run build from the Figma export and tokens.css; don't edit it. The prose below is edited directly.\n" +
    '# Every token, at its Dark value, with its use. Each group says how a key names its CSS variable.'
  await writeFile(path, `${FENCE}\n${comment}\n${yaml(tokens, notes)}\n${FENCE}\n\n${body.replace(/^\n+/, '')}`)
  const total = Object.values(tokens).reduce((n, g) => n + (g && typeof g === 'object' ? Object.keys(g).length : 0), 0)
  return {
    colors: Object.keys(colors).length,
    typography: textStyles.length,
    light: Object.keys(lightValues).length,
    total,
  }
}
