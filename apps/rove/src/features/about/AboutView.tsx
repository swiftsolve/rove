import { Card, CardBody, CardHeader, DataList, DataRow, Link, NoValue } from '@swiftsolve/rove-ui'

import { AppIconTile } from '@/features/about/components/AppIconTile'
import { useAppVersion } from '@/features/about/hooks/useAppVersion'
import { PLATFORM_NAME } from '@/utils/platform'

const REPO_URL = 'https://github.com/swiftsolve/rove'
const COPYRIGHT_YEAR = 2026

export function AboutView() {
  const version = useAppVersion()

  return (
    <div className="page">
      <div className="flex flex-col items-center gap-(--gap-stacked-lines) px-12 pt-16 pb-12 text-center">
        <AppIconTile />
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
