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
const yamlKey = (k) => (/^[a-z][\w-]*$/i.test(k) ? k : JSON.stringify(k))
const yamlScalar = (v) => (typeof v === 'number' ? String(v) : JSON.stringify(v))

/** YAML for `value`; `notes` maps a dotted path (colors.bg-base) to a comment for its line. */
function formatYaml(value, notes, indent = '', path = '') {
  return Object.entries(value)
    .map(([k, v]) => {
      const keyPath = path ? `${path}.${k}` : k
      const note = notes.has(keyPath) ? ` # ${notes.get(keyPath)}` : ''
      return v && typeof v === 'object'
        ? `${indent}${yamlKey(k)}:${note}\n${formatYaml(v, notes, `${indent}  `, keyPath)}`
        : `${indent}${yamlKey(k)}: ${yamlScalar(v)}${note}`
    })
    .join('\n')
}

export async function writeFrontMatter({ path, variables, textStyles, shadows, slugOf, css }) {
  const root = declarations(css, ':root')
  // Light is the Dark values with its own on top, as the cascade gives it.
  const lightOnly = declarations(css, ':root.theme-light')
  const light = new Map([...root, ...lightOnly])
  /** A variable's value in a theme, with var() references followed. */
  const tokenValue = (name, theme = root) => {
    const bareReference = /^var\(--([\w-]+)\)$/
    let v = theme.get(name)
    let reference = bareReference.exec(v ?? '')
    while (reference) {
      v = theme.get(reference[1])
      reference = bareReference.exec(v ?? '')
    }
    if (v === undefined) throw new Error(`DESIGN.md front matter: tokens.css has no --${name}`)
    return v
  }
  /** A value with every var() inside it resolved, so an expression reads as values. */
  const fullyResolvedValue = (name, theme = root) => {
    let v = tokenValue(name, theme)
    // Eight rounds is far more than any real nesting.
    for (let i = 0; i < 8 && v.includes('var(--'); i++)
      v = v.replace(/var\(--([\w-]+)\)/g, (_, referenced) => tokenValue(referenced, theme))
    return v
  }
  const cssVars = variables.filter((v) => v.code).map((v) => ({ ...v, css: v.name.replace(/\//g, '-') }))
  const notes = new Map()
  /** One of the format's size scales (rounded, spacing), smallest first. */
  const scaleGroup = (prefix) => {
    const vars = cssVars
      .filter((v) => v.name.startsWith(`${prefix}/`))
      .sort((a, b) => parseFloat(tokenValue(a.css)) - parseFloat(tokenValue(b.css)))
    const group = prefix === 'radius' ? 'rounded' : prefix
    for (const v of vars) notes.set(`${group}.${v.name.slice(prefix.length + 1)}`, v.description)
    return Object.fromEntries(vars.map((v) => [v.name.slice(prefix.length + 1), tokenValue(v.css)]))
  }

  const colors = { primary: tokenValue(PRIMARY) }
  notes.set('colors.primary', `The accent, --${PRIMARY}: the brand and what you act on`)
  // Grouped by name (bg, text, accent…) in Figma's order.
  const colours = cssVars.filter((v) => v.type === 'COLOR')
  const colourGroups = [...new Set(colours.map((v) => v.name.split('/')[0]))]
  const colourGroupOrder = (v) => colourGroups.indexOf(v.name.split('/')[0])
  for (const v of colours.sort((a, b) => colourGroupOrder(a) - colourGroupOrder(b))) {
    colors[v.css] = tokenValue(v.css)
    notes.set(`colors.${v.css}`, v.description)
  }

  const typography = {}
  // A group TYPE_GROUPS doesn't list goes last.
  const typeGroupOrder = (s) => {
    const index = TYPE_GROUPS.indexOf(s.name.split('/')[0])
    return index === -1 ? TYPE_GROUPS.length : index
  }
  // By group, then largest first; Figma lists late additions last.
  const styles = [...textStyles].sort(
    (a, b) => typeGroupOrder(a) - typeGroupOrder(b) || b.fontSize - a.fontSize || b.fontWeight - a.fontWeight,
  )
  for (const s of styles) {
    const slug = slugOf(s.name)
    // Figma's description ends in a "Code:" handoff note; it's kept when it says more than the class.
    const [use, handoff] = s.description.split(/\s*Code:\s*/)
    const handoffNote = handoff && handoff !== `.type-${slug}` ? ` In code: ${handoff.replace(/\.?$/, '.')}` : ''
    const uppercaseNote = s.textCase === 'UPPER' ? ', uppercase' : ''
    notes.set(`typography.${slug}`, `${s.name}: ${use}${handoffNote} Class .type-${slug}${uppercaseNote}.`)
    const tracking = tokenValue(`type-${slug}-letter-spacing`)
    const fontStack = s.boundVariables?.fontFamily
      ? tokenValue(s.boundVariables.fontFamily.replace(/\//g, '-'))
      : s.fontFamily
    typography[slug] = {
      // The stack's first family, unquoted.
      fontFamily: fontStack.split(',')[0].replace(/^'|'$/g, ''),
      fontSize: tokenValue(`type-${slug}-size`),
      fontWeight: Number(tokenValue(`type-${slug}-weight`)),
      lineHeight: Number(tokenValue(`type-${slug}-line-height`)),
      ...(tracking !== '0' && { letterSpacing: tracking }),
    }
  }

  // Rove's own groups: every other CSS variable in tokens.css, so none is left out.
  const descriptionByName = new Map(cssVars.map((v) => [v.css, v.description]))
  for (const s of shadows)
    descriptionByName.set(
      `shadow-${s.name
        .replace(/^Shadow\//, '')
        .toLowerCase()
        .replace(/\s+/g, '-')}`,
      s.description.replace(/\.$/, ''),
    )
  const isInFormatGroup = (name) => colours.some((v) => v.css === name) || /^(type|radius|spacing)-/.test(name)
  const extraGroups = Object.fromEntries(EXTRA_GROUPS.map(([group]) => [group, {}]))
  for (const name of root.keys()) {
    if (isInFormatGroup(name)) continue
    const entry = EXTRA_GROUPS.find(([, , prefixes]) => prefixes.some((p) => name.startsWith(`${p}-`)))
    if (!entry) throw new Error(`DESIGN.md front matter: --${name} fits no group; add its prefix to EXTRA_GROUPS`)
    const [group] = entry
    extraGroups[group][name] = group === 'font-family' ? tokenValue(name) : fullyResolvedValue(name)
    if (descriptionByName.get(name)) notes.set(`${group}.${name}`, descriptionByName.get(name))
  }
  for (const [group, holds] of EXTRA_GROUPS) notes.set(group, `${holds}. Keys: --<key>`)

  // What Light changes, in the order tokens.css sets it.
  const lightValues = {}
  for (const name of lightOnly.keys()) {
    const lightValue = fullyResolvedValue(name, light)
    if (lightValue !== fullyResolvedValue(name)) lightValues[name] = lightValue
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
    rounded: scaleGroup('radius'),
    spacing: scaleGroup('spacing'),
    ...extraGroups,
    [LIGHT]: lightValues,
  }

  // Keep what follows the current front matter's closing fence: the prose.
  const current = await readFile(path, 'utf8')
  const closingFence = `\n${FENCE}\n`
  const body = current.startsWith(`${FENCE}\n`)
    ? current.slice(current.indexOf(closingFence, FENCE.length) + closingFence.length)
    : current
  const comment =
    "# Generated by npm run build from the Figma export and tokens.css; don't edit it. The prose below is edited directly.\n" +
    '# Every token, at its Dark value, with its use. Each group says how a key names its CSS variable.'
  await writeFile(path, `${FENCE}\n${comment}\n${formatYaml(tokens, notes)}\n${FENCE}\n\n${body.replace(/^\n+/, '')}`)
  // Every key of every group; version, name and description are no group.
  const total = Object.values(tokens).reduce(
    (sum, group) => sum + (group && typeof group === 'object' ? Object.keys(group).length : 0),
    0,
  )
  return {
    colors: Object.keys(colors).length,
    typography: textStyles.length,
    light: Object.keys(lightValues).length,
    total,
  }
}
