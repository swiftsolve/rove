import designPackage from '../package.json'
import { colorDark, flatten, group, palette, spacing, textStyles } from './tokens'

export default { title: 'Introduction' }

const REPO = 'https://github.com/swiftsolve/rove-tokens'
const FIGMA = 'https://www.figma.com/design/NoICIoyhWNOya9tOnNfEhH/Rove-Design-System'

// A Storybook page, from inside the preview iframe: `./?path=` is the manager.
const pageHref = (id) => `./?path=/story/${id}`

// Backticks in the copy below become inline code.
const withCode = (text) =>
  text.split('`').map((part, index) =>
    index % 2 ? (
      <code key={index} className="intro-code">
        {part}
      </code>
    ) : (
      part
    ),
  )

// The Figma mark in its own colours; the other icons are lines in currentColor.
function FigmaMark() {
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

const LINE_ICONS = {
  plugin: ['M12 22v-5', 'M9 8V2', 'M15 8V2', 'M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z'],
  json: [
    'M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1',
    'M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1',
  ],
  terminal: ['m4 17 6-6-6-6', 'M12 19h8'],
  check: [
    'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
    'm9 12 2 2 4-4',
  ],
  package: [
    'M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z',
    'M12 22V12',
    'M3.29 7 12 12l8.71-5',
  ],
  document: [
    'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z',
    'M14 2v4a2 2 0 0 0 2 2h4',
    'M16 13H8',
    'M16 17H8',
  ],
  slides: ['M2 3h20', 'M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3', 'm7 21 5-5 5 5'],
  app: ['M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z', 'M2 9h20', 'M9 9v11'],
  agent: [
    'M12 8V4H8',
    'M6 8h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z',
    'M2 14h2',
    'M20 14h2',
    'M15 13v2',
    'M9 13v2',
  ],
  book: [
    'M12 7v14',
    'M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z',
  ],
  arrow: ['M5 12h14', 'm12 5 7 7-7 7'],
}

function Icon({ name, label }) {
  if (name === 'figma') return <FigmaMark />
  return (
    <svg
      className="intro-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
    >
      {LINE_ICONS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}

// The two pipelines, step by step. A step's `column` places it under the stage
// headings, so the slideshow skips the export and lines up with the tokens.
const STAGES = ['In Figma', 'Exported to', 'Built by', 'Ships as']

const PIPELINES = [
  {
    title: 'Tokens',
    summary: 'Every colour, size, font and duration, named once.',
    steps: [
      {
        column: 1,
        icons: ['figma'],
        items: [
          { name: 'Variables', body: 'Palette, Color, Spacing, Typography and the rest, in Dark and Light.' },
          { name: 'Text styles', body: 'Headings, body, labels and numbers.' },
          { name: 'Shadows', body: 'The `Shadow/*` effect styles, their colours bound to variables.' },
        ],
      },
      {
        column: 2,
        icons: ['plugin', 'json'],
        items: [
          {
            name: '`src/figma/*.json`',
            body: 'Variables, text styles and shadows, written by the Rove Tokens plugin’s Export, aliases kept.',
          },
          {
            name: '`src/code-tokens.json`',
            body: "What Figma can't hold: easing curves, the focus outline, font fallbacks.",
          },
        ],
      },
      {
        column: 3,
        icons: ['terminal', 'check'],
        items: [
          {
            name: '`npm run build`',
            body: "DTCG first, then CSS with Style Dictionary. It stops if a name doesn't match its code syntax or a reference doesn't resolve in both themes.",
          },
        ],
      },
      {
        column: 4,
        icons: ['package', 'document'],
        items: [
          { name: '`@swiftsolve/rove-tokens`', body: '`tokens.css`, `text-styles.css` and the DTCG files, on npm.' },
          { name: '`DESIGN.md`', body: 'Which token to use for what, in the package.' },
        ],
      },
    ],
  },
  {
    title: 'Slideshow',
    summary: "The Figma file's pages, to present from.",
    steps: [
      {
        column: 1,
        icons: ['figma'],
        items: [{ name: 'Its pages', body: 'Cover, Foundations, Components and Screens.' }],
      },
      {
        column: 3,
        icons: ['terminal'],
        items: [
          { name: '`npm run present`', body: 'Exports each page, styled with the tokens. Runs on every release tag.' },
        ],
      },
      {
        column: 4,
        icons: ['slides'],
        items: [{ name: 'Slideshow', body: 'On GitHub Pages.', href: 'https://swiftsolve.github.io/rove-tokens/' }],
      },
    ],
  },
]

const CONSUMERS = [
  {
    icon: 'app',
    name: 'Rove',
    body: 'The app and its component library import `tokens.css` and `text-styles.css`, and style with nothing else.',
    href: 'https://rove.swiftsolve.net/storybook/',
  },
  {
    icon: 'agent',
    name: 'Coding agents',
    body: 'Read `DESIGN.md` from `node_modules`, so they reach for a token, not a hex.',
  },
  {
    icon: 'book',
    name: 'This Storybook',
    body: 'Reads the DTCG files in `dist/tokens/`, so it follows every build.',
  },
]

const PRINCIPLES = [
  {
    lead: 'Figma is the source of truth.',
    body: 'Every value is set there and exported; nothing in `dist/` or the token reference is edited by hand.',
  },
  {
    lead: 'Named by role.',
    body: 'A token says what a colour is for (`bg/surface`, `text/secondary`), and points at one Palette shade, so a new component picks from the same few.',
  },
  {
    lead: 'Readable in both themes.',
    body: 'Text clears WCAG 2.2 AA (4.5:1) and icons, bars and dots 3:1, in Dark and Light, on the surfaces they sit on.',
  },
  {
    lead: 'Written down for agents.',
    body: '`DESIGN.md` ships in the package, with every token by name and no colour values to copy.',
  },
]

function Item({ name, body, href }) {
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

function Node({ icons, children, style, className = '' }) {
  return (
    <li className={`intro-node ${className}`} style={style}>
      <span className="intro-icons">
        {icons.map((icon) => (
          <Icon key={icon} name={icon} />
        ))}
      </span>
      {children}
    </li>
  )
}

function Pipelines() {
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
      {PIPELINES.map(({ title, summary, steps }) => (
        <div key={title} className="intro-pipeline">
          <div className="intro-pipeline-title">
            <h3>{title}</h3>
            <p>{summary}</p>
          </div>
          <ol className="intro-steps" aria-label={`${title}, from Figma to what ships`}>
            {steps.map(({ column, icons, items }, index) => {
              const skipped = index > 0 && column - steps[index - 1].column > 1
              return (
                <Node
                  key={column}
                  icons={icons}
                  style={{ gridColumn: column }}
                  className={[index > 0 && 'has-flow', skipped && 'has-skip'].filter(Boolean).join(' ')}
                >
                  <span className="intro-stage intro-stage-inline">{STAGES[column - 1]}</span>
                  {items.map((item) => (
                    <Item key={item.name} {...item} />
                  ))}
                </Node>
              )
            })}
          </ol>
        </div>
      ))}
      <div className="intro-pipeline">
        <div className="intro-pipeline-title">
          <h3>Used by</h3>
          <p>Everything that ships from the tokens pipeline.</p>
        </div>
        <ul className="intro-consumers">
          {CONSUMERS.map(({ icon, ...item }) => (
            <Node key={item.name} icons={[icon]}>
              <Item {...item} />
            </Node>
          ))}
        </ul>
      </div>
    </figure>
  )
}

// The pages, each with a small specimen drawn with the tokens it lists.
const EXPLORE = [
  {
    id: 'colour--colour',
    title: 'Colour',
    body: `${flatten(colorDark).length} colour tokens on ${flatten(palette).length} palette shades, in Dark and Light.`,
    specimen: (
      <span className="intro-swatches">
        {[
          '--bg-base',
          '--bg-surface',
          '--accent-default',
          '--status-positive',
          '--status-warning',
          '--status-negative',
        ].map((name) => (
          <span key={name} style={{ background: `var(${name})` }} />
        ))}
      </span>
    ),
  },
  {
    id: 'typography--typography',
    title: 'Typography',
    body: `${flatten(textStyles).length} text styles, each as four variables and a class.`,
    specimen: <span className="intro-type type-heading-large">Aa</span>,
  },
  {
    id: 'spacing-radius-effects--spacing-radius-effects',
    title: 'Spacing, radius & effects',
    body: `A ${group(spacing, 'spacing').length}-step 2px spacing scale, the radii, shadows and opacities.`,
    specimen: (
      <span className="intro-bars">
        {['--spacing-4', '--spacing-8', '--spacing-12', '--spacing-16', '--spacing-20'].map((name) => (
          <span key={name} style={{ width: `calc(var(${name}) * 2)` }} />
        ))}
      </span>
    ),
  },
  {
    id: 'motion--motion',
    title: 'Motion',
    body: 'Ease out over a fast or normal duration; resizing panels spring.',
    specimen: (
      <span className="intro-track">
        <span />
      </span>
    ),
  },
]

const LINKS = [
  { label: 'Figma file', href: FIGMA },
  { label: 'DESIGN.md', href: `${REPO}/blob/main/DESIGN.md` },
  { label: 'Rationale', href: `${REPO}/blob/main/docs/rationale.md` },
  { label: 'Slideshow', href: 'https://swiftsolve.github.io/rove-tokens/' },
  { label: 'GitHub', href: REPO },
]

function IntroductionPage() {
  return (
    <main className="page intro">
      <header className="intro-hero">
        <p className="page-overline">Design tokens</p>
        <h1 className="page-title">Rove Tokens</h1>
        <p className="intro-package">
          <code className="intro-code">{designPackage.name}</code>
          <span className="intro-version">v{designPackage.version}</span>
        </p>
        <p className="page-intro">
          Every colour, size, font and duration in Rove, set once in the Rove Design System in Figma and shipped as CSS
          and DTCG. Change a token in Figma, export it, and one build carries it to the app, its coding agents and these
          pages.
        </p>
        <nav className="intro-links" aria-label="Elsewhere">
          {LINKS.map(({ label, href }) => (
            <a key={label} href={href} target="_blank" rel="noreferrer">
              {label}
            </a>
          ))}
        </nav>
      </header>

      <section className="section">
        <h2 className="section-title">How it works</h2>
        <p className="section-intro">
          Two pipelines leave the Figma file: the tokens, which Rove builds with, and a slideshow of its pages.
        </p>
        <div className="section-body">
          <Pipelines />
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Why it&rsquo;s built this way</h2>
        <ol className="intro-principles">
          {PRINCIPLES.map(({ lead, body }, index) => (
            <li key={lead}>
              <span className="intro-number" aria-hidden="true">
                {index + 1}
              </span>
              <p>
                <strong>{lead}</strong> {withCode(body)}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="section">
        <h2 className="section-title">Explore</h2>
        <p className="section-intro">
          Every token in both themes, laid out as the Figma file&rsquo;s Foundations pages.
        </p>
        <ul className="intro-explore">
          {EXPLORE.map(({ id, title, body, specimen }) => (
            <li key={id}>
              <a className="intro-card" href={pageHref(id)} target="_top">
                <span className="intro-specimen" aria-hidden="true">
                  {specimen}
                </span>
                <span className="intro-card-title">{title}</span>
                <span className="intro-card-body">{body}</span>
                <span className="intro-card-arrow" aria-hidden="true">
                  <Icon name="arrow" />
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}

export const Introduction = { render: () => <IntroductionPage /> }
