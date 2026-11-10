import { useId } from 'react'

import { ConnectionDetailsPanel } from '@/features/current-network/components/ConnectionDetailsPanel'
import { ConnectionStrip } from '@/features/current-network/components/ConnectionStrip'
import { useDetailsExpanded } from '@/features/current-network/hooks/useDetailsExpanded'
import type { NetworkInfo } from '@/types'
import { isConnectedNetwork } from '@/types'
import { Card, Collapsible, CollapsiblePanel } from '@/ui'

type ConnectionCardProps = {
  info: NetworkInfo
}

/** Home's connection card: a strip naming the network, which expands into its link details. */
export function ConnectionCard({ info }: ConnectionCardProps) {
  const [isExpanded, toggleExpanded] = useDetailsExpanded()
  const titleId = useId()

  // Offline, there's no link to detail, so the strip stands alone.
  if (!isConnectedNetwork(info)) {
    return (
      <Card aria-labelledby={titleId}>
        <ConnectionStrip info={info} titleId={titleId} />
      </Card>
    )
  }

  return (
    // Named by its own heading, as it has no CardHeader.
    <Card aria-labelledby={titleId}>
      {/* The strip's toggle expands the whole card, so focus rings the card
          (strip and, when open, the details) just inside its rounded edge. */}
      <Collapsible isOpen={isExpanded} onOpenChange={toggleExpanded} hasFocusFrame className="rounded-[inherit]">
        <ConnectionStrip info={info} titleId={titleId} isExpanded={isExpanded} />
        <CollapsiblePanel>
          <ConnectionDetailsPanel info={info} />
        </CollapsiblePanel>
      </Collapsible>
    </Card>
  )
}
