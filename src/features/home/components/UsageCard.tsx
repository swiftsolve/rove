import { useNavigation } from '@/app/hooks/useNavigation'
import { EmptyStatReadout, StatCard, StatReadout } from '@/features/home/components/StatCard'
import { useDataUsage } from '@/features/usage/hooks/useDataUsage'
import { splitBytes } from '@/lib/format'
import { todayOf } from '@/types'
import { TodayIcon } from '@/ui'

/** Today's download and upload totals; opens the Usage tab. */
export function UsageCard() {
  const { usage, isLoading } = useDataUsage()
  const { navigate } = useNavigation()
  const today = todayOf(usage)
  // No day yet means the first load hasn't landed (or failed): zeros once it ends.
  const hasTotals = today != null || !isLoading
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
      isLoading={!hasTotals}
    >
      {hasTotals ? (
        <div className="grid grid-cols-2 gap-8 w-full" aria-hidden>
          <StatReadout marker="down" value={downloaded.value} unit={downloaded.unit} />
          <StatReadout marker="up" value={uploaded.value} unit={uploaded.unit} />
        </div>
      ) : (
        <EmptyStatReadout />
      )}
    </StatCard>
  )
}
