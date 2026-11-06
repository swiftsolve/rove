import { useNavigation } from '@/app/hooks/useNavigation'
import { EmptyStatReadout, StatCard, StatReadout } from '@/features/home/components/StatCard'
import { useDataUsage } from '@/features/usage/hooks/useDataUsage'
import { todaysUsage } from '@/types'
import { TodayIcon } from '@/ui'
import { splitBytes } from '@/utils/format'

/** Today's download and upload totals; opens the Usage tab. */
export function UsageCard() {
  const { usage, isLoading, error } = useDataUsage()
  const { navigate } = useNavigation()
  const today = todaysUsage(usage)
  // No day yet: still loading, or the load failed, and neither is zero use. A
  // load that landed with no day for today is: nothing has moved yet.
  const hasTotals = today != null || (!isLoading && error == null)
  const downloaded = splitBytes(today?.rxBytes ?? 0)
  const uploaded = splitBytes(today?.txBytes ?? 0)
  const summary = hasTotals
    ? `${downloaded.value} ${downloaded.unit} down, ${uploaded.value} ${uploaded.unit} up`
    : 'unavailable'

  return (
    <StatCard
      icon={<TodayIcon size={15} />}
      title="Usage"
      linkLabel={`Usage: ${summary}. Open Usage.`}
      onOpen={() => navigate({ tab: 'usage' })}
      isLoading={!hasTotals && isLoading}
    >
      {hasTotals ? (
        <div className="grid w-full grid-cols-2 gap-8" aria-hidden>
          <StatReadout marker="down" value={downloaded.value} unit={downloaded.unit} />
          <StatReadout marker="up" value={uploaded.value} unit={uploaded.unit} />
        </div>
      ) : (
        <EmptyStatReadout />
      )}
    </StatCard>
  )
}
