import { BytesMetric } from '@/features/usage/components/BytesMetric'
import { TotalsFooter } from '@/features/usage/components/TotalsFooter'
import { WeekChart } from '@/features/usage/components/WeekChart'
import { useDataUsage } from '@/features/usage/hooks/useDataUsage'
import { POLLING_DESCRIPTION } from '@/lib/copy'
import { todaysUsage } from '@/types'
import {
  Banner,
  Card,
  CardBody,
  CardHeader,
  HelpIcon,
  IconButton,
  LoadingState,
  PageHeader,
  TodayIcon,
  UsageIcon,
  WeekIcon,
} from '@/ui'

const USAGE_INFO_HINT = 'Measured while Rove runs, across all physical interfaces.'

export function UsageView() {
  const { usage, isLoading, error, reload } = useDataUsage()
  const today = todaysUsage(usage)
  const weekRx = usage.days.reduce((sum, day) => sum + day.rxBytes, 0)
  const weekTx = usage.days.reduce((sum, day) => sum + day.txBytes, 0)
  const isFirstLoad = isLoading && usage.days.length === 0

  return (
    <div className="page">
      <PageHeader
        icon={<UsageIcon size={18} />}
        title="Usage"
        description="Download and upload across all interfaces"
        status={isFirstLoad ? 'Loading…' : undefined}
        actions={<IconButton label="About usage measurement" icon={HelpIcon} tooltip={USAGE_INFO_HINT} />}
      />

      {error && <Banner variant="error" title={error} description={POLLING_DESCRIPTION} onRetry={reload} />}

      {isFirstLoad ? (
        <LoadingState label="Loading usage…" />
      ) : (
        <>
          <Card>
            <CardHeader title="Today" icon={<TodayIcon size={15} />} />
            <CardBody>
              <dl className="grid grid-cols-2 gap-16">
                <BytesMetric label="Downloaded" bytes={today?.rxBytes ?? 0} series="down" />
                <BytesMetric label="Uploaded" bytes={today?.txBytes ?? 0} series="up" />
              </dl>
              <TotalsFooter label="Since boot" rxBytes={usage.bootRxBytes} txBytes={usage.bootTxBytes} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Last 7 days" icon={<WeekIcon size={15} />} />
            <CardBody>
              <WeekChart days={usage.days} />
              <TotalsFooter label="Week total" rxBytes={weekRx} txBytes={weekTx} />
            </CardBody>
          </Card>
        </>
      )}
    </div>
  )
}
