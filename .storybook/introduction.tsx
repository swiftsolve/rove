import { type JSX, useEffect, useId, useRef, useState } from 'react'

import {
  AppsIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  Badge,
  BarMeter,
  BrowsingIcon,
  Card,
  CardBody,
  CardHeader,
  CheckIcon,
  CloudIcon,
  DevicesIcon,
  EditIcon,
  EventsIcon,
  GamepadIcon,
  HdStreamIcon,
  HelpIcon,
  HomeIcon,
  IconTile,
  InlineMeta,
  LayersIcon,
  Link,
  LiveBadge,
  LockIcon,
  MessageIcon,
  NavItem,
  NavRail,
  PlayIcon,
  PulseIcon,
  Readout,
  SettingsIcon,
  SpeedIcon,
  StatusDot,
  SunIcon,
  TitleBar,
  TitleBarStatus,
  UI_LIBRARY_VERSION,
  UsageIcon,
  VideoCallIcon,
  WifiIcon,
  WindowButton,
} from '../src/ui'
import catalogue from '../src/ui/components.gen.json'
import figma from '../src/ui/figma.json'

const TOKENS_STORYBOOK = 'https://rove.swiftsolve.net/storybook/tokens/'
const noop = (): void => {}

type Component = { group: string; figma: { node: string } | null; stories: string[] }
const components = Object.entries(catalogue.components as Record<string, Component>)

// Every figure on the page is counted from the catalogue, so none can go stale.
const storyCount = components.reduce((sum, [, { stories }]) => sum + stories.length, 0)
const inFigma = components.filter(([, component]) => component.figma !== null).length
const figmaNodes = new Set(components.flatMap(([, component]) => (component.figma ? [component.figma.node] : []))).size

/** A Docs page's address, from inside Storybook's preview frame. */
const docsHref = (id: string): string => `./?path=/docs/${id}`

/** What each group holds, in a line; a group added later falls back to its members' names. */
const GROUP_COPY: Record<string, { icon: JSX.Element; blurb: string }> = {
  Actions: { icon: <PlayIcon size={18} />, blurb: 'Buttons and links: run a test, open a view.' },
  Inputs: { icon: <EditIcon size={18} />, blurb: 'Fields, switches and segmented choices.' },
  Overlays: { icon: <MessageIcon size={18} />, blurb: 'Dialogs, menus and tooltips, portalled.' },
  'Status and feedback': { icon: <PulseIcon size={18} />, blurb: 'Badges, dots, spinners and banners.' },
  'Data display': { icon: <UsageIcon size={18} />, blurb: 'Readouts, meters and data rows.' },
  Containers: { icon: <LayersIcon size={18} />, blurb: 'Cards, collapsibles and separators.' },
  'App frame': { icon: <HomeIcon size={18} />, blurb: 'Title bar, nav rail and page header.' },
  Accessibility: { icon: <HelpIcon size={18} />, blurb: 'What screen readers hear as things change.' },
}

const groups = [...new Set(components.map(([, { group }]) => group))].map((group) => {
  const members = components.filter(([, component]) => component.group === group)
  const firstStory = members.find(([, { stories }]) => stories.length > 0)?.[1].stories[0]
  return {
    group,
    count: members.length,
    docsId: firstStory?.replace(/--.*$/, '--docs') ?? 'introduction--docs',
    icon: GROUP_COPY[group]?.icon ?? <AppsIcon size={18} />,
    blurb: GROUP_COPY[group]?.blurb ?? members.map(([name]) => name).join(', '),
  }
})
const half = Math.ceil(groups.length / 2)

/** The Rove mark in the app icon's gradient, its dot breathing and a glint running the arc. */
function AnimatedMark({ size }: { size: number }): JSX.Element {
  const id = useId()
  const arc = 'M 11.98 36.02 A 17 17 0 1 1 36.02 36.02'
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="24" y1="7" x2="24" y2="41" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--series-down)" />
          <stop offset="1" stopColor="var(--accent-default)" />
        </linearGradient>
      </defs>
      <circle className="intro-mark-dot" cx="24" cy="24" r="7.5" fill={`url(#${id})`} />
      <path d={arc} stroke={`url(#${id})`} strokeWidth="5" strokeLinecap="round" />
      <path className="intro-mark-glint" d={arc} pathLength={100} strokeWidth="5" strokeLinecap="round" />
    </svg>
  )
}

