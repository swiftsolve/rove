import { Code, Codes, Joined, Name, Page, Section, Table, TableRow } from './blocks'
import { code, colorIn, cssName, group, layout, opacity, shadowIn, spacing } from './tokens'
import windowLayout from './window-layout.png'

export default { title: 'Spacing, radius & effects' }

// The Figma page's notes on each token.
const SPACING_USES = {
  2: 'Meter gaps',
  4: 'Arrow to value, badge padding',
  6: 'Dot to label',
  8: 'Icon to title',
  10: 'Between cards',
  12: 'Content top inset',
  14: 'Card padding',
  16: 'Between readouts',
  20: 'Content bottom inset',
}

const RADIUS_USES = {
  xs: 'Window buttons',
  sm: 'Buttons, icon tiles, inputs',
  md: 'Nav items',
  lg: 'Cards',
  full: 'Badges and pills',
}

const OPACITY_ORDER = ['tint-xs', 'tint-sm', 'tint-md', 'tint-lg', 'tint-xl', 'disabled', 'high']

// The four depth levels: what each sits on, and the shadow, border and radius it takes.
const LEVELS = [
  { name: 'Base', use: 'Window', background: 'bg/base' },
  { name: 'Panel', use: 'Cards. Shadow/Raised on hover', background: 'bg/surface', shadow: 'panel', radius: 'lg' },
  {
    name: 'Popover',
    use: 'Tooltips, menus',
    background: 'bg/popover',
    shadow: 'popover',
    border: 'border/default',
    radius: 'sm',
  },
  {
    name: 'Dialog',
    use: 'Over bg/scrim',
    background: 'bg/surface',
    shadow: 'raised',
    border: 'border/default',
    radius: 'lg',
    isOverScrim: true,
  },
]

// A Layout token's size: px('titlebar', 'height') is 56px.
const px = (...path) => `${path.reduce((node, key) => node[key], layout).$value.value}px`

const WINDOW_LAYOUT = [
  {
    element: 'Title bar',
    size: `${px('titlebar', 'height')} tall`,
    notes: 'Brand left, controls right',
    codes: ['--titlebar-height'],
  },
  {
    element: 'Navigation rail',
    size: '62px wide + 1px border',
    notes: `${px('rail', 'item-size')} items, 12px apart`,
    codes: ['--rail-item-size', '--spacing-12'],
  },
  {
    element: 'Content area',
    size: <Joined parts={['12px sides', '12px top', '20px bottom']} />,
    notes: 'Matches the rail inset',
    codes: ['--spacing-12', '--spacing-20'],
  },
  { element: 'Page header', size: '12px below the divider', notes: 'Every page but Home', codes: ['--spacing-12'] },
  {
    element: 'Cards',
    size: <Joined parts={['10px apart', '14px padding']} />,
    notes: 'bg/surface, radius/lg, Shadow/Panel',
    codes: ['--spacing-10', '--card-padding'],
  },
  {
    element: 'Card header',
    size: `${px('card', 'header-height')} tall`,
    notes: 'Titles line up across cards',
    codes: ['--card-header-height'],
  },
  { element: 'Data row', size: '8px above and below', notes: 'No outer padding in a list', codes: ['--row-padding-y'] },
]

function SpacingTable() {
  return (
    <Table
      columns={[
        ['Token', '1fr'],
        ['Value', '0.4fr'],
        ['Scale', '1.3fr'],
        ['Typical use', '1.9fr'],
        ['Code', 'minmax(140px, 1fr)'],
      ]}
    >
      {group(spacing, 'spacing').map((token) => {
        const name = cssName(token.path)
        return (
          <TableRow key={name}>
            <Name name={token.path.join('/')} />
            <span className="mono">{token.$value.value}px</span>
            <span className="scale" style={{ width: `var(${name})` }} />
            <span>{SPACING_USES[token.$value.value]}</span>
            <Code>var({name})</Code>
          </TableRow>
        )
      })}
    </Table>
  )
}

function Radii() {
  return (
    <div className="cards cards-five">
      {group(spacing, 'radius').map((token) => {
        const name = cssName(token.path)
        return (
          <div key={name} className="doc-card">
            <span
              className={token.path[1] === 'full' ? 'radius-sample radius-sample-wide' : 'radius-sample'}
              style={{ borderRadius: `var(${name})` }}
            />
            <span className="doc-card-title">{token.path.join('/')}</span>
            <span className="mono">{token.$value.value}px</span>
            <span className="doc-card-text">{RADIUS_USES[token.path[1]]}</span>
            <Code>var({name})</Code>
          </div>
        )
      })}
    </div>
  )
}

