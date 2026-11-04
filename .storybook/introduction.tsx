import type { JSX, ReactNode } from 'react'
import { SELECT_STORY } from 'storybook/internal/core-events'
import { addons } from 'storybook/preview-api'

import {
  Card,
  CardBody,
  CardHeader,
  EditIcon,
  LayersIcon,
  Link,
  Readout,
  SparkleIcon,
  UI_LIBRARY_VERSION,
} from '../src/ui'
import catalogue from '../src/ui/components.gen.json'
import figma from '../src/ui/figma.json'

const TOKENS_STORYBOOK = 'https://rove.swiftsolve.net/storybook/tokens/'

type Component = { group: string; figma: unknown; stories: string[]; guidance?: unknown }
const components = Object.entries(catalogue.components as Record<string, Component>)

// Every figure on the page is counted from the catalogue, so none can go stale.
const storyCount = components.reduce((sum, [, { stories }]) => sum + stories.length, 0)
const inFigma = components.filter(([, component]) => component.figma !== null).length
const withGuide = components.filter(([, component]) => component.guidance).length
const figmaExceptions = Object.values(figma.components).reduce(
  (sum, entry) =>
    sum +
    (entry
      ? ['codeOnly', 'figmaOnly', 'valuesDiffer'].reduce(
          (count, kind) => count + Object.keys((entry as Record<string, object | undefined>)[kind] ?? {}).length,
          0,
        )
      : 0),
  0,
)

/** The groups in the library's order, each with its components and the Docs page of its first. */
const groups = [...new Set(components.map(([, { group }]) => group))].map((group) => {
  const members = components.filter(([, component]) => component.group === group)
  const firstStory = members.find(([, { stories }]) => stories.length > 0)?.[1].stories[0]
  return { group, names: members.map(([name]) => name), docsId: firstStory?.replace(/--.*$/, '--docs') }
})

/** Opens another Docs page in Storybook, as a sidebar click does. */
function openDocs(id: string): void {
  addons.getChannel().emit(SELECT_STORY, { storyId: id, viewMode: 'docs' })
}

/** `code` in backticks, as the usage guides write it. */
function Prose({ text }: { text: string }): JSX.Element {
  return <>{text.split('`').map((part, i) => (i % 2 === 1 ? <code key={i}>{part}</code> : part))}</>
}

function Section({ id, title, intro, children }: { id: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section className="intro-section" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {intro && <p className="intro-section-intro">{intro}</p>}
      {children}
    </section>
  )
}

/** Points under a heading: a bold lead and a line. */
function Points({ points }: { points: [string, string][] }): JSX.Element {
  return (
    <ul className="intro-points">
      {points.map(([lead, line]) => (
        <li key={lead}>
          <strong>{lead}</strong>
          <span>
            <Prose text={line} />
          </span>
        </li>
      ))}
    </ul>
  )
}

const ROLES = [
  {
    title: 'Design',
    icon: <EditIcon size={16} />,
    line: 'Start in Figma: variables, text styles and every component, with the props code has.',
    action: <Link href={figma.file}>Open the Figma file</Link>,
  },
  {
    title: 'Build',
    icon: <LayersIcon size={16} />,
    line: 'Import from `@/ui`. Each Docs page has its props, stories and usage guide.',
    action: <Link onClick={() => openDocs('actions-button--docs')}>Start with Button</Link>,
  },
  {
    title: 'Brief an agent',
    icon: <SparkleIcon size={16} />,
    line: '`AGENTS.md` routes each task. `components.gen.json` holds the whole API.',
    action: (
      <Link onClick={() => document.getElementById('intro-layers')?.scrollIntoView()}>How it stays on-system</Link>
    ),
  },
]

const STEPS: [string, string][] = [
  ['Figma', 'The Rove Design System: variables, text styles and components. The source of truth.'],
  ['rove-tokens', 'Every token as a CSS variable, the Tailwind theme, and `DESIGN.md`, the rules for using them.'],
  ['Rove Components', 'This library: React, styled only with token utilities, each with stories and a guide.'],
  ['Rove', 'The desktop app. Every screen is built from the library.'],
]

