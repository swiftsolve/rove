import { useMemo, useState, type ReactNode } from 'react'
import { usePresence } from '@/hooks/usePresence'
import type { InternetStatus, ServiceDefinition, ServiceReachability } from '@/types'
import { ViewHeader } from '@/components/ViewHeader'
import { MetricValue } from '@/components/MetricValue'
import { ServiceIcon } from '@/components/icons/ServiceIcon'
import {
  ChevronRightIcon,
  CloudIcon,
  EditIcon,
  EventsIcon,
  HelpIcon,
  MoreVerticalIcon,
  PlusIcon,
  TrashIcon,
} from '@/components/icons/Icons'
import { EmptyState } from '@/components/EmptyState'
import { Tooltip } from '@/components/Tooltip'
import { DotSeparator } from '@/components/DotSeparator'
import { serviceTally } from '@/features/services/components/ServiceTally'
import { MAX_SAMPLES, type LatencySample } from '@/features/services/utils/service-latency'
import { isHttpErroring, latencyBand } from '@/features/services/utils/service-status'
import { Sparkline } from '@/features/services/components/Sparkline'
import { useServices } from '@/features/services/hooks/useServices'
import { useNavigation } from '@/app/hooks/useNavigation'
import { useConnectionStatus } from '@/app/hooks/useConnectionStatus'
import { useServiceReachability } from '@/features/services/hooks/useServiceReachability'
import { useServiceLatency } from '@/features/services/hooks/useServiceLatency'
import { AddServiceDialog } from '@/features/services/components/AddServiceDialog'
import { DIALOG_EXIT_MS } from '@/components/Dialog'
import { formatLatencyMs } from '@/lib/format'
import { Button } from '@/components/Button'
import { cva, cx } from 'class-variance-authority'
import { useMenu } from '@/hooks/useMenu'
import { IconButton } from '@/components/IconButton'

const SERVICES_HINT =
  'Latency is a full HTTPS handshake, so it reads higher than a ping. A server error counts as down.'

// Per-row overflow menu: a kebab button anchoring a dropdown.
//
// On hover-capable pointers the kebab is collapsed to zero width until its row is
// hovered, then grows and fades in, nudging the latency column aside as it slides
// in. It stays shown while its menu is open or it has keyboard focus. Touch keeps
// it always visible.
const KEBAB = cx(
  'inline-flex h-[30px] w-[30px] items-center justify-center rounded-sm text-tertiary',
  'transition-[width,opacity,color,background] duration-(--duration-fast) ease-in-out',
  '[@media(hover:hover)]:w-0 [@media(hover:hover)]:overflow-hidden [@media(hover:hover)]:opacity-0',
  'group-hover/row:w-[30px] group-hover/row:opacity-100',
  'focus-visible:w-[30px] focus-visible:opacity-100',
  'aria-expanded:w-[30px] aria-expanded:opacity-100',
  'hover:bg-hover hover:text-primary aria-expanded:bg-hover aria-expanded:text-primary',
)

const DROPDOWN = cx(
  'animate-menu-in absolute top-[calc(100%+4px)] right-0 z-20 flex min-w-[112px] flex-col gap-2 p-4',
  'rounded-sm border border-line-strong bg-surface shadow-raised',
)

const menuItemVariants = cva(
  [
    'flex w-full items-center gap-8 rounded-xs p-8 text-left text-sm font-medium',
    'transition-[color,background] duration-(--duration-fast) ease-in-out',
    // Items fill the menu edge to edge, so the ring goes inside the item.
    'focus-visible:outline-offset-(--focus-inset)',
  ],
  {
    variants: {
      /** Destructive (Remove): red text and a red-tinted hover. */
      isDanger: {
        true: 'text-negative hover:bg-[color-mix(in_srgb,var(--status-negative)_14%,transparent)] hover:text-negative',
        false: 'text-secondary hover:bg-hover hover:text-primary',
      },
    },
    defaultVariants: { isDanger: false },
  },
)

// One line of a row's body: left-hand text that ellipsises, right-hand value
// that holds its width.
const LINE = 'flex min-w-0 items-center gap-12'

