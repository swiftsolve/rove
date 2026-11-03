import { getVersion } from '@tauri-apps/api/app'
import { useEffect, useState } from 'react'

/** Read the running app version from Tauri, falling back gracefully outside it. */
export function useAppVersion(): string | null {
  const [version, setVersion] = useState<string | null>(null)
  useEffect(() => {
    let isAlive = true
    getVersion()
      .then((appVersion) => {
        if (isAlive) setVersion(appVersion)
      })
      .catch(() => {
        // Not running under Tauri (e.g. a plain browser preview) — leave unknown.
        if (isAlive) setVersion(null)
      })
    return () => {
      isAlive = false
    }
  }, [])
  return version
}
