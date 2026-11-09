import './introduction.css'

import { useEffect, useRef, useState } from 'react'

import designPackage from '../package.json'
import { BRAND_ICONS } from './brand-icons'
import { colorDark, flatten, palette, spacing, textStyles, tokensInGroup } from './tokens'

export default { title: 'Introduction' }

const REPO_URL = 'https://github.com/swiftsolve/rove-tokens'
const FIGMA_URL = 'https://www.figma.com/design/NoICIoyhWNOya9tOnNfEhH/Rove-Design-System'
// The Rove Components Storybook, built from these tokens.
const COMPONENTS_URL = 'https://rove.swiftsolve.net/storybook/'

// A Storybook page, from inside the preview iframe: `./?path=` is the manager.
const storyHref = (id) => `./?path=/story/${id}`

// Backticks in the copy below become inline code.
// A code chip may break only after a slash (`src/` | `code-tokens.json`), never
// at a hyphen, so a narrow column wraps a path without splitting a name.
const codeSegments = (code) =>
  code.split(/(?<=\/)/).map((segment, index) => (
    <span key={index} className="intro-code-part">
      {segment}
    </span>
  ))

// Splitting on backticks puts the code at the odd indexes.
const withInlineCode = (text) =>
  text.split('`').map((part, index) =>
    index % 2 === 1 ? (
      <code key={index} className="intro-code">
        {codeSegments(part)}
      </code>
    ) : (
      part
    ),
  )

// Rove's count-up (src/ui/hooks/useCountUp.ts): each frame covers this share of
// the gap, and the number snaps on once it's this close.
const EASE_FACTOR = 0.18
const SNAP_THRESHOLD = 0.05

// A number that counts up to `hoverValue` while its card is hovered or focused, and
// back down to `restingValue` when it's left, the same way each time, with Rove's readout
// ease. It holds still under reduced motion.
function CountUp({ restingValue, hoverValue, className }) {
  const numberRef = useRef(null)
  const [value, setValue] = useState(restingValue)
  useEffect(() => {
    const card = numberRef.current?.closest('.intro-card')
    if (!card) return undefined
    let frame = 0
    let current = restingValue
    let target = restingValue
    const stepTowardTarget = () => {
      const remaining = target - current
      if (Math.abs(remaining) < SNAP_THRESHOLD) {
        current = target
        setValue(current)
        frame = 0
        return
      }
      current += remaining * EASE_FACTOR
      setValue(current)
      frame = requestAnimationFrame(stepTowardTarget)
    }
    const easeTo = (next) => {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
      target = next
      if (!frame) frame = requestAnimationFrame(stepTowardTarget)
    }
    const onEnter = () => easeTo(hoverValue)
    const onLeave = () => easeTo(restingValue)
    card.addEventListener('mouseenter', onEnter)
    card.addEventListener('mouseleave', onLeave)
    card.addEventListener('focus', onEnter)
    card.addEventListener('blur', onLeave)
    return () => {
      cancelAnimationFrame(frame)
      card.removeEventListener('mouseenter', onEnter)
      card.removeEventListener('mouseleave', onLeave)
      card.removeEventListener('focus', onEnter)
      card.removeEventListener('blur', onLeave)
    }
  }, [restingValue, hoverValue])
  return (
    <span ref={numberRef} className={className}>
      {Math.round(value)}
    </span>
  )
}

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
function RoveMark({ className = 'intro-icon' }) {
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
  // Primitives under semantic tokens.
  layers: [
    'M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z',
    'm22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65',
    'm22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65',
  ],
  tag: [
    'M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z',
    'M7.5 7.5h.01',
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
  lightbulb: [
    'M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5',
    'M9 18h6',
    'M10 22h4',
  ],
  github: [
    'M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4',
    'M9 18c-4.51 2-5-2-7-2',
  ],
}

function Icon({ name, label }) {
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
// README.md's How it works is a screenshot of this diagram, in each theme
// (docs/assets/how-it-works-*.png): retake both when it changes.
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
        icons: ['figma', 'step', 'braces'],
        items: [
          {
            name: '`src/figma/*.json`',
            body: 'All three, as the Rove Tokens plugin exports them. Never edited by hand.',
          },
          {
            name: '`src/code-tokens.json`',
            body: "Only what Figma can't hold: the spring's CSS curve, the focus outline, font fallbacks.",
          },
        ],
      },
      {
        column: 3,
        icons: ['node', 'step', 'dtcg', 'step', 'css'],
        items: [
          {
            name: '`npm run build`',
            body: 'Writes DTCG, then the CSS with Style Dictionary, the Tailwind theme and DESIGN.md’s token list.',
          },
        ],
      },
      {
        column: 4,
        icons: ['npm'],
        items: [
          {
            name: '`@swiftsolve/rove-tokens`',
            body: '`tokens.css`, `text-styles.css`, the Tailwind theme and the DTCG files, on npm.',
          },
          {
            name: '`DESIGN.md`',
            body: 'Which token to use for what, with every token and its use, shipped alongside.',
          },
        ],
      },
    ],
  },
]