// Timeline link sitting in the header subtitle: the same quiet pill link as
// Speed's "All Results" (see SpeedView's history link), down to the geometry and
// weight; only the glyph differs. The button reset carries the font family
// across but not the size, so font-size: inherit is what keeps it at the
// subtitle's caption size. The negative left margin cancels the pill's padding
// and the glyph's empty edge, so the dot keeps the same 8px to the glyph as to
// the text before it.
// The dot is a plain subtitle child, so a window narrow enough to wrap the link
// can strand it at the start of a line, where it reads as a bullet; only the web
// demo's phone widths get that narrow, and the app's own window never does.
//
// Text links show focus the way they show hover (accent + underline), not with a
// ring. The glyphs share the link's (animating) colour so glyph and label shift
// together; they sit a touch dimmer at rest via opacity, so there's a single
// colour animation rather than two that drift out of sync.
const TIMELINE_LINK = cx(
  'group/link inline-flex cursor-pointer items-center gap-[5px] ml-[-9.5px] rounded-full px-8 py-2',
  '[font-size:inherit] font-medium text-secondary',
  'transition-[color] duration-(--duration-fast) ease-in-out',
  'hover:text-accent focus-visible:text-accent focus-visible:outline-none',
  '[&_svg]:text-inherit [&_svg]:opacity-72',
  '[&_svg]:transition-[opacity] [&_svg]:duration-(--duration-fast) [&_svg]:ease-in-out',
  'hover:[&_svg]:opacity-100 focus-visible:[&_svg]:opacity-100',
)

// Underline only the label on hover (not the glyph), matching the Speed history
// link, so it reads as a link while the whole control picks up the accent.
const TIMELINE_LINK_TEXT = cx(
  'group-hover/link:underline group-hover/link:underline-offset-2',
  'group-focus-visible/link:underline group-focus-visible/link:underline-offset-2',
)

/** What the add/edit dialog shows. `openCount` tells one opening from the next,
 *  so reopening while the last one leaves starts it fresh. */
type DialogState = ({ mode: 'add' } | { mode: 'edit'; service: ServiceDefinition }) & { openCount: number }

function isInternetDown(status: InternetStatus | undefined): boolean {
  return status === 'noInternet' || status === 'offline'
}

interface RowMenuProps {
  service: ServiceDefinition
  isOpen: boolean
  onOpenChange: (host: string | null) => void
  onEdit: () => void
  onRemove: () => void
}

/** The per-row overflow menu: a kebab that opens a dropdown with Edit and Remove.
 *  Keyboard and focus behaviour come from `useMenu`. Only one is open at a time
 *  (the parent owns which host's menu is open). */
function RowMenu({ service, isOpen, onOpenChange, onEdit, onRemove }: RowMenuProps): JSX.Element {
  const { rootRef, triggerProps, menuProps } = useMenu(isOpen, () => onOpenChange(null))

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        className={KEBAB}
        {...triggerProps}
        aria-label={`Options for ${service.name}`}
        onClick={() => onOpenChange(isOpen ? null : service.host)}
      >
        <MoreVerticalIcon size={16} />
      </button>
      {isOpen && (
        <div className={DROPDOWN} {...menuProps}>
          <button type="button" role="menuitem" tabIndex={-1} className={menuItemVariants()} onClick={onEdit}>
            <EditIcon size={14} />
            Edit
          </button>
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            className={menuItemVariants({ isDanger: true })}
            onClick={onRemove}
          >
            <TrashIcon size={14} />
            Remove
          </button>
        </div>
      )}
    </div>
  )
}

/** A glyph standing in for a latency ("…", "—"), read aloud as a word instead. */
function PlaceholderReadout({ glyph, spoken }: { glyph: string; spoken: string }): JSX.Element {
  return (
    <span className="text-body-small">
      <span aria-hidden="true">{glyph}</span>
      <span className="sr-only">{spoken}</span>
    </span>
  )
}

/**
 * A row's latency readout. `latencyMs` is undefined while nothing has been
 * measured yet, and null when the probe's network path failed.
 */
function LatencyReadout({
  latencyMs,
  isErroring,
  isInternetUnreachable,
}: {
  latencyMs: number | null | undefined
  isErroring: boolean
  isInternetUnreachable: boolean
}): JSX.Element {
  if (latencyMs === undefined) return <PlaceholderReadout glyph="…" spoken="Measuring" />
  if (latencyMs === null) {
    // Path failed. Only a genuine "Down" when we know the internet is up;
    // otherwise the failure is ours, so read it as unknown.
    return isInternetUnreachable ? (
      <PlaceholderReadout glyph="—" spoken="Unknown" />
    ) : (
      <span className="text-negative">Down</span>
    )
  }
  if (isErroring) return <span className="text-negative">Down</span>
  return <MetricValue value={latencyMs} status={latencyBand(latencyMs)} format={formatLatencyMs} />
}

interface ServiceRowProps {
  service: ServiceDefinition
  /** This host's entry in the latest probe batch, if it has one yet. */
  probe: ServiceReachability | undefined
  /** The latency the add/edit dialog measured, shown until a probe lands. */
  seededLatencyMs: number | null | undefined
  samples: LatencySample[]
  isInternetUnreachable: boolean
  /** The row's overflow menu, built by the view (which owns the menu state). */
  menu: ReactNode
}

