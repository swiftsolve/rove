import './colour.css'

import effectStyles from '../src/figma/effect-styles.json'
import figmaVariables from '../src/figma/variables.json'
import backgrounds from './assets/backgrounds.png'
import backgroundsDark from './assets/backgrounds-dark.png'
import { Code, Group, Joined, Name, Page, Section, Table, TableRow } from './blocks'
import {
  code,
  colorDark,
  colorIn,
  cssVariableName,
  flatten,
  isUsedIn,
  palette,
  paletteColor,
  shadeOf,
  shadowIn,
  targetFigmaName,
} from './tokens'

export default { title: 'Colour' }

const BACKGROUNDS_ALT =
  'A window wireframe in Dark and Light, alone and under the dialog scrim, each background labelled'

// The Figma page's sections, in its order, each with the tokens it lists.
const SECTIONS = [
  {
    title: 'Backgrounds',
    intro:
      'Base, surface and inset, plus chrome, popover, hover and the dialog scrim. Cards use bg/surface. Diagram at actual size.',
    names: ['bg.base', 'bg.chrome', 'bg.surface', 'bg.popover', 'bg.inset', 'bg.hover', 'bg.scrim'],
    // Figma's labels are dark ink for its white page, so the Dark theme shows
    // a copy with the ink outside the wireframes turned light.
    diagram: (
      <>
        <img
          className="diagram diagram-for-dark"
          src={backgroundsDark}
          width={1280}
          height={1471}
          alt={BACKGROUNDS_ALT}
        />
        <img className="diagram diagram-for-light" src={backgrounds} width={1280} height={1471} alt={BACKGROUNDS_ALT} />
      </>
    ),
  },
  {
    title: 'Borders & overlays',
    intro: 'Thin borders and see-through overlays.',
    names: [
      'border.default',
      'border.subtle',
      'overlay.default',
      'overlay.strong',
      'overlay.selection',
      'overlay.faint',
      'overlay.subtle',
      'overlay.hover',
    ],
  },
  {
    title: 'Text',
    intro: 'Three text colours, strongest to faintest, plus on-solid for text on solid buttons.',
    names: ['text.primary', 'text.secondary', 'text.tertiary', 'text.on-solid'],
  },
  {
    title: 'Accent',
    intro: 'Use accent/solid behind white text, as on solid buttons.',
    names: [
      'accent.default',
      'accent.hover',
      'accent.press',
      'accent.muted',
      'text.accent',
      'accent.solid',
      'accent.solid-hover',
    ],
  },
  {
    title: 'Status',
    intro: 'Five capability levels, positive to negative. The negative solids are for the Stop button.',
    names: [
      'status.positive',
      'status.good',
      'status.warning',
      'status.poor',
      'status.negative',
      'status.negative-solid',
      'status.negative-solid-hover',
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
    title: 'Devices',
    intro: 'Device tiles, one hue per group of device kinds.',
    names: ['device.network', 'device.personal', 'device.entertainment', 'device.smart-home'],
  },
  {
    title: 'Focus',
    intro: 'Keyboard focus ring, 1px with a 2px offset.',
    names: ['focus.ring'],
  },
  {
    title: 'Shadow colours',
    intro: 'Each shadow on a card, with its colours. Softer in Light mode.',
    shadows: ['panel', 'raised', 'popover'],
  },
]

const COLUMNS = [
  ['Token', 'minmax(180px, 2.5fr)'],
  ['Dark', 'minmax(170px, 1.45fr)'],
  ['Light', 'minmax(170px, 1.45fr)'],
  ['Code', 'minmax(180px, 1fr)'],
]

const formatHex = ({ hex }) => hex.toUpperCase()

// The hex, with its alpha after a dot when it's see-through.
function ShadeValue({ shade }) {
  const alpha = shade.alpha ?? 1
  return alpha < 1 ? <Joined parts={[formatHex(shade), `${Math.round(alpha * 100)}%`]} /> : formatHex(shade)
}

// A colour in one theme, on that theme's surface. Text shows as text, on the
// surface it's read on (on-solid on accent/solid); everything else as a swatch.
function ModeCell({ theme, path }) {
  const shade = shadeOf(theme, `{${path.join('.')}}`)
  const color = paletteColor(shade)
  const isText = path[0] === 'text'
  const surface = path[1] === 'on-solid' ? colorIn(theme, 'accent.solid') : colorIn(theme, 'bg.surface')
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
          <span className="mode-swatch" style={{ background: color }} />
        )}
      </span>
      <span className="mode-value">
        <span>
          <ShadeValue shade={shade} />
        </span>
        <span className="mode-ref">→ {targetFigmaName(theme, path)}</span>
      </span>
    </span>
  )
}

// A shadow in one theme: a card on the theme's backdrop, drawn with the
// shadow, then each layer's colour. A shadow of two layers names them by the
// end of their colour's name: shadow-color/panel-contact is Contact.
function ShadowModeCell({ theme, name }) {
  const layers = [code[`shadow-${name}`].$value].flat()
  const layerLabel = (color) => {
    const end = color.slice(1, -1).split('.')[1].split('-')[1]
    return end[0].toUpperCase() + end.slice(1)
  }
  return (
    <span className="mode">
      <span
        className="mode-frame mode-frame-shadow"
        style={{ background: colorIn(theme, 'bg.base'), borderColor: colorIn(theme, 'border.default') }}
      >
        <span
          className="mode-swatch"
          style={{ background: colorIn(theme, 'bg.surface'), boxShadow: shadowIn(theme, `shadow-${name}`) }}
        />
      </span>
      <span className="mode-value">
        {layers.map(({ color }) => {
          const shade = shadeOf(theme, color)
          const alpha = Math.round((shade.alpha ?? 1) * 100)
          const parts = [formatHex(shade), `${alpha}%`]
          return (
            <span key={color} className="mode-layer">
              <Joined parts={layers.length > 1 ? [layerLabel(color), ...parts] : parts} />
              <span className="mode-ref">→ {targetFigmaName(theme, color.slice(1, -1).split('.'))}</span>
            </span>
          )
        })}
      </span>
    </span>
  )
}

