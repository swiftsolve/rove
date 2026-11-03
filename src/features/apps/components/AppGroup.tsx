import { cva, cx } from 'class-variance-authority'
import { memo } from 'react'

import { AppIcon } from '@/features/apps/components/AppIcon'
import { ByteTotal } from '@/features/apps/components/ByteTotal'
import { HostRow } from '@/features/apps/components/HostRow'
import { RowName } from '@/features/apps/components/RowName'
import { appGroupLabel } from '@/features/apps/utils/host-labels'
import { totalBytes } from '@/features/apps/utils/transfer'
import type { AppHosts } from '@/types'
import { ChevronDownIcon, Collapsible, CollapsiblePanel, CollapsibleTrigger } from '@/ui'

/** Points down when open, right when closed. */
const chevronVariants = cva('shrink-0 text-tertiary transition-transform duration-(--duration-normal) ease-out', {
  variants: {
    isOpen: { true: 'transform-[rotate(0deg)]', false: 'transform-[rotate(-90deg)]' },
  },
  defaultVariants: { isOpen: false },
})

// Matches the card's curve on the edges it touches, so the nav-flash and focus
// rings aren't shaved square by the card's overflow:hidden. With no fill, the
// radius is otherwise invisible. Scroll margin leaves room above a focused group.
const GROUP = cx('scroll-mt-12 first:rounded-t-lg last:rounded-b-lg')

// Carries the row's inset so the whole row is the click target. Its focus ring
// is drawn on the group instead.
const GROUP_HEADER = cx(
  'flex w-full items-center justify-between gap-12 px-(--card-body-padding) py-12 aria-expanded:pb-8',
  '[font:inherit] text-left text-inherit hover:text-primary focus-visible:text-primary',
  'transition-[color] duration-(--duration-fast) ease-in-out',
)

const HOST_COUNT = cx(
  'min-w-[18px] shrink-0 rounded-full bg-inset px-6 py-px',
  'text-center text-xs text-tertiary tabular-nums',
)

// Indented so each 18px flag centres under the 16px app icon: chevron 14 + gap 8
// + half of (16 − 18) ≈ 21px.
const HOSTS = cx('flex flex-col gap-8', 'pr-(--card-body-padding) pb-12 pl-[calc(var(--card-body-padding)+21px)]')

/** Memoised: each poll keeps an idle app's object, so its group skips the render. */
export const AppGroup = memo(function AppGroup({
  app,
  isExpanded,
  onToggle,
}: {
  app: AppHosts
  isExpanded: boolean
  onToggle: (name: string) => void
}) {
  const total = totalBytes(app)
  const hostCount = app.hosts.length
  return (
    <Collapsible
      as="li"
      hasFocusFrame
      className={GROUP}
      data-app={app.name}
      isOpen={isExpanded}
      onOpenChange={() => onToggle(app.name)}
    >
      {/* The accordion heading pattern. The heading takes the row's font, so it
          adds semantics without restyling the button. */}
      <h2 className="[font:inherit]">
        <CollapsibleTrigger className={GROUP_HEADER} aria-label={appGroupLabel(app.name, hostCount, total)}>
          <RowName
            icon={
              <>
                <ChevronDownIcon size={14} className={chevronVariants({ isOpen: isExpanded })} aria-hidden />
                <AppIcon app={app} />
              </>
            }
            name={app.name}
          >
            <span className={HOST_COUNT}>{hostCount}</span>
          </RowName>
          <ByteTotal bytes={total} />
        </CollapsibleTrigger>
      </h2>
      <CollapsiblePanel>
        <ul role="list" aria-label={`Hosts for ${app.name}`} className={HOSTS}>
          {app.hosts.map((host) => (
            <HostRow key={host.ip} host={host} />
          ))}
        </ul>
      </CollapsiblePanel>
    </Collapsible>
  )
})
