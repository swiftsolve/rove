import { useState, type ReactNode } from 'react'
import { Button, type ButtonAppearance } from '../primitives/button/Button'
import { IconButton } from '../primitives/button/IconButton'
import { ButtonSpinner } from '../primitives/spinner/ButtonSpinner'
import { Spinner } from '../primitives/spinner/Spinner'
import { Toggle } from '../primitives/toggle/Toggle'
import { TextField, TextFieldAction } from '../primitives/text-field/TextField'
import { SegmentedControl } from '../primitives/segmented-control/SegmentedControl'
import { Dialog, DialogRoot } from '../primitives/dialog/Dialog'
import { PortalProvider } from '../context/PortalProvider'
import { DotSeparator, InlineMeta } from '../primitives/separator/DotSeparator'
import { Card, CardBody, CardFooter, CardHeader } from '../components/card/Card'
import { Badge } from '../primitives/badge/Badge'
import { DataList, DataRow } from '../components/data-list/DataList'
import { EmptyState } from '../components/empty-state/EmptyState'
import { ErrorBanner } from '../components/error-banner/ErrorBanner'
import { MetricValue } from '../components/metric-value/MetricValue'
import { PageHeader } from '../components/page-header/PageHeader'
import { Link } from '../primitives/link/Link'
import { ViewLink } from '../primitives/link/ViewLink'
import {
  GlobeIcon,
  HelpIcon,
  MoonIcon,
  MoreVerticalIcon,
  PlayIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  SunIcon,
  WifiIcon,
} from '../icons/Icons'

const BUTTON_ROWS: [string, ButtonAppearance][] = [
  ['solid', { variant: 'solid' }],
  ['solid neg.', { variant: 'solid', tone: 'negative' }],
  ['soft', { variant: 'soft' }],
  ['soft md', { variant: 'soft', size: 'md' }],
  ['ghost', { variant: 'ghost' }],
]
/**
 * Every library component in every state, on one page: open the dev server at
 * `/?gallery` (`&theme=light` for Light). It's what the stable screenshots diff
 * for the states no screen shows, and a place to see a component while
 * changing it. Dev only; the production build never loads it.
 */
