import { Code, Joined, Name, Page, Section, Table, TableRow } from './blocks'
import { colorDark, colorIn, cssName, flatten, isUsedIn, palette, paletteColor, pointsAt, shadeOf } from './tokens'

export default { title: 'Colour' }

// The Figma page's sections, in its order, each with the tokens it lists.
const SECTIONS = [
  {
    title: 'Backgrounds',
    intro: 'Base, surface and inset, plus chrome, popover, hover and the dialog scrim. Cards use bg/surface.',
    names: ['bg.base', 'bg.chrome', 'bg.surface', 'bg.popover', 'bg.inset', 'bg.hover', 'bg.scrim'],
  },
  {
    title: 'Borders & fills',
    intro: 'Thin borders and see-through fills.',
    names: [
      'border.default',
      'fill.default',
      'fill.strong',
      'fill.selection',
      'fill.faint',
      'fill.subtle',
    ],
  },
  {
    title: 'Text',
    intro: 'Three text colours, strongest to faintest, plus on-fill for text on solid buttons.',
    names: ['text.primary', 'text.secondary', 'text.tertiary', 'text.on-fill'],
  },
  {
    title: 'Accent',
    intro: 'Use accent/fill behind white text, as on filled buttons.',
    names: [
      'accent.default',
      'accent.hover',
      'accent.press',
      'accent.muted',
      'text.accent',
      'accent.fill',
      'accent.fill-hover',
    ],
  },
  {
    title: 'Status',
    intro: 'Five capability levels, positive to negative. The negative fills are for the Stop button.',
    names: [
      'status.positive',
      'status.good',
      'status.warning',
      'status.poor',
      'status.negative',
      'status.negative-fill',
      'status.negative-fill-hover',
      'text.positive',
      'text.good',
      'text.warning',
      'text.poor',
      'text.negative',
    ],
  },
  {
    title: 'Data series',
    intro: 'Chart colours: blue for download, violet for upload.',
    names: ['series.down', 'series.up'],
  },
  {
    title: 'Focus',
    intro: 'Keyboard focus ring, 1px with a 2px offset.',
    names: ['focus.ring'],
  },
  {
    title: 'Shadow colours',
    intro: 'The colours behind the shadow styles. Softer in Light mode.',
    names: ['shadow-color.panel-1', 'shadow-color.panel-2', 'shadow-color.raised', 'shadow-color.popover-1', 'shadow-color.popover-2'],
  },
]

const COLUMNS = [
  ['Token', 'minmax(180px, 2.5fr)'],
  ['Dark', 'minmax(170px, 1.45fr)'],
  ['Light', 'minmax(170px, 1.45fr)'],
  ['Code', 'minmax(180px, 1fr)'],
]

const hexText = ({ hex }) => hex.toUpperCase()

// The hex, with its alpha after a dot when it's see-through.
function ShadeValue({ shade }) {
  const alpha = shade.alpha ?? 1
  return alpha < 1 ? <Joined parts={[hexText(shade), `${Math.round(alpha * 100)}%`]} /> : hexText(shade)
}

// A colour in one theme, on that theme's surface. Text shows as text, on the
// surface it's read on (on-fill on accent/fill); everything else as a fill.
function ModeCell({ theme, path }) {
  const shade = shadeOf(theme, `{${path.join('.')}}`)
  const color = paletteColor(shade)
  const isText = path[0] === 'text'
  const surface = path[1] === 'on-fill' ? colorIn(theme, 'accent.fill') : colorIn(theme, 'bg.surface')
  return (
    <span className="mode">
      <span
        className="mode-frame"
        style={{ background: colorIn(theme, 'bg.surface'), borderColor: colorIn(theme, 'border.default') }}
      >
        {isText ? (
          <span className="mode-text" style={{ color, background: surface }}>
            Aa
          </span>
        ) : (
          <span className="mode-fill" style={{ background: color }} />
        )}
      </span>
      <span className="mode-value">
        <span>
          <ShadeValue shade={shade} />
        </span>
        <span className="mode-ref">→ {pointsAt(theme, path)}</span>
      </span>
    </span>
  )
}

// The shadow colours aren't CSS variables; they live inside the shadow tokens.
const codeFor = (path) =>
  path[0] === 'shadow-color'
    ? `in var(--shadow-${path[1].replace(/-\d$/, '')})`
    : `var(${cssName(path)})`

function ColourTable({ names }) {
  const tokens = flatten(colorDark)
  return (
    <Table columns={COLUMNS}>
      {names.map((name) => {
        const path = name.split('.')
        const token = tokens.find((candidate) => candidate.path.join('.') === name)
        return (
          <TableRow key={name}>
            <Name name={path.join('/')} description={token?.$description} />
            <ModeCell theme="dark" path={path} />
            <ModeCell theme="light" path={path} />
            <Code copy={codeFor(path).replace(/^in /, '')}>{codeFor(path)}</Code>
          </TableRow>
        )
      })}
    </Table>
  )
}

// A hue's shades: the solid ramp, then the see-through shades on a line of
// their own. A see-through shade sits on the backdrop of the theme that uses
// it: dark for Dark only, unless it's black, which only shows on white.
function Family({ name, rows }) {
  return (
    <div className="family">
      <p className="family-name">{name}</p>
      {rows.map((shades) => (
        <div key={shades[0].label} className="swatches">
          {shades.map(({ label, token }) => {
            const color = paletteColor(token.$value)
            const isAlpha = (token.$value.alpha ?? 1) < 1
            const isDarkOnly = isUsedIn('dark', token.path) && !isUsedIn('light', token.path)
            const isOnDark = isDarkOnly && token.$value.hex !== '#000000'
            const backdrop = isOnDark ? colorIn('dark', 'bg.base') : '#ffffff'
            return (
              <div key={label} className="swatch">
                <span
                  className="swatch-color"
                  style={{ background: isAlpha ? `linear-gradient(${color}, ${color}), ${backdrop}` : color }}
                />
                <span className="swatch-name">{label}</span>
                <span className="swatch-hex">{hexText(token.$value)}</span>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// A family per hue, as on the Figma page. See-through shades (`neutral/850-a10`)
// follow the solid ones, by base shade, then opacity.
function PaletteGrid() {
  const shades = flatten(palette).map((token) => {
    const [base, alpha] = token.path[1].split('-a')
    return { label: token.path[1], token, hue: token.path[0], base: Number(base), alpha: Number(alpha ?? 0) }
  })
  const hues = [...new Set(shades.map(({ hue }) => hue))]
  return hues.map((hue) => {
    const own = shades.filter((shade) => shade.hue === hue)
    const solid = own.filter(({ alpha }) => !alpha)
    const seeThrough = own.filter(({ alpha }) => alpha).sort((a, b) => a.base - b.base || a.alpha - b.alpha)
    return <Family key={hue} name={hue} rows={[solid, seeThrough].filter((row) => row.length)} />
  })
}

export const Colour = {
  render: () => (
    <Page title="Colour" intro="Palette shades, and the semantic tokens that point at them, in Dark and Light.">
      <Section title="Palette" intro="Every colour the tokens point at. Higher numbers are darker; -a is opacity.">
        <PaletteGrid />
      </Section>
      {SECTIONS.map(({ title, intro, names }) => (
        <Section key={title} title={title} intro={intro}>
          <ColourTable names={names} />
        </Section>
      ))}
    </Page>
  ),
}