const CHECKS = [
  {
    icon: 'node',
    name: '`npm run check`',
    body: 'The build stops on a token that points nowhere, has no description, or a CSS name off its Figma name. Then every colour is held to WCAG AA, and DESIGN.md to its format.',
  },
  {
    icon: 'figma',
    name: 'Figma check',
    body: '`npm run figma:check` lists every token that differs between the Figma file and the repo.',
  },
  {
    icon: 'eslint',
    name: 'Rove’s lint',
    body: 'Fails the app on a raw colour or spacing where a token belongs, and on a misspelt token name.',
  },
]

const CONSUMERS = [
  {
    icon: 'rove',
    name: 'Rove',
    body: 'The app and its component library import `tokens.css`, `text-styles.css` and the Tailwind theme, and style with nothing else.',
    href: COMPONENTS_URL,
  },
  {
    icons: ['claude', 'openai', 'cursor', 'copilot', 'gemini'],
    name: 'Coding agents',
    body: 'Read `DESIGN.md` from `node_modules`: every token with its use, and which to pick for what.',
  },
  {
    icon: 'storybook',
    name: 'This Storybook',
    body: 'Reads the DTCG files in `dist/tokens/`, so it follows every build.',
  },
]

const PRINCIPLES = [
  {
    icon: 'figmaLine',
    lead: 'Figma is the source of truth',
    body: 'Tokens flow one way: designed there, exported, built. Nothing writes back to Figma, and nothing in `dist/` is edited by hand.',
  },
  {
    icon: 'layers',
    lead: 'A scale, then a role',
    body: '`spacing/12` is a step on a scale. `card/padding` names a job and points at a step. Use the job when there is one.',
  },
  {
    icon: 'accessibility',
    lead: 'Readable in both themes',
    body: 'Text clears WCAG 2.2 AA (4.5:1) and icons, bars and dots 3:1, in Dark and Light.',
  },
  {
    icon: 'sparkles',
    lead: 'Written down for agents',
    body: '`DESIGN.md` says which token to use for what, and lists every one with its use in the DESIGN.md format. It ships in the package.',
  },
]

function Item({ name, body, href }) {
  const title = withInlineCode(name)
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
      <span className="intro-item-body">{withInlineCode(body)}</span>
    </div>
  )
}

// A step or a card in the diagram: its icons in a row, then what it says.
function PipelineNode({ icons, children, style, className = '' }) {
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
              const isSkippingStage = index > 0 && column - steps[index - 1].column > 1
              return (
                <PipelineNode
                  key={column}
                  icons={icons}
                  style={{ gridColumn: column }}
                  className={[index > 0 && 'has-flow', isSkippingStage && 'has-skip'].filter(Boolean).join(' ')}
                >
                  <span className="intro-stage intro-stage-inline">{STAGES[column - 1]}</span>
                  {items.map((item) => (
                    <Item key={item.name} {...item} />
                  ))}
                </PipelineNode>
              )
            })}
          </ol>
        </div>
      ))}
      {[
        { title: 'Checked by', summary: 'What fails when a token goes wrong.', cards: CHECKS },
        { title: 'Used by', summary: 'What a token change reaches.', cards: CONSUMERS },
      ].map(({ title, summary, cards }) => (
        <div key={title} className="intro-pipeline">
          <div className="intro-pipeline-title">
            <h3>{title}</h3>
            <p>{summary}</p>
          </div>
          <ul className="intro-consumers">
            {/* A card names one icon, or a row of them in icons. */}
            {cards.map(({ icon, icons = [icon], ...item }) => (
              <PipelineNode key={item.name} icons={icons}>
                <Item {...item} />
              </PipelineNode>
            ))}
          </ul>
        </div>
      ))}
    </figure>
  )
}