function ServiceRow({
  service,
  probe,
  seededLatencyMs,
  samples,
  isInternetUnreachable,
  menu,
}: ServiceRowProps): JSX.Element {
  const latencyMs = probe ? probe.latencyMs : seededLatencyMs
  const isErroring = probe ? isHttpErroring(probe.httpStatus) : false
  // Down the same way the status reads it: a failed path (only when the
  // internet is up, else it's our fault) or a reachable-but-erroring host. A
  // down row's sparkline is a flat red line, not its old trend.
  const isDown = probe
    ? isErroring || (probe.latencyMs === null && !isInternetUnreachable)
    : false

  return (
    // Less right padding than left so the kebab sits closer to the card edge: its
    // 30px hit area already carries visual breathing room around the dots.
    <li className="group/row flex items-center gap-8 py-12 pr-6 pl-16">
      {/* Two stacked lines: favicon + name + trend on top, URL + status below.
          Takes the row's free width so both lines can ellipsis their left-hand text. */}
      <div className="flex min-w-0 flex-auto flex-col gap-2">
        <div className={LINE}>
          <ServiceIcon host={service.host} name={service.name} />
          <span className="min-w-0 flex-auto truncate text-primary">{service.name}</span>
          {(samples.length > 0 || isDown) && (
            <Sparkline
              samples={samples}
              slots={MAX_SAMPLES}
              isDown={isDown}
              width={64}
              height={20}
              label={service.name}
            />
          )}
        </div>
        {/* Indent the URL line so it starts under the name, clearing the favicon
            (16px) and its gap that lead the line above. */}
        <div className={cx(LINE, 'min-h-[1.25em] pl-[calc(16px+var(--spacing-12))]')}>
          <span className="min-w-0 flex-auto truncate text-sm text-tertiary">{service.host}</span>
          {/* A steady min-width so the URL's ellipsis to its left doesn't shift as
              the animated latency number changes width poll to poll. */}
          <span className="num min-w-[4.5em] shrink-0 text-right font-numeric text-sm text-secondary">
            <LatencyReadout
              latencyMs={latencyMs}
              isErroring={isErroring}
              isInternetUnreachable={isInternetUnreachable}
            />
          </span>
        </div>
      </div>
      {menu}
    </li>
  )
}

/** There's nothing to probe against while offline, so adding is disabled until we're back. */
function AddServiceButton({ isOffline, onClick }: { isOffline: boolean; onClick: () => void }): JSX.Element {
  if (isOffline) {
    return (
      <Tooltip content="Connect to the internet first">
        <Button variant="filled" isDisabled>
          <PlusIcon size={14} />
          Add service
        </Button>
      </Tooltip>
    )
  }
  return (
    <Button variant="filled" onClick={onClick} aria-haspopup="dialog">
      <PlusIcon size={14} />
      Add service
    </Button>
  )
}

/**
 * The Services page: the tracked-service list, where a service is added (by
 * URL/IP) or edited/removed from a per-row menu, with a link to the outage
 * timeline in the subtitle. The list is owned by the backend store (see
 * `useServices`); latency is overlaid from the latest services probes so each
 * row shows how it's doing.
 */
