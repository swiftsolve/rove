import './introduction.css'

import type { CSSProperties, JSX, ReactNode } from 'react'

import { DotSeparator, UI_LIBRARY_VERSION } from '../src/ui'
import catalogue from '../src/ui/components.gen.json'
import figma from '../src/ui/figma.json'
import { BRAND_ICONS } from './brand-icons'
import { GROUPS } from './introduction-specimens'

const REPO = 'https://github.com/swiftsolve/rove'
// The Rove Tokens Storybook, whose tokens these components are built from.
const TOKENS = 'https://rove.swiftsolve.net/storybook/tokens/'

type Component = { group: string; stories: string[]; figma: unknown }
const components = Object.values(catalogue.components as Record<string, Component>)
// Every figure on the page is counted from the catalogue, so none can go stale.
const storyCount = components.reduce((sum, { stories }) => sum + stories.length, 0)
const inFigma = components.filter((component) => component.figma !== null).length

/** A Docs page, from inside the preview iframe: `./?path=` is the manager. */
const docsHref = (id: string): string => `./?path=/docs/${id}`

// Backticks in the copy below become inline code. A code chip may break only
// after a slash (`src/` | `ui/`), never at a hyphen, so a narrow column wraps a
// path without splitting a name.
const codeParts = (code: string): ReactNode[] =>
  code.split(/(?<=\/)/).map((segment, index) => (
    <span key={index} className="intro-code-part">
      {segment}
    </span>
  ))

const withCode = (text: string): ReactNode[] =>
  text.split('`').map((part, index) =>
    index % 2 ? (
      <code key={index} className="intro-code">
        {codeParts(part)}
      </code>
    ) : (
      part
    ),
  )

// The Figma mark in its own colours; the other icons are lines in currentColor.
function FigmaMark(): JSX.Element {
  return (
    <svg className="intro-icon" viewBox="0 0 38 57" aria-hidden="true">
      <path fill="#1abcfe" d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z" />
      <path fill="#0acf83" d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z" />
      <path fill="#ff7262" d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z" />
      <path fill="#f24e1e" d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z" />
      <path fill="#a259ff" d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z" />
    </svg>
  )
}

// The Rove mark in the accent, as Rove's own title bar draws it, so it deepens in Light.
function RoveMark({ className = 'intro-icon' }: { className?: string }): JSX.Element {
  return (
    <svg className={`${className} intro-rove-mark`} viewBox="4.5 4.5 39 34.5" aria-hidden="true">
      <circle cx="24" cy="24" r="7.5" fill="currentColor" />
      <path
        d="M 11.98 36.02 A 17 17 0 1 1 36.02 36.02"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
      />
    </svg>
  )
}

const LINE_ICONS = {
  figmaLine: [
    'M5 5.5A3.5 3.5 0 0 1 8.5 2H12v7H8.5A3.5 3.5 0 0 1 5 5.5z',
    'M12 2h3.5a3.5 3.5 0 1 1 0 7H12V2z',
    'M12 12.5a3.5 3.5 0 1 1 7 0 3.5 3.5 0 1 1-7 0z',
    'M5 19.5A3.5 3.5 0 0 1 8.5 16H12v3.5a3.5 3.5 0 1 1-7 0z',
    'M5 12.5A3.5 3.5 0 0 1 8.5 9H12v7H8.5A3.5 3.5 0 0 1 5 12.5z',
  ],
  // A small chevron between two marks: the one becomes the other.
  step: ['m9 18 6-6-6-6'],
  braces: [
    'M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1',
    'M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1',
  ],
  // Components built on tokens.
  layers: [
    'M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z',
    'm22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65',
    'm22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65',
  ],
  accessibility: [
    'M17 4a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z',
    'm18 19 1-7-6 1',
    'm5 8 3-3 5.5 3-2.36 3.5',
    'M4.24 14.5a5 5 0 0 0 6.88 6',
    'M13.76 17.5a5 5 0 0 0-6.88-6',
  ],
  sparkles: [
    'M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z',
    'M20 3v4',
    'M22 5h-4',
    'M4 17v2',
    'M5 18H3',
  ],
  arrow: ['M5 12h14', 'm12 5 7 7-7 7'],
  fileText: [
    'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z',
    'M14 2v4a2 2 0 0 0 2 2h4',
    'M10 9H8',
    'M16 13H8',
    'M16 17H8',
  ],
  github: [
    'M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4',
    'M9 18c-4.51 2-5-2-7-2',
  ],
}

type IconName = keyof typeof LINE_ICONS | keyof typeof BRAND_ICONS | 'figma' | 'rove'