// The pages, each with a small specimen drawn with the tokens it lists.
const EXPLORE_CARDS = [
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
    body: `${flatten(textStyles).length} text styles in Urbanist and Hanken Grotesk, each four variables and a class.`,
    // Both families: the text face, and the numeric one figures are set in.
    specimen: (
      <span className="intro-type-pair">
        <span className="intro-type type-heading-large">Aa</span>
        <CountUp className="intro-type type-number-display" restingValue={182} hoverValue={240} />
      </span>
    ),
  },
  {
    id: 'space-shape-effects--space-shape-effects',
    title: 'Space, shape & effects',
    body: `A ${tokensInGroup(spacing, 'spacing').length}-step spacing scale in 2px steps, with the radii, shadows and opacities.`,
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
      // up to the fill, a dot rides its tip, and a dimmed track runs on. On
      // hover it fills to the end.
      <svg className="intro-wavy" viewBox="0 0 216 16" width="216" height="16">
        <defs>
          <clipPath id="intro-wavy-fill">
            <rect className="intro-wavy-clip" x="0" y="0" width="108" height="16" />
          </clipPath>
        </defs>
        <g clipPath="url(#intro-wavy-fill)">
          <path
            className="intro-wavy-wave"
            d="M -40.00 8.00 Q -40.00 8.00 -38.50 8.57 Q -37.00 9.13 -35.50 9.58 Q -34.00 10.02 -32.50 10.25 Q -31.00 10.47 -29.50 10.42 Q -28.00 10.38 -26.50 10.07 Q -25.00 9.77 -23.50 9.27 Q -22.00 8.77 -20.50 8.19 Q -19.00 7.61 -17.50 7.07 Q -16.00 6.53 -14.50 6.15 Q -13.00 5.77 -11.50 5.64 Q -10.00 5.50 -8.50 5.64 Q -7.00 5.77 -5.50 6.15 Q -4.00 6.53 -2.50 7.07 Q -1.00 7.61 0.50 8.19 Q 2.00 8.77 3.50 9.27 Q 5.00 9.77 6.50 10.07 Q 8.00 10.38 9.50 10.42 Q 11.00 10.47 12.50 10.25 Q 14.00 10.02 15.50 9.58 Q 17.00 9.13 18.50 8.57 Q 20.00 8.00 21.50 7.43 Q 23.00 6.87 24.50 6.42 Q 26.00 5.98 27.50 5.75 Q 29.00 5.53 30.50 5.58 Q 32.00 5.62 33.50 5.93 Q 35.00 6.23 36.50 6.73 Q 38.00 7.23 39.50 7.81 Q 41.00 8.39 42.50 8.93 Q 44.00 9.47 45.50 9.85 Q 47.00 10.23 48.50 10.36 Q 50.00 10.50 51.50 10.36 Q 53.00 10.23 54.50 9.85 Q 56.00 9.47 57.50 8.93 Q 59.00 8.39 60.50 7.81 Q 62.00 7.23 63.50 6.73 Q 65.00 6.23 66.50 5.93 Q 68.00 5.62 69.50 5.58 Q 71.00 5.53 72.50 5.75 Q 74.00 5.98 75.50 6.42 Q 77.00 6.87 78.50 7.43 Q 80.00 8.00 81.50 8.57 Q 83.00 9.13 84.50 9.58 Q 86.00 10.02 87.50 10.25 Q 89.00 10.47 90.50 10.42 Q 92.00 10.38 93.50 10.07 Q 95.00 9.77 96.50 9.27 Q 98.00 8.77 99.50 8.19 Q 101.00 7.61 102.50 7.07 Q 104.00 6.53 105.50 6.15 Q 107.00 5.77 108.50 5.64 Q 110.00 5.50 111.50 5.64 Q 113.00 5.77 114.50 6.15 Q 116.00 6.53 117.50 7.07 Q 119.00 7.61 120.50 8.19 Q 122.00 8.77 123.50 9.27 Q 125.00 9.77 126.50 10.07 Q 128.00 10.38 129.50 10.42 Q 131.00 10.47 132.50 10.25 Q 134.00 10.02 135.50 9.58 Q 137.00 9.13 138.50 8.57 Q 140.00 8.00 141.50 7.43 Q 143.00 6.87 144.50 6.42 Q 146.00 5.98 147.50 5.75 Q 149.00 5.53 150.50 5.58 Q 152.00 5.62 153.50 5.93 Q 155.00 6.23 156.50 6.73 Q 158.00 7.23 159.50 7.81 Q 161.00 8.39 162.50 8.93 Q 164.00 9.47 165.50 9.85 Q 167.00 10.23 168.50 10.36 Q 170.00 10.50 171.50 10.36 Q 173.00 10.23 174.50 9.85 Q 176.00 9.47 177.50 8.93 Q 179.00 8.39 180.50 7.81 Q 182.00 7.23 183.50 6.73 Q 185.00 6.23 186.50 5.93 Q 188.00 5.62 189.50 5.58 Q 191.00 5.53 192.50 5.75 Q 194.00 5.98 195.50 6.42 Q 197.00 6.87 198.50 7.43 Q 200.00 8.00 201.50 8.57 Q 203.00 9.13 204.50 9.58 Q 206.00 10.02 207.50 10.25 Q 209.00 10.47 210.50 10.42 Q 212.00 10.38 213.50 10.07 Q 215.00 9.77 216.00 9.47"
          />
        </g>
        <line className="intro-wavy-track" x1="117" y1="8" x2="214.5" y2="8" />
        <circle className="intro-wavy-dot" cx="108" cy="8" r="5" />
      </svg>
    ),
  },
]

