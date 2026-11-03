import { useEffect, useRef } from 'react'

import { UpdatedAgo } from '@/app/components/UpdatedAgo'
import { useNavigation } from '@/app/hooks/useNavigation'
import { CapabilityDetailCard } from '@/features/capabilities/components/CapabilityDetailCard'
import { useSpeedTest } from '@/features/speed/hooks/useSpeedTest'
import { scrollToTopAndFlash } from '@/lib/highlight'
import type { CapabilityId } from '@/types'
import { PageHeader } from '@/ui'

type CapabilityDetailsViewProps = {
  /** Capability to scroll into view when the page opens (the one just clicked). */
  targetId?: CapabilityId | null
}

export function CapabilityDetailsView({ targetId }: CapabilityDetailsViewProps) {
  const { back } = useNavigation()
  const capabilities = useSpeedTest((test) => test.capabilities)
  const speed = useSpeedTest((test) => test.internetSpeed)
  const completedAt = useSpeedTest((test) => test.completedAt)
  const listRef = useRef<HTMLUListElement>(null)

  // Two frames late: opening the subpage resets the scroll container to the top
  // in an effect, and this scroll must start after that reset.
  useEffect(() => {
    if (targetId == null) return
    let innerFrame = 0
    const outerFrame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => {
        const card = listRef.current?.querySelector<HTMLElement>(`[data-capability-id="${targetId}"]`)
        if (card) scrollToTopAndFlash(card, 'smooth')
      })
    })
    return () => {
      cancelAnimationFrame(outerFrame)
      cancelAnimationFrame(innerFrame)
    }
  }, [targetId])

  return (
    <div className="page">
      <PageHeader
        title="Capabilities"
        description={completedAt != null ? <UpdatedAgo timestamp={completedAt} /> : undefined}
        onBack={back}
      />
      <ul role="list" className="flex flex-col gap-10" ref={listRef}>
        {/* The Speed view only opens this page once a result is in. */}
        {speed != null &&
          capabilities.map((capability) => (
            <CapabilityDetailCard key={capability.id} capability={capability} speed={speed} />
          ))}
      </ul>
    </div>
  )
}
