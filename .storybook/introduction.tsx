import type { JSX, ReactNode } from 'react'
import { SELECT_STORY } from 'storybook/internal/core-events'
import { addons } from 'storybook/preview-api'

import {
  AlertIcon,
  AppsIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  Badge,
  BarMeter,
  BrandIcon,
  BrowsingIcon,
  Button,
  Card,
  CardBody,
  CardHeader,
  CheckIcon,
  ChevronRightIcon,
  CloudIcon,
  ComputerIcon,
  DevicesIcon,
  EditIcon,
  EventsIcon,
  GamepadIcon,
  HdStreamIcon,
  HomeIcon,
  IconTile,
  LayersIcon,
  Link,
  LiveBadge,
  MessageIcon,
  NavItem,
  NavRail,
  PlayIcon,
  Readout,
  SearchIcon,
  SegmentedControl,
  SettingsIcon,
  ShieldAlertIcon,
  SpeedIcon,
  Spinner,
  SplitBar,
  StatusDot,
  TitleBar,
  TitleBarStatus,
  Toggle,
  UI_LIBRARY_VERSION,
  VideoCallIcon,
  WindowButton,
} from '../src/ui'
import catalogue from '../src/ui/components.gen.json'
import figma from '../src/ui/figma.json'

const TOKENS_STORYBOOK = 'https://rove.swiftsolve.net/storybook/tokens/'
const noop = (): void => {}

type Component = { group: string; figma: unknown; stories: string[]; guidance?: unknown }
const components = Object.entries(catalogue.components as Record<string, Component>)

// Every figure on the page is counted from the catalogue, so none can go stale.
const storyCount = components.reduce((sum, [, { stories }]) => sum + stories.length, 0)
const inFigma = components.filter(([, component]) => component.figma !== null).length
const withGuide = components.filter(([, component]) => component.guidance).length
const figmaExceptions = Object.values(figma.components as Record<string, Record<string, object> | null>).reduce(
  (sum, entry) =>
    sum + ['codeOnly', 'figmaOnly', 'valuesDiffer'].reduce((n, kind) => n + Object.keys(entry?.[kind] ?? {}).length, 0),
  0,
)

/** The groups in the library's order, each with its components and the Docs page of its first. */
const groups = [...new Set(components.map(([, { group }]) => group))].map((group) => {
  const members = components.filter(([, component]) => component.group === group)
  const firstStory = members.find(([, { stories }]) => stories.length > 0)?.[1].stories[0]
  return { group, count: members.length, docsId: firstStory?.replace(/--.*$/, '--docs') }
})

/** Opens another Docs page in Storybook, as a sidebar click does. */
function openDocs(id: string): void {
  addons.getChannel().emit(SELECT_STORY, { storyId: id, viewMode: 'docs' })
}

/** `code` in backticks. */
function Prose({ text }: { text: string }): JSX.Element {
  return <>{text.split('`').map((part, i) => (i % 2 === 1 ? <code key={i}>{part}</code> : part))}</>
}

