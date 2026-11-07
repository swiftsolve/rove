import { Code, Codes, Group, Joined, Name, Page, Section, Table, TableRow } from './blocks'
import { cssName, flatten, group, textStyles, typography } from './tokens'

export default { title: 'Typography' }

// The Figma page's order: display first.
const FAMILIES = {
  display: 'Headings, in Bold.',
  sans: 'Text and numbers. Regular, Medium, SemiBold.',
}

// The Figma page's specimen for each style, in its order.
const SPECIMENS = {
  display: '4.4',
  title: 'Starlight_5G',
  stat: '4.90',
  heading: 'Capabilities',
  body: <Joined parts={['192.168.1.42', '5 GHz']} />,
  'body-medium': 'Link speed',
  'body-semibold': 'Run test',
  caption: 'Live',
  badge: 'VPN',
}

const WEIGHTS = { 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold' }

const fontSizes = Object.fromEntries(
  group(typography, 'font-size').map((token) => [`{${token.path.join('.')}}`, token.$value.value]),
)
const families = Object.fromEntries(
  group(typography, 'font-family').map((token) => [`{${token.path.join('.')}}`, token.$value[0]]),
)

// body-medium is Body/Medium, as Figma names the style; semibold is SemiBold.
const styleName = (key) =>
  key
    .split('-')
    .map((word) => (word === 'semibold' ? 'SemiBold' : word[0].toUpperCase() + word.slice(1)))
    .join('/')

const percent = (value) => `${value > 0 ? '+' : ''}${Math.round(value * 100)}%`

function Spec({ value, textCase }) {
  const size = fontSizes[value.fontSize]
  const letterSpacing = value.letterSpacing.value / size
  const metrics = [`${size}px / ${Math.round(value.lineHeight * size)}px`]
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
    <div className="cards cards-three">
      {Object.keys(FAMILIES).map((key) => {
        const token = group(typography, 'font-family').find((t) => t.path[1] === key)
        const name = cssName(token.path)
        return (
          <div key={name} className="doc-card">
            <span
              className="family-specimen"
              style={{
                fontFamily: `var(${name})`,
                fontWeight: { sans: 'var(--weight-semibold)', display: 700 }[token.path[1]],
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
    <Page title="Typography" intro="Urbanist for headings, Hanken Grotesk for text and numbers.">
      <Group
        title="Primitive tokens"
        intro="The raw families and sizes, named by what they are."
        warning="Use a text style, not a font size."
      >
        <Section
          title="Families"
          intro="Urbanist (font-family/display) for headings, Hanken Grotesk (font-family/sans) for text and numbers."
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
