import { splitBytes } from '@/lib/format'
import { useDataUsage } from '@/features/usage/hooks/useDataUsage'
import { useNavigation } from '@/app/hooks/useNavigation'
import { TodayIcon } from '@/ui'
import { EmptyStatReadout, StatCard, StatReadout } from '@/features/home/components/StatCard'

/** Today's download and upload totals; opens the Usage tab. */
export function UsageCard(): JSX.Element {
  const { usage, isLoading } = useDataUsage()
  const { navigate } = useNavigation()
  const today = usage.days.at(-1)
  // Once loading is done, no entry for today means nothing used yet: zeros.
  const hasTotals = today != null || !isLoading
  const down = splitBytes(today?.rxBytes ?? 0)
  const up = splitBytes(today?.txBytes ?? 0)
  const summary = hasTotals ? `${down.value} ${down.unit} down, ${up.value} ${up.unit} up` : 'unavailable'

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
          <StatReadout marker="down" value={down.value} unit={down.unit} />
          <StatReadout marker="up" value={up.value} unit={up.unit} />
        </div>
      ) : (
        <EmptyStatReadout />
      )}
    </StatCard>
  )
}
