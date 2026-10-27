import { cx } from 'class-variance-authority'
import { Section } from '@/components/Section'
import { DataRow } from '@/components/DataRow'
import { BrandIcon } from '@/components/icons/Icons'
import { IS_MAC } from '@/lib/platform'
import { useAppVersion } from '@/features/about/hooks/useAppVersion'
import styles from './AboutView.module.css'

const REPO_URL = 'https://github.com/swiftsolve/rove'
const COPYRIGHT_YEAR = 2026

function platformLabel(): string {
  if (IS_MAC) return 'macOS'
  if (typeof navigator !== 'undefined' && /Win/i.test(navigator.userAgent)) return 'Windows'
  if (typeof navigator !== 'undefined' && /Linux/i.test(navigator.userAgent)) return 'Linux'
  return 'Desktop'
}

export function AboutView(): JSX.Element {
  const version = useAppVersion()

  return (
    <div className="view-page">
      <div className={styles.hero}>
        <span className={styles.logo} aria-hidden>
          <BrandIcon size={53} hasGradient />
        </span>
        <h1 className={styles.name}>Rove</h1>
        <p className={styles.tagline}>A fast, minimal network monitor for your desktop.</p>
        {version && <span className={styles.version}>Version {version}</span>}
      </div>

      <Section title="Details" bodyAs="dl" bodyClassName="row-list">
        <DataRow label="Version" value={version ?? '—'} />
        <DataRow label="Platform" value={platformLabel()} />
        <DataRow label="Source">
          <a className={styles.link} href={REPO_URL} target="_blank" rel="noreferrer">
            github.com/swiftsolve/rove
            <span className="sr-only"> (opens in a new window)</span>
          </a>
        </DataRow>
      </Section>

      <p className={cx(styles.footer, 'text-meta')}>© {COPYRIGHT_YEAR} SwiftSolve. All rights reserved.</p>
    </div>
  )
}