/** The library's front page, built from its own components. */
export function Introduction(): JSX.Element {
  return (
    <div className="intro sb-unstyled">
      <header className="intro-hero">
        <p className="intro-overline">Rove Design System</p>
        <h1>Rove Components</h1>
        <p className="intro-lead">
          Rove&rsquo;s interface as a React library, built agent-first. The agents that write Rove&rsquo;s UI use the
          same components, tokens and rules as the people who design it, from Figma to the app.
        </p>
        <dl className="intro-stats">
          <Readout label="Components" value={String(components.length)} />
          <Readout label="Stories, each an a11y test" value={String(storyCount)} />
          <Readout label="In Figma" value={String(inFigma)} unit={`of ${components.length}`} />
          <Readout label="Usage guides" value={String(withGuide)} unit={`of ${components.length}`} />
        </dl>
      </header>

      <ul className="intro-roles" aria-label="Where to start">
        {ROLES.map(({ title, icon, line, action }) => (
          <li key={title}>
            <Card>
              <CardHeader title={title} icon={icon} />
              <CardBody>
                <p className="intro-card-line">
                  <Prose text={line} />
                </p>
                {action}
              </CardBody>
            </Card>
          </li>
        ))}
      </ul>

      <Section
        id="intro-how"
        title="How it works"
        intro="Figma is the source of truth. Four steps carry it to the app."
      >
        <ol className="intro-steps">
          {STEPS.map(([name, line], i) => (
            <li key={name}>
              <span className="intro-step-number" aria-hidden>
                {i + 1}
              </span>
              <strong>{name}</strong>
              <span>
                <Prose text={line} />
              </span>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        id="intro-why"
        title="Why it matters"
        intro="Agents go off-system in two ways. Rove answers the first with context and the second with constraint, then checks both."
      >
        <Points
          points={[
            [
              'They don’t know what exists, so they invent.',
              'An agent that has never seen `Card` writes its own, styled from its training data.',
            ],
            [
              'They know, and drift anyway.',
              'Training pulls harder than docs: a 5px gap or a hex colour, with the tokens in plain view.',
            ],
          ]}
        />
      </Section>

      <div className="intro-layers" id="intro-layers">
        <Section id="intro-context" title="Context" intro="So agents know what exists.">
          <Points
            points={[
              ['Routed instructions.', '`AGENTS.md` sends each task to the doc it needs.'],
              [
                'Design rules, always loaded.',
                '`src/AGENTS.md` imports `DESIGN.md`, so it arrives with the first UI file.',
              ],
              ['A generated catalogue.', 'Every prop, value, Figma node, story and guide, built from the code.'],
              ['Figma in code’s names.', 'Variants named as props, so the Figma MCP hands agents real values.'],
            ]}
          />
        </Section>
        <Section id="intro-constraint" title="Constraint" intro="So drift fails as it’s written.">
          <Points
            points={[
              ['Tokens only.', 'The Tailwind theme has no defaults: `bg-gray-100` doesn’t exist.'],
              ['No raw values.', 'Colours, easings and any length a token has fail lint.'],
              ['Spacing on the scale.', 'An off-scale gap, padding or margin needs a written reason.'],
              ['Placement, not restyling.', 'A `className` can place a component, never restyle it.'],
            ]}
          />
        </Section>
        <Section id="intro-checks" title="Checks" intro="So the system stays true.">
          <Points
            points={[
              ['On every edit.', 'A hook lints each file an agent edits, on the spot.'],
              ['Every story a test.', 'Rendered in Chromium, play functions run, axe at zero violations.'],
              ['Figma parity.', 'Every Figma variant and its values match a prop, both ways.'],
              ['Visible escapes.', `${figmaExceptions} differences from Figma on record, each with why.`],
            ]}
          />
        </Section>
      </div>

      <Section id="intro-blocks" title="Components" intro="By group, in the order the sidebar lists them.">
        <ul className="intro-groups">
          {groups.map(({ group, names, docsId }) => (
            <li key={group}>
              <Card onOpen={docsId ? () => openDocs(docsId) : undefined} linkLabel={`${group} components`}>
                <CardHeader title={group} />
                <CardBody>
                  <p className="intro-card-line">{names.join(', ')}</p>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      </Section>

      <footer className="intro-footer">
        <span>Version {UI_LIBRARY_VERSION}</span>
        <Link href={figma.file}>Figma file</Link>
        <Link href={TOKENS_STORYBOOK}>Rove Tokens</Link>
      </footer>
    </div>
  )
}