/** A slice of the Rove window, live: every piece is a library component. */
function AppWindow(): JSX.Element {
  const brand = (
    <>
      <span className="intro-brand-mark" aria-hidden>
        <BrandIcon size={20} />
      </span>
      <span className="type-heading-medium intro-brand-name">Rove</span>
    </>
  )
  const pages = [
    { label: 'Home', icon: HomeIcon },
    { label: 'Speed', icon: SpeedIcon },
    { label: 'Devices', icon: DevicesIcon },
    { label: 'Apps', icon: AppsIcon },
    { label: 'Services', icon: CloudIcon },
    { label: 'Timeline', icon: EventsIcon },
  ]
  const capabilities = [
    { label: 'Browsing', icon: <BrowsingIcon size={17} />, bars: 4 },
    { label: 'HD video', icon: <HdStreamIcon size={17} />, bars: 4 },
    { label: 'Video calls', icon: <VideoCallIcon size={17} />, bars: 3 },
    { label: 'Gaming', icon: <GamepadIcon size={17} />, bars: 2 },
  ]
  return (
    <figure className="intro-window" aria-label="A slice of the Rove app, built from these components">
      <TitleBar
        brand={brand}
        status={<TitleBarStatus tone="positive">Wi‑Fi</TitleBarStatus>}
        controls={
          <>
            <WindowButton action="minimize" onClick={noop} />
            <WindowButton action="close" onClick={noop} />
          </>
        }
      />
      <div className="intro-window-body">
        <NavRail
          label="Pages"
          main={pages.map(({ label, icon }) => (
            <NavItem key={label} label={label} icon={icon} isActive={label === 'Home'} onClick={noop} />
          ))}
          footer={<NavItem label="Settings" icon={SettingsIcon} onClick={noop} />}
        />
        <div className="intro-window-content">
          <Card>
            <CardHeader title="Live traffic" icon={<SpeedIcon size={16} />} actions={<LiveBadge />} />
            <CardBody>
              <dl className="intro-window-readouts">
                <Readout label="Download" value="182" unit="Mbps" icon={<ArrowDownIcon size={13} />} />
                <Readout label="Upload" value="24.6" unit="Mbps" icon={<ArrowUpIcon size={13} />} />
              </dl>
              <SplitBar down={182} up={24.6} max={240} label="182 Mbps down, 24.6 up" />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Capabilities" icon={<LayersIcon size={16} />} />
            <CardBody>
              <ul className="intro-window-capabilities">
                {capabilities.map(({ label, icon, bars }) => (
                  <li key={label}>
                    <IconTile icon={icon} color="var(--status-positive)" />
                    <BarMeter value={bars} size="sm" color="var(--status-positive)" />
                    <span className="type-caption">{label}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
          <div className="intro-window-row">
            <Card>
              <CardHeader title="Devices" icon={<DevicesIcon size={16} />} />
              <CardBody>
                <p className="intro-window-online">
                  <StatusDot tone="positive" pulse="calm" />
                  <span className="type-number-default">16</span> online
                </p>
              </CardBody>
            </Card>
            <Card>
              <CardHeader
                title="Security"
                icon={<ShieldAlertIcon size={16} />}
                actions={<Badge tone="positive">VPN</Badge>}
              />
              <CardBody>
                <p className="type-body-small">WPA3, behind a VPN.</p>
              </CardBody>
            </Card>
          </div>
        </div>
      </div>
    </figure>
  )
}

/** A live sample of each group, inert so the card around it stays one link. */
const PREVIEWS: Record<string, ReactNode> = {
  Actions: (
    <>
      <Button variant="solid" icon={PlayIcon} onClick={noop}>
        Run test
      </Button>
      <Button onClick={noop}>Reset</Button>
    </>
  ),
  Inputs: (
    <>
      <SegmentedControl
        label="Range"
        value="day"
        onChange={noop}
        options={[
          { value: 'day', label: 'Day' },
          { value: 'week', label: 'Week' },
        ]}
      />
      <Toggle label="Alerts" isChecked onChange={noop} />
    </>
  ),
  Overlays: <IconTile icon={<MessageIcon size={17} />} color="var(--accent-default)" size="lg" />,
  'Status and feedback': (
    <>
      <LiveBadge />
      <Badge tone="positive">VPN</Badge>
      <Badge tone="warning">Slow</Badge>
      <Spinner size={22} />
    </>
  ),
  'Data display': (
    <>
      <Readout value="182" unit="Mbps" size="compact" />
      <BarMeter value={3} size="md" color="var(--status-positive)" />
    </>
  ),
  Containers: (
    <div className="intro-preview-card">
      <Card>
        <CardHeader title="Devices" icon={<DevicesIcon size={16} />} />
      </Card>
    </div>
  ),
  'App frame': (
    <>
      <NavItem label="Home" icon={HomeIcon} isActive onClick={noop} />
      <NavItem label="Speed" icon={SpeedIcon} onClick={noop} />
      <TitleBarStatus tone="positive">Wi‑Fi</TitleBarStatus>
    </>
  ),
  Accessibility: <IconTile icon={<CheckIcon size={17} />} color="var(--status-positive)" size="lg" />,
}

const STEPS = [
  { name: 'Figma', line: 'Variables, text styles and every component.', icon: <EditIcon size={18} />, to: 'exported' },
  {
    name: 'rove-tokens',
    line: 'CSS variables, the theme and `DESIGN.md`.',
    icon: <LayersIcon size={18} />,
    to: 'the only theme',
  },
  {
    name: 'Rove Components',
    line: 'React, styled only with tokens.',
    icon: <AppsIcon size={18} />,
    to: 'imported from `@/ui`',
  },
  { name: 'Rove', line: 'Every screen, built from the library.', icon: <ComputerIcon size={18} /> },
]

const LAYERS = [
  {
    name: 'Context',
    line: 'So agents know what exists.',
    color: 'var(--accent-default)',
    icon: <SearchIcon size={17} />,
    points: ['`AGENTS.md` routes each task', '`DESIGN.md` loads with UI work', 'A catalogue generated from code'],
  },
  {
    name: 'Constraint',
    line: 'So drift fails as it’s written.',
    color: 'var(--status-warning)',
    icon: <AlertIcon size={17} />,
    points: ['A theme with only tokens', 'No raw values, spacing on the scale', 'A `className` places, never restyles'],
  },
  {
    name: 'Checks',
    line: 'So the system stays true.',
    color: 'var(--status-positive)',
    icon: <CheckIcon size={17} />,
    points: [
      `${storyCount} stories, each run through axe`,
      'Figma variants held to the props',
      `${figmaExceptions} Figma differences, each with why`,
    ],
  },
]

const OFF_SYSTEM = `<div className="rounded-[8px] bg-[#f3f4f6] p-[12px]">
  <button onClick={retry}>Retry</button>
</div>`

// The checks' own words, from raw-values.mjs and eslint.config.js.
const ERRORS = [
  'rounded-[8px] is --radius-sm; use rounded-sm',
  '#f3f4f6 is a raw colour; use a colour token',
  'p-[12px] is --spacing-12; use p-12',
  'Use a button from @/ui (Button, IconButton, ListRow, StretchedLink…), not a raw <button>.',
]

const ON_SYSTEM = `<Card>
  <CardBody>
    <Button onClick={retry}>Retry</Button>
  </CardBody>
</Card>`

function SectionHead({ id, overline, title, intro }: { id: string; overline: string; title: string; intro?: string }) {
  return (
    <header className="intro-section-head">
      <p className="type-overline intro-overline">{overline}</p>
      <h2 id={id} className="intro-h2">
        {title}
      </h2>
      {intro && <p className="intro-section-intro">{intro}</p>}
    </header>
  )
}

/** The library's front page, built from its own components. */
export function Introduction(): JSX.Element {
  return (
    <div className="intro sb-unstyled">
      <section className="intro-hero" aria-labelledby="intro-title">
        <div className="intro-hero-copy">
          <p className="intro-pill">Rove Design System</p>
          <h1 id="intro-title">Rove Components</h1>
          <p className="intro-lead">
            Rove&rsquo;s interface as a React library, built so people and agents make the same UI, from Figma to the
            app.
          </p>
          <p className="intro-hero-links">
            <Link onClick={() => openDocs('actions-button--docs')}>Start with Button</Link>
            <Link href={figma.file}>Open the Figma file</Link>
            <Link href={TOKENS_STORYBOOK}>Rove Tokens</Link>
          </p>
          <dl className="intro-stats">
            <Readout label="Components" value={String(components.length)} />
            <Readout label="Stories" value={String(storyCount)} />
            <Readout label="In Figma" value={String(inFigma)} unit={`/ ${components.length}`} />
            <Readout label="Usage guides" value={String(withGuide)} unit={`/ ${components.length}`} />
          </dl>
        </div>
        <AppWindow />
      </section>

      <div className="intro-body">
        <section className="intro-section" aria-labelledby="intro-how">
          <SectionHead
            id="intro-how"
            overline="How it works"
            title="One source, four steps"
            intro="Figma is the source of truth. Each step takes only what the one before it made."
          />
          <ol className="intro-pipeline">
            {STEPS.map(({ name, line, icon, to }) => (
              <li key={name}>
                <div className="intro-step">
                  <IconTile icon={icon} color="var(--accent-default)" size="lg" />
                  <strong className="type-heading-small">{name}</strong>
                  <span className="type-body-small">
                    <Prose text={line} />
                  </span>
                </div>
                {to && (
                  <span className="intro-connector type-caption">
                    <span className="intro-connector-line" aria-hidden />
                    <span>
                      <Prose text={to} />
                    </span>
                    <ChevronRightIcon size={14} />
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>

        <section className="intro-section" aria-labelledby="intro-drift">
          <SectionHead
            id="intro-drift"
            overline="Why it matters"
            title="Agents drift. Rove catches it."
            intro="An agent can read every token and still write from its training data. Here the checks answer in their own words."
          />
          <div className="intro-compare">
            <figure className="intro-panel intro-panel-off">
              <figcaption className="type-label-default">
                <AlertIcon size={15} /> What an agent writes
              </figcaption>
              <pre>
                <code>{OFF_SYSTEM}</code>
              </pre>
              <ul className="intro-errors" aria-label="npm run check">
                {ERRORS.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </figure>
            <figure className="intro-panel intro-panel-on">
              <figcaption className="type-label-default">
                <CheckIcon size={15} /> What lands
              </figcaption>
              <pre>
                <code>{ON_SYSTEM}</code>
              </pre>
              <div className="intro-panel-render" inert>
                <Card>
                  <CardBody>
                    <Button onClick={noop}>Retry</Button>
                  </CardBody>
                </Card>
              </div>
            </figure>
          </div>
        </section>

        <section className="intro-section" aria-labelledby="intro-layers">
          <SectionHead id="intro-layers" overline="How agents stay on-system" title="Context, constraint, checks" />
          <ul className="intro-layers">
            {LAYERS.map(({ name, line, color, icon, points }) => (
              <li key={name} className="intro-layer">
                <IconTile icon={icon} color={color} size="lg" />
                <h3 className="type-heading-small">{name}</h3>
                <p className="type-body-small">{line}</p>
                <ul>
                  {points.map((point) => (
                    <li key={point}>
                      <Prose text={point} />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>

        <section className="intro-section" aria-labelledby="intro-components">
          <SectionHead id="intro-components" overline="Components" title="Every group, live" />
          <ul className="intro-gallery">
            {groups.map(({ group, count, docsId }) => (
              <li key={group}>
                <Card onOpen={docsId ? () => openDocs(docsId) : undefined} linkLabel={`${group} components`}>
                  <div className="intro-preview" inert>
                    {PREVIEWS[group]}
                  </div>
                  <CardHeader title={group} actions={<span className="type-caption">{count}</span>} />
                </Card>
              </li>
            ))}
          </ul>
        </section>

        <footer className="intro-footer">
          <span>Version {UI_LIBRARY_VERSION}</span>
          <Link href={figma.file}>Figma file</Link>
          <Link href={TOKENS_STORYBOOK}>Rove Tokens</Link>
        </footer>
      </div>
    </div>
  )
}