export function ServicesView(): JSX.Element {
  const { navigate } = useNavigation()
  const { report, run: reprobe } = useServiceReachability()
  // The latest reachability probes; latency is matched to rows by host.
  const reachability = report?.services
  // The internet reachability measured alongside `reachability` (same probe
  // batch). When it isn't `online`, a probe in that batch that failed means "we
  // couldn't check", not "the service is down", so those rows read as unknown
  // ("—") rather than "Down".
  const internet = report?.internet
  // The app's live internet status — the same one the title bar shows. Drives
  // the header ("No internet") and gates the Add button, so the page never
  // disagrees with the title bar between probe batches.
  const liveInternet = useConnectionStatus().internet
  // Re-probe the services so a just-added/removed service's latency refreshes.
  const refreshServices = (): void => {
    void reprobe()
  }
  const openTimeline = (): void => navigate({ tab: 'services', servicesSub: { view: 'timeline' } })
  const { services, add, remove } = useServices()
  // Rolling per-host latency history for each row's trend sparkline, appended
  // on each services poll (see `useServiceReachability`).
  const latencyHistory = useServiceLatency()

  // With the internet unreachable when this batch ran, a failed probe is our
  // fault, not the service's — so read those rows as unknown.
  const isInternetUnreachable = isInternetDown(internet)
  const isOfflineNow = isInternetDown(liveInternet)
  // The same live up/down count the timeline header shows, ahead of the timeline
  // link. Null until the first probes land, so the link stands alone until then.
  const tally = serviceTally(reachability, liveInternet)
  // The dialog's content outlives its closing, so it can play its leave animation.
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const isDialogMounted = usePresence(isDialogOpen, DIALOG_EXIT_MS)
  const openDialog = (next: { mode: 'add' } | { mode: 'edit'; service: ServiceDefinition }): void => {
    setDialog({ ...next, openCount: (dialog?.openCount ?? 0) + 1 })
    setIsDialogOpen(true)
  }
  const [openMenuHost, setOpenMenuHost] = useState<string | null>(null)
  // Latency captured by the dialog's test, keyed by host, so a freshly added or
  // edited row shows its measured value at once until the next services poll.
  const [seededLatency, setSeededLatency] = useState<Map<string, number | null>>(new Map())

  const probeByHost = useMemo(() => {
    const map = new Map<string, ServiceReachability>()
    for (const probe of reachability ?? []) map.set(probe.host, probe)
    return map
  }, [reachability])

  // Until the stored list loads, show the probed services so the page isn't blank.
  const listedServices: ServiceDefinition[] =
    services ?? (reachability ?? []).map(({ name, host }) => ({ name, host }))

  // Persist a confirmed add or edit. Re-adding the same host updates its label;
  // an edit that changed the host is a move, so drop the old host first.
  const saveService = (name: string, host: string, latencyMs: number | null | undefined): Promise<void> => {
    // A rename measured nothing, so the row keeps its live readout.
    if (latencyMs !== undefined) setSeededLatency((prev) => new Map(prev).set(host, latencyMs))
    const oldHost = dialog?.mode === 'edit' ? dialog.service.host : null
    const persist =
      oldHost && oldHost !== host ? remove(oldHost).then(() => add(name, host)) : add(name, host)
    return persist.then(refreshServices)
  }

  const removeService = (host: string): void => {
    void remove(host).then(refreshServices)
  }

  return (
    <div className="page">
      <ViewHeader
        icon={<CloudIcon size={18} />}
        title="Services"
        // The up/down tally, then the timeline link. Wraps the link onto its own
        // line when the two can't share one, so a narrow window breaks between
        // them rather than inside either.
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-6 gap-y-4">
            {tally && (
              <>
                {tally}
                <DotSeparator />
              </>
            )}
            <button type="button" className={TIMELINE_LINK} onClick={openTimeline}>
              <EventsIcon size={13} />
              <span className={TIMELINE_LINK_TEXT}>View timeline</span>
              <ChevronRightIcon size={13} className="link-caret" />
            </button>
          </span>
        }
        isSubtitleShown
        // Beside a full button the help chip takes the 10px step, as on Speed.
        actions={
          <div className="flex items-center gap-10">
            <Tooltip content={SERVICES_HINT}>
              <IconButton
                aria-label="About service checks"
              >
                <HelpIcon size={16} />
              </IconButton>
            </Tooltip>
            <AddServiceButton isOffline={isOfflineNow} onClick={() => openDialog({ mode: 'add' })} />
          </div>
        }
      />

      {isDialogMounted && dialog && (
        <AddServiceDialog
          key={dialog.openCount}
          isOpen={isDialogOpen}
          editing={
            dialog.mode === 'edit'
              ? { name: dialog.service.name, host: dialog.service.host }
              : undefined
          }
          onAdd={saveService}
          onClose={() => setIsDialogOpen(false)}
        />
      )}

      {listedServices.length > 0 ? (
        // Rows are separated by the same hairline the data cards use, running edge
        // to edge: the rows, not the list, carry the horizontal padding.
        <ul role="list" className="surface [&>li+li]:border-t [&>li+li]:border-t-line" aria-label="Tracked services">
          {listedServices.map((svc) => (
            <ServiceRow
              key={svc.host}
              service={svc}
              probe={probeByHost.get(svc.host)}
              seededLatencyMs={seededLatency.get(svc.host)}
              samples={latencyHistory[svc.host] ?? []}
              isInternetUnreachable={isInternetUnreachable}
              menu={
                <RowMenu
                  service={svc}
                  isOpen={openMenuHost === svc.host}
                  onOpenChange={setOpenMenuHost}
                  onEdit={() => {
                    setOpenMenuHost(null)
                    openDialog({ mode: 'edit', service: svc })
                  }}
                  onRemove={() => {
                    setOpenMenuHost(null)
                    removeService(svc.host)
                  }}
                />
              }
            />
          ))}
        </ul>
      ) : (
        <EmptyState
          title="No services yet"
          hint="Add a site or server to watch its uptime."
        />
      )}
    </div>
  )
}