/** A shadow style's name and its Figma description, without the full stop. */
function shadowStyle(name) {
  const styleName = `Shadow/${name[0].toUpperCase()}${name.slice(1)}`
  const style = effectStyles.styles.find((candidate) => candidate.name === styleName)
  return { styleName, description: style.description.replace(/\.$/, '') }
}

// One row per shadow, as the Figma page has it.
function ShadowTable({ shadows }) {
  return (
    <Table columns={COLUMNS}>
      {shadows.map((name) => {
        const { styleName, description } = shadowStyle(name)
        return (
          <TableRow key={name}>
            <Name name={styleName} description={description} />
            <ShadowModeCell theme="dark" name={name} />
            <ShadowModeCell theme="light" name={name} />
            <Code>var(--shadow-{name})</Code>
          </TableRow>
        )
      })}
    </Table>
  )
}

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
            <Code>var({cssVariableName(path)})</Code>
          </TableRow>
        )
      })}
    </Table>
  )
}

// What a see-through shade does to whatever is under it, as the Figma page
// captions it: white lightens, near-black and black darken, a hue tints.
function seeThroughEffect(label) {
  const [base, alpha] = label.split('-a')
  let verb = 'Tint'
  if (base === '0') verb = 'Lighten'
  if (base === '850' || base === '1000') verb = 'Darken'
  return `${verb} ${alpha}%`
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
              const isSeeThrough = (token.$value.alpha ?? 1) < 1
              const isDarkOnly = isUsedIn('dark', token.path) && !isUsedIn('light', token.path)
              const isOnDark = isDarkOnly && token.$value.hex !== '#000000'
              const backdrop = isOnDark ? colorIn('dark', 'bg.base') : '#ffffff'
              return (
                <div key={label} className="swatch">
                  <span
                    className="swatch-color"
                    style={{ background: isSeeThrough ? `linear-gradient(${color}, ${color}), ${backdrop}` : color }}
                  />
                  <span className="swatch-name">{label}</span>
                  <span className="swatch-hex">{isSeeThrough ? seeThroughEffect(label) : formatHex(token.$value)}</span>
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
  neutral: ['Solid: backgrounds, text', 'See-through: overlays, borders, shadows, scrim'],
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
    const hueShades = shades.filter((shade) => shade.hue === hue)
    const solid = hueShades.filter(({ alpha }) => !alpha)
    const seeThrough = hueShades.filter(({ alpha }) => alpha).sort((a, b) => a.base - b.base || a.alpha - b.alpha)
    const rows = [solid, seeThrough].filter((row) => row.length)
    return <Family key={hue} name={hue} rows={rows} captions={rows.length > 1 ? ROW_CAPTIONS[hue] : undefined} />
  })
}

// Figma's Icon tone and Capability level collections: one variable each, a mode
// per colour. They have no CSS of their own, so they're read from the export.
const ICON_TONES = ['Primary', 'Secondary', 'Tertiary', 'Accent', 'Positive', 'Negative', 'On solid']
const CAPABILITY_LEVELS = ['Excellent', 'Good', 'Fair', 'Poor', 'Unsupported']

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
// mode's glyph over its name, on the theme's base. On solid sits on a tile.
function ModePanels({ variableName, modes, ModeIcon, isLabelClose = false }) {
  const aliases = modeAliases(variableName)
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
                  {mode === 'On solid' ? (
                    <span className="mode-tile" style={{ background: colorIn(theme, 'accent.solid') }}>
                      <ModeIcon color={color} />
                    </span>
                  ) : (
                    <ModeIcon color={color} />
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
    <Page title="Colour" intro="Primitive shades, and the semantic tokens that point at them, in Dark and Light.">
      <Group
        title="Primitive tokens"
        intro="The raw shades, named by hue and darkness."
        warning="Use a semantic token, not a primitive."
      >
        <Section
          title="Palette"
          intro={[
            'The shades the tokens point at.',
            'Darkness = number ÷ 10: blue/450 is 45% dark, so 55% OKLCH lightness.',
            '-a adds opacity: neutral/850-a10 is 10%.',
          ]}
        >
          <PaletteGrid />
        </Section>
      </Group>
      <Group title="Semantic tokens" intro="What you use, each named for its job.">
        {SECTIONS.map(({ title, intro, names, shadows, diagram }) => (
          <Section key={title} title={title} intro={intro}>
            {diagram}
            {shadows ? <ShadowTable shadows={shadows} /> : <ColourTable names={names} />}
          </Section>
        ))}
        <Section title="Icon tone" intro="Set the mode on the icon’s parent frame, so swapped icons keep the colour.">
          <ModePanels variableName="icon/color" modes={ICON_TONES} ModeIcon={ActivityIcon} />
        </Section>
        <Section
          title="Capability level"
          intro="Colours capability glyphs through level/color. Set it on any frame above the glyph."
        >
          <ModePanels variableName="level/color" modes={CAPABILITY_LEVELS} ModeIcon={HdIcon} isLabelClose />
        </Section>
        <Section title="Contrast" intro="WCAG 2.2 AA in both themes: text 4.5:1, icons and bars 3:1." />
      </Group>
    </Page>
  ),
}
