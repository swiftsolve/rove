import { Code, Codes, Group, Joined, Name, Page, Section, Table, TableRow } from './blocks'
import { cssName, flatten, group, textStyles, typography } from './tokens'

export default { title: 'Typography' }

const FAMILIES = {
  sans: 'Interface text. Regular, Medium, Semi Bold.',
  numeric: 'Numbers, tabular. Large metrics add a thin stroke (weight 600 in code).',
}

// The Figma page's specimen for each style, in its order.
const SPECIMENS = {
  'heading-large': 'Starlight_5G',
  'heading-medium': 'Add a service',
  'heading-small': 'Capabilities',
  'heading-xsmall': 'No devices found',
  'body-default': <Joined parts={['192.168.1.42', '5 GHz']} />,
  'body-small': 'Devices will appear after a scan.',
  caption: 'Live',
  badge: 'VPN',
  'label-large': 'Run test',
  'label-menu': 'Edit',
  'label-default': 'Add service',
  'label-small': 'Wi‑Fi',
  overline: 'Download',
  'number-display': '4.4',
  'number-large': '4.90',
  'number-default': 'Wi‑Fi 6 (802.11ax)',
  'number-small': '60s ago',
}

const WEIGHTS = { 400: 'Regular', 500: 'Medium', 600: 'Semi Bold' }

const fontSizes = Object.fromEntries(
  group(typography, 'font-size').map((token) => [`{${token.path.join('.')}}`, token.$value.value]),
)
const families = Object.fromEntries(
  group(typography, 'font-family').map((token) => [`{${token.path.join('.')}}`, token.$value[0]]),
)

// heading-large is Heading/Large, as Figma names the style; xsmall is XSmall.
const styleName = (key) =>
  key
    .split('-')
    .map((word) => (word === 'xsmall' ? 'XSmall' : word[0].toUpperCase() + word.slice(1)))
    .join('/')

const percent = (value) => `${value > 0 ? '+' : ''}${Math.round(value * 100)}%`

function Spec({ value, textCase }) {
  const size = fontSizes[value.fontSize]
  const letterSpacing = value.letterSpacing.value / size
  const metrics = [`${size}px / ${Math.round(value.lineHeight * 100)}%`]
  if (letterSpacing !== 0) metrics.push(percent(letterSpacing))
  return (
    <span className="spec">
      <span>
        {families[value.fontFamily]} {WEIGHTS[value.fontWeight]}
      </span>
      <Joined parts={metrics} />
      {textCase === 'UPPER' && <span>Uppercase</span>}
    </span>
  )
}

function Families() {
  return (
    <div className="cards cards-two">
      {group(typography, 'font-family').map((token) => {
        const name = cssName(token.path)
        return (
          <div key={name} className="doc-card">
            <span
              className="family-specimen"
              style={{
                fontFamily: `var(${name})`,
                fontWeight: token.path[1] === 'sans' ? 'var(--weight-semibold)' : undefined,
              }}
            >
              Aa 0123456789
            </span>
            <span className="doc-card-title">{token.$value[0]}</span>
            <span className="doc-card-text">{FAMILIES[token.path[1]]}</span>
            <Codes names={[token.path.join('/'), `var(${name})`]} />
          </div>
        )
      })}
    </div>
  )
}

function SizeScale() {
  const tokens = group(typography, 'font-size')
  const largest = tokens.at(-1)
  return (
    <Table
      columns={[
        ['Token', '1.2fr'],
        ['Size', '0.6fr'],
        ['Sample', '3fr'],
        ['Code', 'minmax(170px, 1fr)'],
      ]}
    >
      {tokens.map((token) => {
        const name = cssName(token.path)
        // The largest size is for metrics, so it shows a number, as on the Figma page.
        const isMetric = token === largest
        return (
          <TableRow key={name}>
            <Name name={token.path.join('/')} />
            <span className="mono">{token.$value.value}px</span>
            <span
              style={{
                fontSize: `var(${name})`,
                fontFamily: isMetric ? 'var(--font-family-numeric)' : undefined,
                lineHeight: 1.2,
              }}
            >
              {isMetric ? '412 Mbps' : 'Starlight_5G connected'}
            </span>
            <Code>var({name})</Code>
          </TableRow>
        )
      })}
    </Table>
  )
}

function TextStyles() {
  const tokens = flatten(textStyles)
  const ordered = Object.keys(SPECIMENS).map((key) => tokens.find((token) => token.path[1] === key))
  return (
    <Table
      columns={[
        ['Specimen', '1.8fr'],
        ['Style', '1.8fr'],
        ['Spec', '1.2fr'],
        ['Code', 'minmax(190px, 1fr)'],
      ]}
    >
      {ordered.map((token) => {
        const key = token.path[1]
        const className = `type-${key}`
        return (
          <TableRow key={key}>
            <span className={`specimen ${className}`}>{SPECIMENS[key]}</span>
            <Name name={styleName(key)} description={token.$description?.replace(/ Code:.*$/, '')} />
            <Spec value={token.$value} textCase={token.$extensions?.['net.swiftsolve.rove-tokens']?.textCase} />
            <Code copy={className}>.{className}</Code>
          </TableRow>
        )
      })}
    </Table>
  )
}

export const Typography = {
  render: () => (
    <Page title="Typography" intro="Inter for interface text, Questrial for numbers.">
      <Group
        title="Primitive tokens"
        intro="The raw families and sizes, named by what they are."
        warning="Use a text style, not a font size."
      >
        <Section
          title="Families"
          intro="Inter (font-family/sans) for text, Questrial (font-family/numeric) for numbers."
        >
          <Families />
        </Section>
        <Section title="Size scale" intro="The font sizes every text style uses.">
          <SizeScale />
        </Section>
      </Group>
      <Group title="Semantic tokens" intro="What you use, each named for its job and built from these.">
        <Section title="Text styles" intro="Apply a style instead of setting fonts by hand. In code, it's one class.">
          <TextStyles />
        </Section>
      </Group>
    </Page>
  ),
}
