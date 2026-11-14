import { Card, CardBody, CardHeader, ScreenReaderStatus, useRovingFocus, ZapIcon } from '@swiftsolve/rove-ui'
import { cx } from 'class-variance-authority'
import { useRef } from 'react'

import { CapabilitiesFooter } from '@/features/capabilities/components/CapabilitiesFooter'
import { RatedCapability, UnratedCapability } from '@/features/capabilities/components/CapabilityTiles'
import { RunTestButton } from '@/features/capabilities/components/RunTestButton'
import { useSpeedTest } from '@/features/speed/hooks/useSpeedTest'
import { testStatusText } from '@/features/speed/utils/test-status'
import { CAPABILITY_DEFINITIONS } from '@/types'

/** Bleeds past the body padding to span the card, like the throughput chart. */
const CAPABILITY_ROW = cx('flex items-center justify-between', '-mx-(--card-body-padding) px-(--card-body-padding)')

/**
 * Home's summary of what the connection can handle: a tile per capability,
 * coloured by the last speed test's rating, each opening its details.
 */
export function CapabilitiesCard() {
  const capabilities = useSpeedTest((test) => test.capabilities)
  const hasResults = capabilities.length > 0
  // A test replaces the ratings, so while one runs the tiles go back to placeholders.
  const isTesting = useSpeedTest((test) => test.isTesting)
  const isShowingRatings = hasResults && !isTesting
  // The rated tiles are one Tab stop: the arrow keys move between them.
  const rowRef = useRef<HTMLUListElement>(null)
  useRovingFocus(rowRef, { itemSelector: 'button', orientation: 'horizontal' })

  return (
    <Card>
      <CardHeader title="Capabilities" icon={<ZapIcon size={15} />} actions={<RunTestButton />} />
      <CardBody>
        {/* Before the first test and during one the tiles are faded placeholders
            with no rating to read, so Tab and screen readers skip them; the
            test's progress is read out below. */}
        <ul ref={rowRef} role="list" className={CAPABILITY_ROW} aria-hidden={!isShowingRatings || undefined}>
          {isShowingRatings
            ? capabilities.map((capability) => <RatedCapability key={capability.id} capability={capability} />)
            : CAPABILITY_DEFINITIONS.map((capability) => (
                <UnratedCapability key={capability.id} capability={capability} />
              ))}
        </ul>
        <CapabilitiesFooter hasResults={hasResults} />
        <ScreenReaderTestStatus />
      </CardBody>
    </Card>
  )
}

/** Screen-reader only: reads out a test run from here, as the Speed page does. Home shows no failure, so the error is read out too. */
function ScreenReaderTestStatus() {
  const isTesting = useSpeedTest((test) => test.isTesting)
  const progress = useSpeedTest((test) => test.progress)
  const internetSpeed = useSpeedTest((test) => test.internetSpeed)
  const error = useSpeedTest((test) => test.error)

  return <ScreenReaderStatus>{error ?? testStatusText(isTesting, progress, internetSpeed)}</ScreenReaderStatus>
}
