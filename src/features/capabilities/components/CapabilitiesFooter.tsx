import { cx } from 'class-variance-authority'
import type { JSX } from 'react'

import { UpdatedAgo } from '@/app/components/UpdatedAgo'
import { useNavigation } from '@/app/hooks/useNavigation'
import { useSpeedTest } from '@/features/speed/hooks/useSpeedTest'
import { HistoryIcon, Link } from '@/ui'

const FOOTER_STATUS = 'inline-flex min-w-0 items-center gap-4 truncate text-tertiary'

// Bleeds to the card's edges; the card's own clip rounds its bottom corners.
// Hand-built, not CardFooter: this band pads 14px and sits 16px below the
// tiles, where CardFooter pads 12px under the body's 14px. The same before and
// after a test, so the card keeps its height.
const FOOTER = cx(
  'type-caption mt-16 flex items-center justify-between gap-12',
  'w-[calc(100%+2*var(--card-body-padding))]',
  '-mx-(--card-body-padding) -mb-(--card-body-padding)',
  'bg-inset px-(--card-body-padding) py-(--card-header-padding-y)',
)

/**
 * The Capabilities card's footer: the results' status on the left ("Updated
 * 5 min ago", "Testing…", or a hint before the first test) and a link to the
 * Speed page on the right.
 */
export function CapabilitiesFooter({ hasResults }: { hasResults: boolean }): JSX.Element {
  return (
    <div className={FOOTER}>
      <FooterStatus hasResults={hasResults} />
      <OpenSpeedLink />
    </div>
  )
}

function FooterStatus({ hasResults }: { hasResults: boolean }): JSX.Element | null {
  const isTesting = useSpeedTest((test) => test.isTesting)
  const completedAt = useSpeedTest((test) => test.completedAt)

  if (isTesting) return <span className={FOOTER_STATUS}>Testing…</span>
  if (!hasResults) return <span className={FOOTER_STATUS}>Not tested yet</span>
  if (completedAt == null) return null
  return (
    <span className={FOOTER_STATUS}>
      <HistoryIcon size={13} />
      <UpdatedAgo timestamp={completedAt} />
    </span>
  )
}

function OpenSpeedLink() {
  const { navigate } = useNavigation()

  return (
    // The pill's padding hangs over the footer's own, so the footer keeps its height.
    <Link className="-my-2 ml-auto" onClick={() => navigate({ tab: 'speed' })}>
      Speed test
    </Link>
  )
}
