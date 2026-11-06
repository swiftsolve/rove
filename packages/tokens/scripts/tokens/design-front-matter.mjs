/**
 * DESIGN.md's YAML front matter, rewritten on every build: the tokens in the
 * DESIGN.md format (https://github.com/google-labs-code/design.md), for tools
 * that read it. The prose below it is edited directly and left alone.
 *
 * The format holds one value per token, so the values are the Dark theme's,
 * the default; Light is in tokens.css. Colours keep Rove's names, plus the
 * `primary` the format requires: the accent. Each token's use, its Figma
 * description, is a comment beside it, so the list says what each is for.
 * Only the format's groups are here (colours, typography, radius, spacing);
 * the rest are in tokens.css, each with its use as a comment.
 */
import { readFile, writeFile } from 'node:fs/promises'

const FENCE = '---'
const PRIMARY = 'accent-default'
/** Text style groups, the first segment of a style's name, in the order a type scale reads. */
const TYPE_GROUPS = ['Heading', 'Body', 'Label', 'Caption', 'Badge', 'Number']

/** `--name: value;` declarations of :root in tokens.css, trailing comments dropped. */
function rootDeclarations(css) {
  const start = css.indexOf(':root {')
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

export async function writeFrontMatter({ path, variables, textStyles, slugOf, css }) {
  const root = rootDeclarations(css)
  /** A variable's value with var() references followed. */
  const value = (name) => {
    let v = root.get(name)
    for (let m; (m = /^var\(--([\w-]+)\)$/.exec(v ?? ''));) v = root.get(m[1])
    if (v === undefined) throw new Error(`DESIGN.md front matter: tokens.css has no --${name}`)
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

  const tokens = {
    version: 'alpha',
    name: 'Rove',
    description:
      "Rove's design tokens, at their Dark theme values; Light, and each token's CSS variable, are in tokens.css. In code, use the variables, never these values.",
    colors,
    typography,
    rounded: scale('radius'),
    spacing: scale('spacing'),
  }

  const current = await readFile(path, 'utf8')
  const body = current.startsWith(`${FENCE}\n`)
    ? current.slice(current.indexOf(`\n${FENCE}\n`, FENCE.length) + FENCE.length + 2)
    : current
  const comment =
    "# Generated by npm run build from the Figma export and tokens.css; don't edit it. The prose below is edited directly.\n" +
    '# Keys are the CSS variables without --: bg-base is var(--bg-base), and a text style is its class, .type-<key>.'
  await writeFile(path, `${FENCE}\n${comment}\n${yaml(tokens, notes)}\n${FENCE}\n\n${body.replace(/^\n+/, '')}`)
  return { colors: Object.keys(colors).length, typography: textStyles.length }
}