/** The Rove window, drawn with the library: the title bar, the rail and Home's cards. */
function AppWindow(): JSX.Element {
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
    { label: 'Calls', icon: <VideoCallIcon size={17} />, bars: 3 },
    { label: 'Gaming', icon: <GamepadIcon size={17} />, bars: 2 },
  ]
  return (
    <figure className="intro-window" aria-label="Rove's Home screen, drawn with these components">
      <TitleBar
        brand={
          <>
            <span className="intro-window-mark" aria-hidden>
              <AnimatedMark size={22} />
            </span>
            <span className="type-heading-medium intro-window-name">Rove</span>
          </>
        }
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
          footer={
            <>
              <NavItem label="Theme" icon={SunIcon} onClick={noop} />
              <NavItem label="Settings" icon={SettingsIcon} onClick={noop} />
            </>
          }
        />
        <div className="intro-window-content">
          <Card>
            <CardBody>
              <div className="intro-window-network">
                <IconTile icon={<WifiIcon size={18} />} color="var(--accent-default)" size="lg" />
                <div className="intro-window-network-copy">
                  <p className="type-heading-medium">Starlight_5G</p>
                  <InlineMeta
                    className="type-body-small"
                    items={[
                      '192.168.1.42',
                      '5 GHz',
                      <span key="security" className="intro-window-secure">
                        <LockIcon size={12} /> WPA3
                      </span>,
                    ]}
                  />
                </div>
                <BarMeter value={4} size="md" color="var(--status-positive)" />
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Live traffic" icon={<PulseIcon size={16} />} actions={<LiveBadge />} />
            <CardBody>
              <dl className="intro-window-pair">
                <Readout label="Download" value="182" unit="Mbps" icon={<ArrowDownIcon size={13} />} />
                <Readout label="Upload" value="24.6" unit="Mbps" icon={<ArrowUpIcon size={13} />} />
              </dl>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Capabilities" icon={<SpeedIcon size={16} />} />
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
              <CardHeader title="Usage" icon={<UsageIcon size={16} />} />
              <CardBody>
                <div className="intro-window-pair">
                  <Readout value="4.90" unit="GB" size="compact" icon={<ArrowDownIcon size={13} />} />
                  <Readout value="600" unit="MB" size="compact" icon={<ArrowUpIcon size={13} />} />
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardHeader
                title="Devices"
                icon={<DevicesIcon size={16} />}
                actions={<Badge tone="positive">New</Badge>}
              />
              <CardBody>
                <p className="intro-window-online">
                  <StatusDot tone="positive" pulse="calm" />
                  <span className="type-number-default">16</span> online
                </p>
              </CardBody>
            </Card>
          </div>
        </div>
      </div>
    </figure>
  )
}

function Stop({ group, count, docsId, icon, blurb, isActive }: (typeof groups)[number] & { isActive: boolean }) {
  return (
    <a className={`intro-stop${isActive ? ' is-active' : ''}`} href={docsHref(docsId)} target="_top">
      <span className="intro-stop-title">
        {icon}
        {group}
        <span className="intro-stop-count">{count}</span>
      </span>
      <span className="intro-stop-blurb">{blurb}</span>
    </a>
  )
}

type Line = { key: string; value: string; tone?: 'negative' | 'positive' }

// An agent's off-system card, then the fixed one: the checks answer in their
// own words (raw-values.mjs, eslint.config.js, checks/figma.mjs).
const SESSION: { command: string; lines: Line[] }[] = [
  {
    command: 'npm run check',
    lines: [
      { key: 'raw-values', value: 'rounded-[8px] is --radius-sm; use rounded-sm', tone: 'negative' },
      { key: 'raw-values', value: '#f3f4f6 is a raw colour; use a colour token', tone: 'negative' },
      { key: 'raw-values', value: 'p-[12px] is --spacing-12; use p-12', tone: 'negative' },
      {
        key: 'eslint',
        value: 'Use a button from @/ui (Button, IconButton, ListRow, StretchedLink…), not a raw <button>.',
        tone: 'negative',
      },
    ],
  },
  {
    command: 'npm run check',
    lines: [
      { key: 'raw-values', value: 'OK' },
      { key: 'figma', value: `OK (${figmaNodes} nodes, their names and variants)` },
      { key: 'stories', value: `${storyCount} passed, axe at zero`, tone: 'positive' },
    ],
  },
]
const LINE_COUNT = SESSION.reduce((sum, { lines }) => sum + lines.length + 1, 0)

/** The checks, played as a session once the card is on screen; reduced motion shows it finished. */
function CheckTerminal(): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  // Reduced motion: no session, just the finished output.
  const [shown, setShown] = useState(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ? LINE_COUNT : 0,
  )

  useEffect(() => {
    const element = ref.current
    if (!element || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let timer: ReturnType<typeof setInterval> | undefined
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        timer = setInterval(() => {
          setShown((count) => {
            if (count + 1 >= LINE_COUNT) clearInterval(timer)
            return count + 1
          })
        }, 260)
      },
      { threshold: 0.35 },
    )
    observer.observe(element)
    return () => {
      observer.disconnect()
      clearInterval(timer)
    }
  }, [])

  let index = 0
  const isShown = (): boolean => index++ < shown
  return (
    <div className="intro-terminal" ref={ref}>
      <div className="intro-terminal-bar" aria-hidden>
        <span className="intro-terminal-light is-red" />
        <span className="intro-terminal-light is-amber" />
        <span className="intro-terminal-light is-green" />
        <span className="intro-terminal-title">src/features/retry</span>
      </div>
      <div className="intro-terminal-body">
        {SESSION.map(({ command, lines }, run) => (
          <div key={run} className="intro-terminal-run">
            <p className={`intro-terminal-prompt${isShown() ? ' is-shown' : ''}`}>
              <span className="intro-terminal-mark">$</span> {command}
            </p>
            {lines.map(({ key, value, tone }) => (
              <p key={value} className={`intro-terminal-line${isShown() ? ' is-shown' : ''}`}>
                <span className="intro-terminal-key">{key}</span>
                <span className={tone ? `intro-terminal-value is-${tone}` : 'intro-terminal-value'}>{value}</span>
              </p>
            ))}
          </div>
        ))}
        <p className="intro-terminal-prompt is-shown">
          <span className="intro-terminal-mark">$</span>
          <span className="intro-terminal-cursor" />
        </p>
      </div>
    </div>
  )
}

