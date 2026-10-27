import { useCallback, useEffect, useState } from 'react'

/**
 * A single boolean preference persisted to localStorage under a namespaced key,
 * so it survives reloads and stays in sync across components reading the same
 * key within the session.
 *
 * Reads are defensive: a missing or malformed value falls back to `fallback`,
 * and any storage error (private mode, quota) is swallowed so a preference can
 * never crash the app.
 */
const KEY_PREFIX = 'rove.setting.'

function readSetting(key: string, fallback: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(KEY_PREFIX + key)
    return raw == null ? fallback : raw === 'true'
  } catch {
    return fallback
  }
}

function readStringSetting(key: string, fallback: string): string {
  try {
    const raw = window.localStorage.getItem(KEY_PREFIX + key)
    return raw == null ? fallback : raw
  } catch {
    return fallback
  }
}

export function useSetting(key: string, fallback: boolean): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState<boolean>(() => readSetting(key, fallback))

  // Adopt cross-tab/webview changes to the same key so two open surfaces agree.
  useEffect(() => {
    const onStorage = (event: StorageEvent): void => {
      if (event.key === KEY_PREFIX + key) setValue(readSetting(key, fallback))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [key, fallback])

  const setAndPersist = useCallback(
    (next: boolean): void => {
      setValue(next)
      try {
        window.localStorage.setItem(KEY_PREFIX + key, String(next))
      } catch {
        // Persisting is best-effort; the in-memory value still updates.
      }
    },
    [key],
  )

  return [value, setAndPersist]
}

/** Read a persisted boolean once, outside React (e.g. at launch). */
export function getSetting(key: string, fallback: boolean): boolean {
  return readSetting(key, fallback)
}

/**
 * A single string preference, persisted like {@link useSetting} but for free
 * text (e.g. an API key). Same defensive reads and cross-surface sync.
 */
export function useSettingString(
  key: string,
  fallback: string,
): [string, (value: string) => void] {
  const [value, setValue] = useState<string>(() => readStringSetting(key, fallback))

  useEffect(() => {
    const onStorage = (event: StorageEvent): void => {
      if (event.key === KEY_PREFIX + key) setValue(readStringSetting(key, fallback))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [key, fallback])

  const setAndPersist = useCallback(
    (next: string): void => {
      setValue(next)
      try {
        window.localStorage.setItem(KEY_PREFIX + key, next)
      } catch {
        // Persisting is best-effort; the in-memory value still updates.
      }
    },
    [key],
  )

  return [value, setAndPersist]
}

/** Read a persisted string once, outside React (e.g. when building a request). */
export function getSettingString(key: string, fallback: string): string {
  return readStringSetting(key, fallback)
}
