import { useEffect, useState } from 'react'
import { getVersion } from '@tauri-apps/api/app'
import Section from '@/components/ui/Section'
import DataRow from '@/components/ui/DataRow'
import { BrandIcon } from '@/components/ui/Icons'
import { IS_MAC } from '@/lib/platform'
import './AboutView.css'

const REPO_URL = 'https://github.com/swiftsolve/rove'

function platformLabel(): string {
  if (IS_MAC) return 'macOS'
  if (typeof navigator !== 'undefined' && /Win/i.test(navigator.userAgent)) return 'Windows'
  if (typeof navigator !== 'undefined' && /Linux/i.test(navigator.userAgent)) return 'Linux'
  return 'Desktop'
}

/** Read the running app version from Tauri, falling back gracefully outside it. */
function useAppVersion(): string | null {
  const [version, setVersion] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    getVersion()
      .then((v) => {
        if (alive) setVersion(v)
      })
      .catch(() => {
        // Not running under Tauri (e.g. a plain browser preview) — leave unknown.
        if (alive) setVersion(null)
      })
    return () => {
      alive = false
    }
  }, [])
  return version
}

export default function AboutView(): JSX.Element {
  const version = useAppVersion()

  return (
    <div className="view-page">
      <div className="about-hero">
        <span className="about-logo" aria-hidden>
          <BrandIcon size={53} gradient />
        </span>
        <h1 className="about-name">Rove</h1>
        <p className="about-tagline">A fast, minimal network monitor for your desktop.</p>
        {version && <span className="about-version">Version {version}</span>}
      </div>

      <Section title="Details" bodyClassName="row-list">
        <DataRow label="Version" value={version ?? '—'} />
        <DataRow label="Platform" value={platformLabel()} />
        <DataRow label="Source">
          <a className="about-link" href={REPO_URL} target="_blank" rel="noreferrer">
            github.com/swiftsolve/rove
          </a>
        </DataRow>
      </Section>

      <p className="about-footer text-meta">© {2026} SwiftSolve. All rights reserved.</p>
    </div>
  )
}
