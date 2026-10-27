import { splitBytes } from '@/lib/format'
import { useDataUsage } from '@/features/usage/hooks/useDataUsage'
import { useNavigation } from '@/app/hooks/useNavigation'
import { TodayIcon } from '@/components/icons/Icons'
import { EmptyStatMetric, StatCard, StatReadout } from '@/features/home/components/StatCard'
import styles from './UsageCard.module.css'

/** Today's download and upload totals; opens the Usage tab. */
export function UsageCard(): JSX.Element {
  const { usage, isLoading } = useDataUsage()
  const { navigate } = useNavigation()
  const today = usage.days[usage.days.length - 1]
  const isResolved = today != null || !isLoading
  const down = splitBytes(today?.rxBytes ?? 0)
  const up = splitBytes(today?.txBytes ?? 0)
  const summary = isResolved ? `${down.value} ${down.unit} down, ${up.value} ${up.unit} up` : 'unavailable'

  return (
    <StatCard
      icon={<TodayIcon size={15} />}
      label="Usage"
      ariaLabel={`Usage: ${summary}. Open Usage.`}
      onOpen={() => navigate({ tab: 'usage' })}
      isBusy={!isResolved}
    >
      {isResolved ? (
        <div className={styles.split} aria-hidden>
          <StatReadout marker="down" value={down.value} unit={down.unit} />
          <StatReadout marker="up" value={up.value} unit={up.unit} />
        </div>
      ) : (
        <EmptyStatMetric />
      )}
    </StatCard>
  )
}
