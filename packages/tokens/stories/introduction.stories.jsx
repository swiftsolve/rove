import designPackage from '../package.json'
import { BRAND_ICONS } from './brand-icons'
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

// The Rove mark in the accent, as Rove's own title bar draws it, so it deepens in Light.
function RoveMark() {
  return (
    <svg className="intro-icon intro-rove-mark" viewBox="4.5 4.5 39 34.5" aria-hidden="true">
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
  tag: [
    'M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z',
    'M7.5 7.5h.01',
  ],
  contrast: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z', 'M12 18a6 6 0 0 0 0-12v12z'],
  agent: [
    'M12 8V4H8',
    'M6 8h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z',
    'M2 14h2',
    'M20 14h2',
    'M15 13v2',
    'M9 13v2',
  ],
  arrow: ['M5 12h14', 'm12 5 7 7-7 7'],
}

function Icon({ name, label }) {
  if (name === 'figma') return <FigmaMark />
  if (name === 'rove') return <RoveMark />
  const brand = BRAND_ICONS[name]
  if (brand)
    return (
      <svg
        className="intro-icon"
        viewBox="0 0 24 24"
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

// The pipeline, step by step. A step's `column` places it under its stage heading,
// and a step that skips a stage gets a dashed arrow across it.
const STAGES = ['In Figma', 'Exported to', 'Built by', 'Ships as']

const PIPELINES = [
  {
    title: 'Tokens',
    summary: 'Designed in Figma, built and shipped from here.',
    steps: [
      {
        column: 1,
        icons: ['figma'],
        items: [
          { name: 'Variables', body: 'Colour, spacing, type and the rest, each in Dark and Light.' },
          { name: 'Text styles', body: 'Headings, body, labels and numbers.' },
          { name: 'Shadows', body: '`Shadow/*` effect styles, coloured by variables.' },
        ],
      },
      {
        column: 2,
        icons: ['json'],
        items: [
          {
            name: '`src/figma/*.json`',
            body: 'All three, as the Rove Tokens plugin exports them. Never edited by hand.',
          },
          {
            name: '`src/code-tokens.json`',
            body: "Only what Figma can't hold: easing curves, the focus outline, font fallbacks.",
          },
        ],
      },
      {
        column: 3,
        icons: ['node', 'css'],
        items: [
          {
            name: '`npm run build`',
            body: 'Writes DTCG, then CSS with Style Dictionary. It stops on a misnamed token or a broken reference.',
          },
        ],
      },
      {
        column: 4,
        icons: ['npm'],
        items: [
          { name: '`@swiftsolve/rove-tokens`', body: '`tokens.css`, `text-styles.css` and the DTCG files, on npm.' },
          { name: '`DESIGN.md`', body: 'Which token to use for what, shipped alongside.' },
        ],
      },
    ],
  },
]

const CONSUMERS = [
  {
    icon: 'rove',
    name: 'Rove',
    body: 'The app and its component library import `tokens.css` and `text-styles.css`, and style with nothing else.',
    href: 'https://rove.swiftsolve.net/storybook/',
  },
  {
    icons: ['claude', 'openai', 'cursor', 'copilot', 'gemini'],
    name: 'Coding agents',
    body: 'Read `DESIGN.md` from `node_modules`, so they reach for a token, not a hex.',
  },
  {
    icon: 'storybook',
    name: 'This Storybook',
    body: 'Reads the DTCG files in `dist/tokens/`, so it follows every build.',
  },
]

const PRINCIPLES = [
  {
    icon: 'figma',
    lead: 'Figma is the source of truth',
    body: 'Tokens flow one way: designed there, exported, built. Nothing writes back to Figma, and nothing in `dist/` is edited by hand.',
  },
  {
    icon: 'tag',
    lead: 'Named by role',
    body: '`bg/surface` says what a colour is for, not how it looks, and points at one Palette shade.',
  },
  {
    icon: 'contrast',
    lead: 'Readable in both themes',
    body: 'Text clears WCAG 2.2 AA (4.5:1) and icons, bars and dots 3:1, in Dark and Light.',
  },
  {
    icon: 'agent',
    lead: 'Written down for agents',
    body: '`DESIGN.md` names every token and its use, with no colour values to copy.',
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
          <p>What reads the package.</p>
        </div>
        <ul className="intro-consumers">
          {CONSUMERS.map(({ icon, icons = [icon], ...item }) => (
            <Node key={item.name} icons={icons}>
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
      // The Figma cover's palette row, in its order: the accent, the two series, then status from best to worst.
      <span className="intro-swatches">
        {[
          '--accent-default',
          '--series-down',
          '--series-up',
          '--status-positive',
          '--status-good',
          '--status-warning',
          '--status-poor',
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
    body: `${flatten(textStyles).length} text styles in Inter and Questrial, each four variables and a class.`,
    // Both families: the text face, and the numeric one figures are set in.
    specimen: (
      <span className="intro-type-pair">
        <span className="intro-type type-heading-large">Aa</span>
        <span className="intro-type type-number-display">182</span>
      </span>
    ),
  },
  {
    id: 'spacing-radius-effects--spacing-radius-effects',
    title: 'Spacing, radius & effects',
    body: `A ${group(spacing, 'spacing').length}-step spacing scale in 2px steps, with the radii, shadows and opacities.`,
    specimen: (
      // The four kinds, left to right: spacing steps, the radii (each tinted at an
      // opacity token, smallest to largest), and a raised panel's shadow.
      <span className="intro-effects">
        <span className="intro-bars">
          {['--spacing-4', '--spacing-8', '--spacing-12', '--spacing-16', '--spacing-20'].map((name) => (
            <span key={name} style={{ width: `calc(var(${name}) * 2)` }} />
          ))}
        </span>
        <span className="intro-radii">
          {[
            ['--radius-xs', '--opacity-tint-sm'],
            ['--radius-sm', '--opacity-tint-md'],
            ['--radius-lg', '--opacity-tint-lg'],
            ['--radius-full', '--opacity-tint-xl'],
          ].map(([radius, tint]) => (
            <span
              key={radius}
              style={{
                borderRadius: `var(${radius})`,
                background: `color-mix(in srgb, var(--accent-default) var(${tint}), transparent)`,
              }}
            />
          ))}
        </span>
        <span className="intro-raised" />
      </span>
    ),
  },
  {
    id: 'motion--motion',
    title: 'Motion',
    body: 'Durations and easing curves: most things ease out, panels spring and status dots pulse.',
    specimen: (
      // Rove's speed test progress bar (WavyProgress, after Material 3's wavy
      // progress), at its own sizes: the squiggle scrolls a wavelength a second
      // up to the fill, a dot rides its tip, and a dimmed track runs on.
      <svg className="intro-wavy" viewBox="0 0 216 16" width="216" height="16">
        <defs>
          <clipPath id="intro-wavy-fill">
            <rect x="0" y="0" width="129.6" height="16" />
          </clipPath>
        </defs>
        <g clipPath="url(#intro-wavy-fill)">
          <path
            className="intro-wavy-wave"
            d="M -40.00 8.00 Q -40.00 8.00 -38.50 8.57 Q -37.00 9.13 -35.50 9.58 Q -34.00 10.02 -32.50 10.25 Q -31.00 10.47 -29.50 10.42 Q -28.00 10.38 -26.50 10.07 Q -25.00 9.77 -23.50 9.27 Q -22.00 8.77 -20.50 8.19 Q -19.00 7.61 -17.50 7.07 Q -16.00 6.53 -14.50 6.15 Q -13.00 5.77 -11.50 5.64 Q -10.00 5.50 -8.50 5.64 Q -7.00 5.77 -5.50 6.15 Q -4.00 6.53 -2.50 7.07 Q -1.00 7.61 0.50 8.19 Q 2.00 8.77 3.50 9.27 Q 5.00 9.77 6.50 10.07 Q 8.00 10.38 9.50 10.42 Q 11.00 10.47 12.50 10.25 Q 14.00 10.02 15.50 9.58 Q 17.00 9.13 18.50 8.57 Q 20.00 8.00 21.50 7.43 Q 23.00 6.87 24.50 6.42 Q 26.00 5.98 27.50 5.75 Q 29.00 5.53 30.50 5.58 Q 32.00 5.62 33.50 5.93 Q 35.00 6.23 36.50 6.73 Q 38.00 7.23 39.50 7.81 Q 41.00 8.39 42.50 8.93 Q 44.00 9.47 45.50 9.85 Q 47.00 10.23 48.50 10.36 Q 50.00 10.50 51.50 10.36 Q 53.00 10.23 54.50 9.85 Q 56.00 9.47 57.50 8.93 Q 59.00 8.39 60.50 7.81 Q 62.00 7.23 63.50 6.73 Q 65.00 6.23 66.50 5.93 Q 68.00 5.62 69.50 5.58 Q 71.00 5.53 72.50 5.75 Q 74.00 5.98 75.50 6.42 Q 77.00 6.87 78.50 7.43 Q 80.00 8.00 81.50 8.57 Q 83.00 9.13 84.50 9.58 Q 86.00 10.02 87.50 10.25 Q 89.00 10.47 90.50 10.42 Q 92.00 10.38 93.50 10.07 Q 95.00 9.77 96.50 9.27 Q 98.00 8.77 99.50 8.19 Q 101.00 7.61 102.50 7.07 Q 104.00 6.53 105.50 6.15 Q 107.00 5.77 108.50 5.64 Q 110.00 5.50 111.50 5.64 Q 113.00 5.77 114.50 6.15 Q 116.00 6.53 117.50 7.07 Q 119.00 7.61 120.50 8.19 Q 122.00 8.77 123.50 9.27 Q 125.00 9.77 126.50 10.07 Q 128.00 10.38 129.50 10.42 Q 131.00 10.47 132.50 10.25 Q 134.00 10.02 135.50 9.58 Q 137.00 9.13 138.50 8.57 Q 140.00 8.00 141.50 7.43 Q 143.00 6.87 144.50 6.42 Q 146.00 5.98 147.50 5.75 Q 149.00 5.53 150.50 5.58 Q 152.00 5.62 153.50 5.93 Q 155.00 6.23 156.50 6.73 Q 158.00 7.23 159.50 7.81 Q 161.00 8.39 162.50 8.93 Q 164.00 9.47 165.50 9.85 Q 167.00 10.23 168.50 10.36 Q 170.00 10.50 171.50 10.36 Q 173.00 10.23 174.50 9.85 Q 176.00 9.47 177.50 8.93 Q 179.00 8.39 180.50 7.81 Q 182.00 7.23 183.50 6.73 Q 185.00 6.23 186.50 5.93 Q 188.00 5.62 189.50 5.58 Q 191.00 5.53 192.50 5.75 Q 194.00 5.98 195.50 6.42 Q 197.00 6.87 198.50 7.43 Q 200.00 8.00 201.50 8.57 Q 203.00 9.13 204.50 9.58 Q 206.00 10.02 207.50 10.25 Q 209.00 10.47 210.50 10.42 Q 212.00 10.38 213.50 10.07 Q 215.00 9.77 216.00 9.47"
          />
        </g>
        <line className="intro-wavy-track" x1="138.60" y1="8.0" x2="214.50" y2="8.0" />
        <circle className="intro-wavy-dot" cx="129.6" cy="8.0" r="5" />
      </svg>
    ),
  },
]

const LINKS = [
  { label: 'Figma file', href: FIGMA },
  { label: 'DESIGN.md', href: `${REPO}/blob/main/DESIGN.md` },
  { label: 'Rationale', href: `${REPO}/blob/main/docs/rationale.md` },
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
          Every colour, size, font and duration in Rove, designed once in Figma and shipped as CSS and DTCG. Change a
          token there, export it, and one build carries it to the app, its coding agents and these pages.
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
          A token&rsquo;s path from the Figma file to everything that uses it, in one direction.
        </p>
        <div className="section-body">
          <Pipelines />
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Why it&rsquo;s built this way</h2>
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

      <section className="section">
        <h2 className="section-title">Explore</h2>
        <p className="section-intro">
          Every token in both themes, laid out like the Figma file&rsquo;s Foundations pages.
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