/** The library's front page, in the Rove landing page's design, built from the library itself. */
export function Introduction(): JSX.Element {
  return (
    <div className="intro sb-unstyled">
      <header className="intro-hero">
        <div className="intro-radar" aria-hidden>
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i} className="intro-blip" />
          ))}
        </div>
        <div className="intro-wrap">
          <span className="intro-logo" aria-hidden>
            <AnimatedMark size={90} />
          </span>
          <h1>
            One design system,
            <br />
            <span className="intro-accent">for people and agents</span>
          </h1>
          <p className="intro-sub">
            Rove Components is Rove&rsquo;s interface as a React library. A designer in Figma, a developer and a coding
            agent build with the same components, tokens and rules, and the checks keep it that way.
          </p>
          <div className="intro-ctas">
            <a className="intro-cta" href={docsHref('actions-button--docs')} target="_top">
              Explore the components
            </a>
            <Link href={figma.file}>Open the Figma file</Link>
          </div>
          <ul className="intro-meta">
            <li>
              <CheckIcon size={14} /> {components.length} components
            </li>
            <li>
              <CheckIcon size={14} /> {storyCount} stories, each run through axe
            </li>
            <li>
              <CheckIcon size={14} /> {inFigma} in Figma
            </li>
          </ul>
        </div>
      </header>

      <section className="intro-showcase" aria-labelledby="intro-live">
        <div className="intro-wrap">
          <div className="intro-section-head">
            <span className="intro-kicker">Live</span>
            <h2 id="intro-live">Every piece is the real thing</h2>
            <p>This is Rove&rsquo;s Home screen, drawn with the library. Pick a group to open its docs.</p>
          </div>
          <div className="intro-showcase-grid">
            <div className="intro-rail">
              {groups.slice(0, half).map((group, i) => (
                <Stop key={group.group} {...group} isActive={i === 0} />
              ))}
            </div>
            <AppWindow />
            <div className="intro-rail">
              {groups.slice(half).map((group) => (
                <Stop key={group.group} {...group} isActive={false} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="intro-hood" aria-labelledby="intro-hood">
        <div className="intro-wrap intro-hood-grid">
          <div className="intro-hood-copy">
            <span className="intro-kicker">How agents stay on-system</span>
            <h2 id="intro-hood">
              Context, constraint,
              <br />
              and checks
            </h2>
            <p>
              Agents fail two ways. They don&rsquo;t know a component exists, so they write their own. Or they know, and
              drift anyway: a 5px gap with the tokens in plain view.
            </p>
            <p>
              So <code>AGENTS.md</code> routes each task, <code>DESIGN.md</code> loads with UI work, and a catalogue
              generated from the code lists every prop. The theme holds only tokens, so a raw value has nowhere to go.
              And every edit is linted as it&rsquo;s written, every story runs through axe, and every Figma variant is
              held to its prop.
            </p>
          </div>
          <CheckTerminal />
        </div>
      </section>

      <section className="intro-close" aria-labelledby="intro-close">
        <div className="intro-wrap">
          <h2 id="intro-close">Build it once. Build it on-system.</h2>
          <p>Open a component, or the Figma file it comes from.</p>
          <div className="intro-ctas">
            <a className="intro-cta" href={docsHref('actions-button--docs')} target="_top">
              Explore the components
            </a>
            <Link href={TOKENS_STORYBOOK}>Rove Tokens</Link>
          </div>
        </div>
        <span className="intro-wordmark" aria-hidden>
          Rove
        </span>
      </section>

      <footer className="intro-footer">
        <div className="intro-wrap intro-footer-inner">
          <span className="intro-footer-brand">
            <AnimatedMark size={24} />
            Rove Components
            <span className="intro-version">v{UI_LIBRARY_VERSION}</span>
          </span>
          <span className="intro-footer-links">
            <Link href={figma.file}>Figma file</Link>
            <Link href={TOKENS_STORYBOOK}>Rove Tokens</Link>
          </span>
        </div>
      </footer>
    </div>
  )
}
