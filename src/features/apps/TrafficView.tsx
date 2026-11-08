import { useRef } from 'react'

import { useNavigation } from '@/app/hooks/useNavigation'
import { TrafficIcon } from '@/features/apps/components/TrafficIcon'
import { UsageBody, type UsageBodyCopy } from '@/features/apps/components/UsageBody'
import { UsageRow } from '@/features/apps/components/UsageRow'
import { useRowGlide } from '@/features/apps/hooks/useRowGlide'
import { useTrafficUsage } from '@/features/apps/hooks/useTrafficUsage'
import { busiestTotal } from '@/features/apps/utils/transfer'
import { Banner, CardList, PageHeader } from '@/ui'
import { POLLING_DESCRIPTION } from '@/utils/copy'

const TRAFFIC_INFO_HINT =
  'Traffic by remote port, so :443 is HTTPS and :53 is DNS. TCP and connected UDP only; resets when Rove restarts.'

const BODY_COPY: UsageBodyCopy = {
  unsupported: 'Run Rove as administrator to break traffic down by protocol on Windows.',
  loading: 'Measuring traffic types…',
  emptyTitle: 'No traffic yet',
  empty: 'Traffic appears here as your apps use the network.',
}

export function TrafficView() {
  const { usage, isFirstLoad, error, reload } = useTrafficUsage()
  const { back } = useNavigation()
  const { types } = usage
  const busiest = busiestTotal(types)
  const listRef = useRef<HTMLUListElement>(null)
  useRowGlide(listRef, types.map((type) => type.id).join('\n'))

  return (
    <div className="page">
      <PageHeader
        title="Traffic types"
        description="Traffic by kind across every app, busiest first"
        status={isFirstLoad ? 'Loading…' : undefined}
        onBack={back}
        info={{ label: 'About traffic types', hint: TRAFFIC_INFO_HINT }}
      />
      {error && <Banner variant="error" title={error} description={POLLING_DESCRIPTION} onRetry={reload} />}

      <UsageBody support={usage.support} isFirstLoad={isFirstLoad} isEmpty={types.length === 0} copy={BODY_COPY}>
        <CardList label="Traffic types by usage" ref={listRef}>
          {types.map((type) => (
            <UsageRow
              key={type.id}
              icon={<TrafficIcon type={type} />}
              iconKind="line"
              name={type.label}
              transfer={type}
              busiest={busiest}
            />
          ))}
        </CardList>
      </UsageBody>
    </div>
  )
}