// A level in one theme: a surface on that theme's backdrop, as Figma's samples are.
function LevelSample({ theme, level }) {
  const base = colorIn(theme, 'bg.base')
  const scrim = colorIn(theme, 'bg.scrim')
  const background = level.isOverScrim ? `linear-gradient(${scrim}, ${scrim}), ${base}` : base
  return (
    <span className="level-sample" style={{ background }}>
      {level.shadow && (
        <span
          className="level-surface"
          style={{
            background: colorIn(theme, level.background.replace('/', '.')),
            boxShadow: shadowIn(theme, `shadow-${level.shadow}`),
            border: level.border ? `1px solid ${colorIn(theme, level.border.replace('/', '.'))}` : undefined,
            borderRadius: `var(--radius-${level.radius})`,
          }}
        />
      )}
    </span>
  )
}

function ShadowSpec({ name }) {
  const layers = [code[`shadow-${name}`].$value].flat()
  return (
    <span className="spec">
      <span>Shadow/{name[0].toUpperCase() + name.slice(1)}</span>
      {layers.map((layer, index) => (
        <Joined key={index} parts={[`y ${layer.offsetY.value}`, `blur ${layer.blur.value}`]} />
      ))}
      <Code>var(--shadow-{name})</Code>
    </span>
  )
}

function Elevation() {
  return (
    <Table
      columns={[
        ['Level', '1.1fr'],
        ['Dark', 'minmax(140px, 1fr)'],
        ['Light', 'minmax(140px, 1fr)'],
        ['Background', '0.8fr'],
        ['Shadow', '1.1fr'],
        ['Border', '0.7fr'],
        ['Radius', '0.55fr'],
      ]}
    >
      {LEVELS.map((level) => (
        <TableRow key={level.name}>
          <Name name={level.name} description={level.use} />
          <LevelSample theme="dark" level={level} />
          <LevelSample theme="light" level={level} />
          <span className="mono">{level.background}</span>
          {level.shadow ? <ShadowSpec name={level.shadow} /> : <span className="mono">—</span>}
          <span className="mono">{level.border ?? '—'}</span>
          <span className="mono">{level.radius ? `radius/${level.radius}` : '—'}</span>
        </TableRow>
      ))}
    </Table>
  )
}

function OpacityTable() {
  const tokens = group(opacity, 'opacity')
  return (
    <Table
      columns={[
        ['Token', '1fr'],
        ['Value', '0.4fr'],
        ['Sample', '1.3fr'],
        ['Use', '1.9fr'],
        ['Code', 'minmax(170px, 1fr)'],
      ]}
    >
      {OPACITY_ORDER.map((key) => {
        const token = tokens.find((candidate) => candidate.path[1] === key)
        const name = cssName(token.path)
        return (
          <TableRow key={name}>
            <Name name={token.path.join('/')} />
            <span className="mono">{Math.round(token.$value * 100)}%</span>
            <span className="opacity-sample" style={{ opacity: `var(${name})` }} />
            <span>{token.$description}</span>
            <Code>var({name})</Code>
          </TableRow>
        )
      })}
    </Table>
  )
}

// The Figma section's diagram: the Home screen at 1:1 with its measurements,
// exported at 2x.
function WindowDiagram() {
  return (
    <img
      className="diagram"
      src={windowLayout}
      width={649}
      height={694}
      alt="The Home screen with its title bar, rail, content insets and card gaps measured"
    />
  )
}

function WindowLayout() {
  return (
    <Table
      columns={[
        ['Element', '1fr'],
        ['Size', '1.4fr'],
        ['Notes', '1.4fr'],
        ['Code', '1.6fr'],
      ]}
    >
      {WINDOW_LAYOUT.map(({ element, size, notes, codes }) => (
        <TableRow key={element}>
          <Name name={element} />
          <span className="mono">{size}</span>
          <span>{notes}</span>
          <Codes names={codes.map((name) => `var(${name})`)} />
        </TableRow>
      ))}
    </Table>
  )
}

export const SpacingRadiusEffects = {
  name: 'Spacing, radius & effects',
  render: () => (
    <Page
      title="Spacing, radius & effects"
      intro="Spacing, radii, elevation, opacity and window layout. Bind to tokens, never type numbers."
    >
      <Section title="Spacing" intro="Gaps and padding in 2px steps.">
        <SpacingTable />
      </Section>
      <Section title="Corner radius" intro="Rounded-corner sizes for frames and controls.">
        <Radii />
      </Section>
      <Section
        title="Elevation"
        intro="Four depth levels, set by shadow. Floating layers also get a border. Softer in Light mode."
      >
        <Elevation />
      </Section>
      <Section title="Opacity" intro="Bind layer opacity to these, not to typed numbers.">
        <OpacityTable />
      </Section>
      <Section title="Window layout" intro="Sizes of the title bar, rail and content area.">
        <WindowDiagram />
        <WindowLayout />
      </Section>
    </Page>
  ),
}