function Icon({ name }: { name: IconName }): JSX.Element {
  if (name === 'figma') return <FigmaMark />
  if (name === 'rove') return <RoveMark />
  const brand = BRAND_ICONS[name]
  if (brand)
    return (
      <svg
        className="intro-icon"
        viewBox={brand.viewBox ?? '0 0 24 24'}
        fill={brand.color}
        role="img"
        aria-label={brand.title}
        style={brand.optical ? { transform: `scale(${brand.optical})` } : undefined}
      >
        <path d={brand.path} />
      </svg>
    )
  return (
    <svg
      className={name === 'step' ? 'intro-icon intro-icon-step' : 'intro-icon'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {LINE_ICONS[name as keyof typeof LINE_ICONS].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}

// The pipeline, step by step: a step's `column` places it under its stage heading.
const STAGES = ['Written in', 'Read by', 'Catalogued as', 'Mirrored in']

type Item = { name: string; body: string; href?: string }
type Step = { column: number; icons: IconName[]; items: Item[] }

const STEPS: Step[] = [
  {
    column: 1,
    icons: ['braces'],
    items: [
      { name: '`src/ui/`', body: 'A folder per component: the component, its stories and its usage guide.' },
      { name: '`src/ui/index.ts`', body: 'The public API, in groups. The app imports from `@/ui` only.' },
    ],
  },
  {
    column: 2,
    icons: ['node', 'step', 'braces'],
    items: [
      {
        name: '`npm run gen`',
        body: 'Reads every prop, variant value, story and guide from the code.',
      },
    ],
  },
  {
    column: 3,
    icons: ['braces'],
    items: [
      {
        name: '`components.gen.json`',
        body: 'Every component in one file, with its Figma node. Never edited by hand.',
      },
    ],
  },
  {
    column: 4,
    icons: ['figma'],
    items: [
      { name: 'Figma components', body: 'A component set per component, a variant for every value a prop takes.' },
      { name: 'Docs sections', body: 'The same When to use and When not to use, worded for design.' },
    ],
  },
]

type Card = { icon?: IconName; icons?: IconName[] } & Item

const CHECKS: Card[] = [
  {
    icon: 'eslint',
    name: 'Rove’s lint',
    body: 'Fails a raw colour or spacing where a token belongs, and an import from inside `src/ui`.',
  },
  {
    icon: 'figma',
    name: 'Figma check',
    body: 'Fails when a Figma variant and its prop disagree, or a guide has no twin in Figma.',
  },
  {
    icon: 'storybook',
    name: 'Every story',
    body: `Renders in a real browser and runs through axe. ${storyCount} stories, each a test.`,
  },
]

const CONSUMERS: Card[] = [
  {
    icon: 'rove',
    name: 'Rove',
    body: 'Every screen of the app is built from `@/ui` and styled with nothing but tokens.',
  },
  {
    icons: ['claude', 'openai', 'cursor', 'copilot', 'gemini'],
    name: 'Coding agents',
    body: 'Read `AGENTS.md` and `components.gen.json`, so they pick a component, not new markup.',
  },
  {
    icon: 'storybook',
    name: 'This Storybook',
    body: 'Reads the stories and guides, so every page follows the code.',
  },
]

const PRINCIPLES: { icon: IconName; lead: string; body: string }[] = [
  {
    icon: 'braces',
    lead: 'Components start in code',
    body: 'A component or variant lands here first, then in Figma to match. Tokens start in Figma.',
  },
  {
    icon: 'layers',
    lead: 'Tokens and nothing else',
    body: 'The theme holds only Rove Tokens, so there is no colour or spacing to reach for outside it.',
  },
  {
    icon: 'accessibility',
    lead: 'Accessible as built',
    body: 'Each guide says what the component handles for you, and what you pass or write around it.',
  },
  {
    icon: 'sparkles',
    lead: 'Written down for agents',
    body: '`components.gen.json` names every prop, value and guide, generated from the code.',
  },
]

function ItemText({ name, body, href }: Item): JSX.Element {
  const title = withCode(name)
  return (
    <div className="intro-item">
      <strong className="intro-item-name">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer">
            {title}
          </a>
        ) : (
          title
        )}
      </strong>
      <span className="intro-item-body">{withCode(body)}</span>
    </div>
  )
}

function Node({
  icons,
  children,
  style,
  className = '',
}: {
  icons: IconName[]
  children: ReactNode
  style?: CSSProperties
  className?: string
}): JSX.Element {
  return (
    <li className={`intro-node ${className}`} style={style}>
      <span className="intro-icons">
        {icons.map((icon, index) => (
          // A step chevron can repeat, so the key carries its place.
          <Icon key={`${icon}-${index}`} name={icon} />
        ))}
      </span>
      {children}
    </li>
  )
}

function Pipeline(): JSX.Element {
  return (
    <figure className="intro-diagram">
      <div className="intro-stages" aria-hidden="true">
        <span />
        <div className="intro-stage-columns">
          {STAGES.map((stage) => (
            <span key={stage} className="intro-stage">
              {stage}
            </span>
          ))}
        </div>
      </div>
      <div className="intro-pipeline">
        <div className="intro-pipeline-title">
          <h3>Components</h3>
          <p>Written here, then mirrored in Figma.</p>
        </div>
        <ol className="intro-steps" aria-label="Components, from code to Figma">
          {STEPS.map(({ column, icons, items }, index) => (
            <Node key={column} icons={icons} style={{ gridColumn: column }} className={index > 0 ? 'has-flow' : ''}>
              <span className="intro-stage intro-stage-inline">{STAGES[column - 1]}</span>
              {items.map((item) => (
                <ItemText key={item.name} {...item} />
              ))}
            </Node>
          ))}
        </ol>
      </div>
      {[
        { title: 'Checked by', summary: 'What fails when a component drifts.', cards: CHECKS },
        { title: 'Used by', summary: 'What a component change reaches.', cards: CONSUMERS },
      ].map(({ title, summary, cards }) => (
        <div key={title} className="intro-pipeline">
          <div className="intro-pipeline-title">
            <h3>{title}</h3>
            <p>{summary}</p>
          </div>
          <ul className="intro-consumers">
            {cards.map(({ icon, icons = icon ? [icon] : [], ...item }) => (
              <Node key={item.name} icons={icons}>
                <ItemText {...item} />
              </Node>
            ))}
          </ul>
        </div>
      ))}
    </figure>
  )
}

/** The groups in the library's order, each with its size and the Docs page of its first component. */
const groups = [...new Set(components.map(({ group }) => group))].map((group) => {
  const members = components.filter((component) => component.group === group)
  const firstStory = members.find(({ stories }) => stories.length > 0)?.stories[0]
  return { group, count: members.length, docsId: firstStory?.replace(/--.*$/, '--docs') }
})

// Line icons in the link's accent, so they read as one row.
const LINKS: { icon: IconName; label: string; href: string }[] = [
  { icon: 'figmaLine', label: 'Figma file', href: figma.file },
  { icon: 'rove', label: 'Rove Tokens', href: TOKENS },
  { icon: 'fileText', label: 'Frontend guide', href: `${REPO}/blob/master/src/README.md` },
  { icon: 'github', label: 'GitHub', href: REPO },
]

/** The library's front page, laid out as Rove Tokens' Introduction is. */
export function Introduction(): JSX.Element {
  return (
    <main className="intro">
      <header className="intro-hero">
        <p className="intro-label">Component library</p>
        <h1 className="intro-title">
          <RoveMark className="intro-hero-mark" />
          Rove Components
        </h1>
        <p className="intro-package">
          <a className="intro-package-link" href={`${REPO}/tree/master/src/ui`} target="_blank" rel="noreferrer">
            <code className="intro-code">@/ui</code>
          </a>
          <span className="intro-version">v{UI_LIBRARY_VERSION}</span>
        </p>
        <p className="intro-lead">
          Rove&rsquo;s interface as a React library: {components.length} components, each with its stories, props and a
          usage guide. Built only from Rove Tokens, and {inFigma} of them mirrored in Figma.
        </p>
        <nav className="intro-links" aria-label="Elsewhere">
          {LINKS.map(({ icon, label, href }) => (
            <a key={label} href={href} target="_blank" rel="noreferrer">
              <Icon name={icon} />
              {label}
            </a>
          ))}
        </nav>
      </header>

      <section className="intro-section">
        <h2 className="intro-section-title">How it works</h2>
        <p className="intro-section-intro">
          A component&rsquo;s path from its source to everything that uses it, in one direction.
        </p>
        <div className="intro-section-body">
          <Pipeline />
        </div>
      </section>

      <section className="intro-section">
        <h2 className="intro-section-title">Principles</h2>
        <ul className="intro-explore">
          {PRINCIPLES.map(({ icon, lead, body }) => (
            <li key={lead}>
              <div className="intro-principle">
                <span className="intro-principle-icon" aria-hidden="true">
                  <Icon name={icon} />
                </span>
                <span className="intro-card-title">{lead}</span>
                <span className="intro-principle-body">{withCode(body)}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="intro-section">
        <h2 className="intro-section-title">Explore</h2>
        <p className="intro-section-intro">Every component by group, each drawn with its own.</p>
        <ul className="intro-bento">
          {groups.map(({ group, count, docsId }) => (
            <li key={group} className={`intro-bento-${GROUPS[group]?.area ?? 'other'}`}>
              <div className="intro-card">
                {/* Real components, so the scene is inert: the card's link is the only thing to press. */}
                <div className="intro-preview" aria-hidden="true" inert>
                  {GROUPS[group]?.specimen}
                </div>
                <div className="intro-card-text">
                  <span className="intro-card-heading">
                    {docsId ? (
                      <a className="intro-card-title intro-card-link" href={docsHref(docsId)} target="_top">
                        {group}
                      </a>
                    ) : (
                      <span className="intro-card-title">{group}</span>
                    )}
                    <DotSeparator />
                    <span className="intro-count">
                      {count}
                      <span className="sr-only"> {count === 1 ? 'component' : 'components'}</span>
                    </span>
                  </span>
                  <span className="intro-card-body">{GROUPS[group]?.body}</span>
                </div>
                <span className="intro-card-arrow" aria-hidden="true">
                  <Icon name="arrow" />
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