export function Gallery(): JSX.Element {
  return (
    <main className="flex flex-col gap-20 bg-base p-20 text-primary">
      <Section title="Button">
        {BUTTON_ROWS.map(([name, appearance]) => (
          <Row key={name} label={name}>
            <Button {...appearance}>Label</Button>
            <Button {...appearance} icon={PlayIcon}>
              With icon
            </Button>
            <Button {...appearance} icon={PlayIcon} isLoading>
              Loading
            </Button>
            <Button {...appearance} isLoading>
              No icon
            </Button>
            <Button {...appearance} icon={PlayIcon} isDisabled>
              Disabled
            </Button>
          </Row>
        ))}
      </Section>

      <Section title="Link">
        <Row label="view link">
          <span className="inline-flex items-center gap-12 text-caption">
            <ViewLink icon={GlobeIcon}>All hosts</ViewLink>
            <ViewLink icon={GlobeIcon} isDisabled>
              Disabled
            </ViewLink>
          </span>
          <span className="text-xs">
            <ViewLink icon={PlayIcon}>Small text</ViewLink>
          </span>
        </Row>
        <Row label="anchor">
          <span className="text-sm text-secondary">
            Source on{' '}
            <Link href="https://github.com/swiftsolve/rove" isExternal>
              github.com/swiftsolve/rove
            </Link>
          </span>
        </Row>
      </Section>

      <Section title="IconButton">
        {(['soft', 'ghost'] as const).map((variant) => (
          <Row key={variant} label={variant}>
            <IconButton variant={variant} label="Refresh" icon={RefreshIcon} />
            <IconButton variant={variant} label="Run" icon={PlayIcon} iconSize={14} />
            <IconButton variant={variant} label="Refresh" icon={RefreshIcon} isLoading />
            <IconButton variant={variant} label="Refresh" icon={RefreshIcon} isDisabled />
            <IconButton variant={variant} label="Options" icon={MoreVerticalIcon} />
          </Row>
        ))}
      </Section>

      <Section title="Toggle">
        <Row label="states">
          <ToggleDemo isInitiallyChecked />
          <ToggleDemo isInitiallyChecked={false} />
          <Toggle isChecked label="Disabled on" isDisabled onChange={() => {}} />
          <Toggle isChecked={false} label="Disabled off" isDisabled onChange={() => {}} />
        </Row>
      </Section>

      <Section title="SegmentedControl">
        <Row label="theme">
          <SegmentedDemo />
        </Row>
      </Section>

      <Section title="TextField">
        <div className="grid grid-cols-2 gap-12">
          <TextFieldDemo />
          <TextField label="Invalid" value="not an address" onChange={() => {}} isInvalid feedback="Not an address." />
        </div>
      </Section>

      <Section title="Spinner">
        <Row label="sizes">
          <Spinner />
          <Spinner size={16} />
          <span className="text-secondary">
            <ButtonSpinner />
          </span>
          <ButtonSpinner size={16} color="var(--accent-default)" />
        </Row>
      </Section>

      <Section title="Separator">
        <Row label="inline">
          <span className="text-sm text-secondary">
            Wi‑Fi <DotSeparator /> 5 GHz
          </span>
          <span className="text-sm text-secondary">
            <InlineMeta items={['192.168.1.20', 'Apple', null, '2 min ago']} />
          </span>
          <span className="w-[160px] text-sm text-secondary">
            <InlineMeta shouldTruncate items={['a-very-long-hostname.local', 'Raspberry Pi Foundation', 'now']} />
          </span>
        </Row>
      </Section>

      <Section title="Card">
        <div className="grid grid-cols-2 gap-12">
          <Card>
            <CardHeader
              title="With everything"
              icon={<WifiIcon size={16} />}
              actions={<Badge tone="warning">VPN</Badge>}
            />
            <CardBody>
              <DataList>
                <DataRow label="Address" value="192.168.1.20" />
                <DataRow label="Gateway" value="192.168.1.1" />
              </DataList>
            </CardBody>
            <CardFooter>
              <span className="text-xs text-tertiary">A footnote in the footer band.</span>
            </CardFooter>
          </Card>
          <Card>
            <CardHeader title="Header actions" actions={<IconButton label="Refresh" icon={RefreshIcon} />} />
            <CardBody>
              <p className="text-sm text-secondary">A body with plain text.</p>
            </CardBody>
          </Card>
          <Card as="div" className="p-12">
            <p className="text-sm text-secondary">A bare surface that lays out its own content.</p>
          </Card>
        </div>
      </Section>

      <Section title="DataList">
        <div className="grid grid-cols-3 gap-12">
          {(['default', 'snug', 'compact'] as const).map((density) => (
            <Card key={density}>
              <CardHeader title={density} />
              <CardBody>
                <DataList density={density}>
                  <DataRow label="Download" value="512 Mbps" />
                  <DataRow label="Upload" value="48 Mbps" />
                  <DataRow label="Signal" align="center">
                    <span className="inline-block size-12 rounded-full bg-status-positive" />
                  </DataRow>
                  <DataRow label="Hidden" value={null} />
                </DataList>
              </CardBody>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="MetricValue">
        <Row label="status">
          <MetricValue value={42} format={(n) => `${Math.round(n)} ms`} />
          <MetricValue value={42} status="positive" format={(n) => `${Math.round(n)} ms`} />
          <MetricValue value={180} status="warning" format={(n) => `${Math.round(n)} ms`} />
          <MetricValue value={900} status="negative" format={(n) => `${Math.round(n)} ms`} />
        </Row>
      </Section>

      <Section title="PageHeader">
        <div className="flex flex-col gap-12">
          <PageHeader
            title="Services"
            icon={<GlobeIcon size={18} />}
            description="12 services, all up"
            actions={
              <>
                <IconButton label="Help" icon={HelpIcon} />
                <Button variant="solid" icon={PlusIcon}>
                  Add service
                </Button>
              </>
            }
          />
          <PageHeader title="Checking" icon={<SearchIcon size={18} />} status="Checking…" />
          <PageHeader title="Results" onBack={() => {}} description="A subpage over a tab" />
        </div>
      </Section>

      <Section title="ErrorBanner">
        <ErrorBanner title="Couldn't load devices" description="Rove keeps trying in the background." />
        <ErrorBanner
          title="Speed test failed"
          description="The server didn't answer."
          onRetry={() => Promise.resolve()}
        />
      </Section>

      <Section title="EmptyState">
        <div className="grid grid-cols-2 gap-12">
          <div className="flex h-[280px]">
            <EmptyState
              title="No services yet"
              description="Add one to see whether it's up."
              actions={
                <Button variant="solid" icon={PlusIcon}>
                  Add service
                </Button>
              }
            />
          </div>
          <div className="flex h-[280px]">
            <EmptyState isLocked title="Needs administrator access" description="Restart Rove as admin to see this." />
          </div>
        </div>
      </Section>

      <Section title="Dialog">
        <DialogDemo />
      </Section>
    </main>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="flex flex-col gap-12">
      <h2 className="text-overline">{title}</h2>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div className="flex items-center gap-12">
      <span className="w-[72px] shrink-0 text-xs text-tertiary">{label}</span>
      <div className="flex flex-wrap items-center gap-12">{children}</div>
    </div>
  )
}

/** A dialog open in a box of its own, the way the app opens one over its content column. */
function DialogDemo(): JSX.Element {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  return (
    <div ref={setContainer} className="relative h-[300px] overflow-hidden rounded-lg">
      <PortalProvider container={container}>
        {container && (
          <DialogRoot isOpen>
            <Dialog
              title="Add a service"
              description="Track a service by URL or IP address."
              cancelLabel="Cancel"
              onClose={() => {}}
              actions={<Button variant="solid">Add</Button>}
            >
              <p className="text-sm text-secondary">The body sits in a recessed well.</p>
            </Dialog>
          </DialogRoot>
        )}
      </PortalProvider>
    </div>
  )
}

function TextFieldDemo(): JSX.Element {
  const [address, setAddress] = useState('')
  return (
    <TextField
      label="Address"
      value={address}
      onChange={setAddress}
      placeholder="example.com or 192.168.1.1"
      feedback="Tested when you add it."
      action={
        <TextFieldAction onClick={() => {}} isDisabled={!address}>
          Test
        </TextFieldAction>
      }
    />
  )
}

function SegmentedDemo(): JSX.Element {
  const [mode, setMode] = useState<'dark' | 'light' | 'system'>('dark')
  return (
    <SegmentedControl
      options={[
        { value: 'dark', label: 'Dark', icon: <MoonIcon size={15} /> },
        { value: 'light', label: 'Light', icon: <SunIcon size={15} /> },
        { value: 'system', label: 'System' },
      ]}
      value={mode}
      onChange={setMode}
      aria-label="Theme"
    />
  )
}

function ToggleDemo({ isInitiallyChecked }: { isInitiallyChecked: boolean }): JSX.Element {
  const [isChecked, setIsChecked] = useState(isInitiallyChecked)
  return <Toggle isChecked={isChecked} label="Demo" onChange={setIsChecked} />
}
