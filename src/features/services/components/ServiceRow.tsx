import { cx } from 'class-variance-authority'
import type { ReactNode } from 'react'

import { ServiceIcon } from '@/features/services/components/ServiceIcon'
import { Sparkline } from '@/features/services/components/Sparkline'
import { type LatencySample, MAX_SAMPLES } from '@/features/services/utils/service-latency'
import { isHttpErroring, latencyBand } from '@/features/services/utils/service-status'
import { formatLatencyMs } from '@/lib/format'
import type { ServiceDefinition, ServiceReachability } from '@/types'
import { EditIcon, Menu, MenuContent, MenuItem, MenuTrigger, MetricValue, TrashIcon } from '@/ui'

// With a hover-capable pointer the kebab stays collapsed until its row is hovered,
// it has focus or its menu is open. Touch can't hover, so it always shows there.
const KEBAB_REVEAL = cx(
  'transition-[width,opacity,color,background] duration-(--duration-fast) ease-in-out',
  '[@media(hover:hover)]:w-0 [@media(hover:hover)]:overflow-hidden [@media(hover:hover)]:opacity-0',
  'group-hover/row:w-[30px] group-hover/row:opacity-100',
  'focus-visible:w-[30px] focus-visible:opacity-100',
  'data-popup-open:w-[30px] data-popup-open:opacity-100',
)

// One line of a row's body: left-hand text that ellipsises, right-hand value
// that holds its width.
const LINE = 'flex min-w-0 items-center gap-12'

type RowMenuProps = {
  service: ServiceDefinition
  onEdit: () => void
  onRemove: () => void
}

/** The per-row overflow menu: a kebab that opens Edit and Remove. */
export function RowMenu({ service, onEdit, onRemove }: RowMenuProps) {
  return (
    <Menu>
      <MenuTrigger label={`Options for ${service.name}`} className={KEBAB_REVEAL} />
      <MenuContent>
        <MenuItem icon={EditIcon} onClick={onEdit}>
          Edit
        </MenuItem>
        <MenuItem icon={TrashIcon} tone="negative" onClick={onRemove}>
          Remove
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}

/** A glyph standing in for a latency ("…", "—"), read aloud as a word instead. */
function PlaceholderReadout({ glyph, spoken }: { glyph: string; spoken: string }) {
  return (
    <span className="type-body-small text-tertiary">
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
}) {
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

type ServiceRowProps = {
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

export function ServiceRow({ service, probe, seededLatencyMs, samples, isInternetUnreachable, menu }: ServiceRowProps) {
  const latencyMs = probe ? probe.latencyMs : seededLatencyMs
  const isErroring = probe ? isHttpErroring(probe.httpStatus) : false
  // Matches LatencyReadout's "Down": an erroring host, or a failed path while
  // the internet is up. A down row's sparkline is a flat red line.
  const isDown = probe ? isErroring || (probe.latencyMs === null && !isInternetUnreachable) : false

  return (
    // Less right padding than left so the kebab sits closer to the card edge: its
    // 30px hit area already carries visual breathing room around the dots.
    <li className="group/row flex items-center gap-8 py-12 pr-6 pl-16">
      {/* Takes the row's free width so both lines can ellipsise their left-hand text. */}
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
