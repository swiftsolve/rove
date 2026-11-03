import { useId } from 'react'

import { ConnectionDetailsPanel } from '@/features/connection/components/ConnectionDetailsPanel'
import { ConnectionStrip } from '@/features/connection/components/ConnectionStrip'
import { useDetailsExpanded } from '@/features/connection/hooks/useDetailsExpanded'
import { usePublicIp } from '@/features/connection/hooks/usePublicIp'
import type { NetworkInfo } from '@/types'
import { isConnectedNetwork } from '@/types'
import { Card, Collapsible, CollapsiblePanel } from '@/ui'

type ConnectionCardProps = {
  info: NetworkInfo
}

/** Home's connection card: a strip naming the network, which expands into its
 *  link, address and hardware details. */
export function ConnectionCard({ info }: ConnectionCardProps) {
  const [isExpanded, toggleExpanded] = useDetailsExpanded()
  // Fetched here rather than in the details, which unmount while closed, so
  // the row is ready when they open.
  const { publicIp, isLoading: isPublicIpLoading } = usePublicIp(isConnectedNetwork(info), info.ipAddress)
  const titleId = useId()

  return (
    // Named by its own heading, as it has no CardHeader.
    <Card aria-labelledby={titleId}>
      {/* The strip's toggle expands the whole card, so focus rings the card
          (strip and, when open, the details) just inside its rounded edge. */}
      <Collapsible isOpen={isExpanded} onOpenChange={toggleExpanded} hasFocusFrame className="rounded-[inherit]">
        <ConnectionStrip info={info} titleId={titleId} isExpanded={isExpanded} />
        <CollapsiblePanel>
          <ConnectionDetailsPanel info={info} publicIp={publicIp} isPublicIpLoading={isPublicIpLoading} />
        </CollapsiblePanel>
      </Collapsible>
    </Card>
  )
}