// Line icons in the link's accent, so the four read as one row.
const LINKS = [
  { icon: 'figmaLine', label: 'Figma file', href: FIGMA_URL },
  { icon: 'fileText', label: 'DESIGN.md', href: `${REPO_URL}/blob/main/DESIGN.md` },
  { icon: 'lightbulb', label: 'Rationale', href: `${REPO_URL}/blob/main/docs/rationale.md` },
  { icon: 'github', label: 'GitHub', href: REPO_URL },
  { icon: 'rove', label: 'Rove components', href: COMPONENTS_URL },
]

function IntroductionPage() {
  return (
    <main className="page intro">
      <header className="intro-hero">
        <p className="page-label">Design tokens</p>
        <h1 className="page-title intro-title">
          <RoveMark className="intro-hero-mark" />
          Rove Tokens
        </h1>
        <p className="intro-package">
          <a
            className="intro-package-link"
            href={`https://www.npmjs.com/package/${designPackage.name}`}
            target="_blank"
            rel="noreferrer"
          >
            <code className="intro-code">{designPackage.name}</code>
          </a>
          <span className="intro-version">v{designPackage.version}</span>
        </p>
        <p className="page-intro">
          Every colour, size, font and duration in Rove, designed once in Figma and shipped as CSS and DTCG. Change a
          token there, export it, and one build carries it to the app, its coding agents and these pages.
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
        <h2 className="section-title">Principles</h2>
        <ul className="intro-explore">
          {PRINCIPLES.map(({ icon, lead, body }) => (
            <li key={lead}>
              <div className="intro-principle">
                <span className="intro-principle-icon" aria-hidden="true">
                  <Icon name={icon} />
                </span>
                <span className="intro-card-title">{lead}</span>
                <span className="intro-principle-body">{withInlineCode(body)}</span>
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
          {EXPLORE_CARDS.map(({ id, title, body, specimen }) => (
            <li key={id}>
              <a className="intro-card" href={storyHref(id)} target="_top">
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
