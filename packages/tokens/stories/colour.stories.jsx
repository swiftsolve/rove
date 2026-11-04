import figmaVariables from '../src/figma/variables.json'
import backgrounds from './backgrounds.png'
import { Code, Joined, Name, Page, Section, Table, TableRow } from './blocks'
import { colorDark, colorIn, cssName, flatten, isUsedIn, palette, paletteColor, pointsAt, shadeOf } from './tokens'

export default { title: 'Colour' }

// The Figma page's sections, in its order, each with the tokens it lists.
const SECTIONS = [
  {
    title: 'Backgrounds',
    intro:
      'Base, surface and inset, plus chrome, popover, hover and the dialog scrim. Cards use bg/surface. Diagram at actual size.',
    names: ['bg.base', 'bg.chrome', 'bg.surface', 'bg.popover', 'bg.inset', 'bg.hover', 'bg.scrim'],
    diagram: (
      <img
        className="diagram"
        src={backgrounds}
        width={1280}
        height={1470}
        alt="A window wireframe in Dark and Light, alone and under the dialog scrim, each background labelled"
      />
    ),
  },
  {
    title: 'Borders & fills',
    intro: 'Thin borders and see-through fills.',
    names: ['border.default', 'fill.default', 'fill.strong', 'fill.selection', 'fill.faint', 'fill.subtle'],
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
    intro: 'The colours inside the shadow tokens, softer in Light. They aren’t CSS variables: use the shadow.',
    names: [
      'shadow-color.panel-1',
      'shadow-color.panel-2',
      'shadow-color.raised',
      'shadow-color.popover-1',
      'shadow-color.popover-2',
    ],
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

// The shadow colours aren't CSS variables; each lives inside a shadow token, which is what code uses.
const shadowFor = (path) => `var(--shadow-${path[1].replace(/-\d$/, '')})`

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
            <Code>{path[0] === 'shadow-color' ? shadowFor(path) : `var(${cssName(path)})`}</Code>
          </TableRow>
        )
      })}
    </Table>
  )
}

// A hue's shades: the solid ramp, then the see-through shades on a line of
// their own. A see-through shade sits on the backdrop of the theme that uses
// it: dark for Dark only, unless it's black, which only shows on white.
function Family({ name, rows, captions }) {
  return (
    <div className="family">
      <p className="family-name">{name}</p>
      {rows.map((shades, index) => (
        <div key={shades[0].label} className="swatch-row">
          {captions && <p className="swatch-row-caption">{captions[index]}</p>}
          <div className="swatches">
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
        </div>
      ))}
    </div>
  )
}

// What each row is for, in the families that have both, as the Figma page captions them.
const ROW_CAPTIONS = {
  neutral: ['Solid: backgrounds, text', 'See-through: fills, borders, shadows, scrim'],
  blue: ['Solid: accent, chart series', 'See-through: muted accent, selection'],
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
    const rows = [solid, seeThrough].filter((row) => row.length)
    return <Family key={hue} name={hue} rows={rows} captions={rows.length > 1 ? ROW_CAPTIONS[hue] : undefined} />
  })
}

// Figma's Icon tone and Capability level collections: one variable each, a mode
// per colour. They have no CSS of their own, so they're read from the export.
const ICON_TONES = ['Primary', 'Secondary', 'Tertiary', 'Accent', 'Positive', 'Negative', 'On fill']
const LEVELS = ['Excellent', 'Good', 'Fair', 'Poor', 'Unsupported']

const modeAliases = (name) => figmaVariables.variables.find((variable) => variable.name === name).values

// The pages' sample icons, Icon/activity and Icon/hd, on a 24px grid.
function Glyph({ children, color }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

const ActivityIcon = ({ color }) => (
  <Glyph color={color}>
    <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />
  </Glyph>
)

const HdIcon = ({ color }) => (
  <Glyph color={color}>
    <path d="M3.375 6.5v11M9.975 6.5v11M3.375 12h6.6" />
    <path d="M13.475 6.5h2.2c2.733 0 4.95 2.462 4.95 5.5s-2.217 5.5-4.95 5.5h-2.2z" />
  </Glyph>
)

// A mode collection in both themes, as Figma's preview frames show it: each
// mode's glyph over its name, on the theme's base. On fill sits on a tile.
function ModePanels({ variable, modes, Glyph, isLabelClose = false }) {
  const aliases = modeAliases(variable)
  return (
    <div className="mode-panels">
      {['dark', 'light'].map((theme) => (
        <div key={theme} className="mode-panel" style={{ background: colorIn(theme, 'bg.base') }}>
          <p className="mode-panel-label" style={{ color: colorIn(theme, 'text.tertiary') }}>
            {theme}
          </p>
          <div className="mode-panel-examples">
            {modes.map((mode) => {
              const color = colorIn(theme, aliases[mode].alias.replace('/', '.'))
              return (
                <div key={mode} className={`mode-example${isLabelClose ? ' is-label-close' : ''}`}>
                  {mode === 'On fill' ? (
                    <span className="mode-tile" style={{ background: colorIn(theme, 'accent.fill') }}>
                      <Glyph color={color} />
                    </span>
                  ) : (
                    <Glyph color={color} />
                  )}
                  <span className="mode-example-name" style={{ color: colorIn(theme, 'text.tertiary') }}>
                    {mode}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

export const Colour = {
  render: () => (
    <Page title="Colour" intro="Palette shades, and the semantic tokens that point at them, in Dark and Light.">
      <Section title="Palette" intro="Every colour the tokens point at. Higher numbers are darker; -a is opacity.">
        <PaletteGrid />
      </Section>
      {SECTIONS.map(({ title, intro, names, diagram }) => (
        <Section key={title} title={title} intro={intro}>
          {diagram}
          <ColourTable names={names} />
        </Section>
      ))}
      <Section title="Icon tone" intro="Set the mode on the icon’s parent frame, so swapped icons keep the colour.">
        <ModePanels variable="icon/color" modes={ICON_TONES} Glyph={ActivityIcon} />
      </Section>
      <Section
        title="Capability level"
        intro="Colours capability glyphs through level/color. Set it on any frame above the glyph."
      >
        <ModePanels variable="level/color" modes={LEVELS} Glyph={HdIcon} isLabelClose />
      </Section>
      <Section title="Contrast" intro="WCAG 2.2 AA in both themes: text 4.5:1, icons and bars 3:1." />
    </Page>
  ),
}
