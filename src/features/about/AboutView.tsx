import { cx } from 'class-variance-authority'
import { BrandIcon, Card, CardBody, CardHeader, DataList, DataRow, Link } from '@/ui'
import { IS_MAC } from '@/lib/platform'
import { useAppVersion } from '@/features/about/hooks/useAppVersion'

const REPO_URL = 'https://github.com/swiftsolve/rove'
const COPYRIGHT_YEAR = 2026

// The dock icon's tile: a charcoal squircle (corners ~22% of the tile) with a
// soft blue glow just below centre, the same recipe the 1024px icon renders.
// The mark carries the app icon's blue gradient (BrandIcon `hasGradient`).
const APP_ICON_TILE = cx(
  'mb-8 inline-flex size-[72px] items-center justify-center rounded-[16px]',
  'bg-[radial-gradient(circle_at_50%_56%,rgba(91,140,255,0.22),rgba(91,140,255,0)_68%),linear-gradient(180deg,#1f2125_0%,#16171a_100%)]',
  'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05),0_6px_16px_rgba(0,0,0,0.35)]',
)

function platformLabel(): string {
  if (IS_MAC) return 'macOS'
  if (typeof navigator !== 'undefined' && /Win/i.test(navigator.userAgent)) return 'Windows'
  if (typeof navigator !== 'undefined' && /Linux/i.test(navigator.userAgent)) return 'Linux'
  return 'Desktop'
}

export function AboutView(): JSX.Element {
  const version = useAppVersion()

  return (
    <div className="page">
      <div className="flex flex-col items-center gap-4 px-12 pt-16 pb-12 text-center">
        <span className={APP_ICON_TILE} aria-hidden>
          <BrandIcon size={53} hasGradient />
        </span>
        <h1 className="text-3xl font-semibold tracking-heading-large text-primary">Rove</h1>
        <p className="max-w-[300px] text-md leading-body-default text-secondary">
          A fast, minimal network monitor for your desktop.
        </p>
        {version && <span className="mt-4 text-xs text-tertiary tabular-nums">Version {version}</span>}
      </div>

      <Card>
        <CardHeader title="Details" />
        <CardBody>
          <DataList>
            <DataRow label="Version" value={version ?? '—'} />
            <DataRow label="Platform" value={platformLabel()} />
            <DataRow label="Source">
              <Link href={REPO_URL}>github.com/swiftsolve/rove</Link>
            </DataRow>
          </DataList>
        </CardBody>
      </Card>

      <p className="type-caption text-tertiary pt-8 pb-12 text-center">
        © {COPYRIGHT_YEAR} SwiftSolve. All rights reserved.
      </p>
    </div>
  )
}
