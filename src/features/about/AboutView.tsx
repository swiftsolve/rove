import { cx } from 'class-variance-authority'

import { useAppVersion } from '@/features/about/hooks/useAppVersion'
import { BrandIcon, Card, CardBody, CardHeader, DataList, DataRow, Link, NoValue } from '@/ui'
import { PLATFORM_NAME } from '@/utils/platform'

const REPO_URL = 'https://github.com/swiftsolve/rove'
const COPYRIGHT_YEAR = 2026

// The same recipe the 1024px app icon renders, so the two match.
const APP_ICON_TILE = cx(
  'mb-8 inline-flex size-[72px] items-center justify-center rounded-[16px]',
  'bg-[radial-gradient(circle_at_50%_56%,rgba(91,140,255,0.22),rgba(91,140,255,0)_68%),linear-gradient(180deg,#1f2125_0%,#16171a_100%)]',
  'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05),0_6px_16px_rgba(0,0,0,0.35)]',
)

export function AboutView() {
  const version = useAppVersion()

  return (
    <div className="page">
      <div className="flex flex-col items-center gap-4 px-12 pt-16 pb-12 text-center">
        <span className={APP_ICON_TILE} aria-hidden>
          <BrandIcon size={53} hasGradient />
        </span>
        <h1 className="font-display text-3xl font-(--type-title-weight) tracking-title text-primary">Rove</h1>
        <p className="type-body max-w-[300px] text-secondary">A fast, minimal network monitor for your desktop.</p>
        {version && <span className="type-caption mt-4 text-tertiary tabular-nums">Version {version}</span>}
      </div>

      <Card>
        <CardHeader title="Details" />
        <CardBody>
          <DataList>
            <DataRow label="Version">{version ?? <NoValue />}</DataRow>
            <DataRow label="Platform" value={PLATFORM_NAME} />
            <DataRow label="Source">
              <Link href={REPO_URL}>github.com/swiftsolve/rove</Link>
            </DataRow>
          </DataList>
        </CardBody>
      </Card>

      <p className="type-caption pt-8 pb-12 text-center text-tertiary">
        © {COPYRIGHT_YEAR} SwiftSolve. All rights reserved.
      </p>
    </div>
  )
}
