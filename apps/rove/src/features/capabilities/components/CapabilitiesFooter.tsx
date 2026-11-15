import { CardFooter, HistoryIcon, Link } from '@swiftsolve/rove-ui'
import type { JSX } from 'react'

import { UpdatedAgo } from '@/app/components/UpdatedAgo'
import { useNavigation } from '@/app/hooks/useNavigation'
import { useSpeedTest } from '@/features/speed/hooks/useSpeedTest'

const FOOTER_STATUS = 'inline-flex min-w-0 items-center gap-(--gap-icon-label) truncate text-tertiary'

/** The same before and after a test, so the card keeps its height. */
const FOOTER = 'type-caption flex items-center justify-between gap-12'

/**
 * The Capabilities card's footer: the results' status on the left ("Updated
 * 5 min ago", "Testing…", or a hint before the first test) and a link to the
 * Speed page on the right.
 */
export function CapabilitiesFooter({ hasResults }: { hasResults: boolean }): JSX.Element {
  return (
    <CardFooter>
      <div className={FOOTER}>
        <FooterStatus hasResults={hasResults} />
        <OpenSpeedLink />
      </div>
    </CardFooter>
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
