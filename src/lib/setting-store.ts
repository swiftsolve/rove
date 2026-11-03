/**
 * Preferences persisted to localStorage under `rove.setting.<key>`, as one
 * store every reader shares. A write reaches every reader in this window at
 * once: localStorage's own `storage` event only fires in the other windows,
 * which adopt it through `adoptExternalChange`.
 *
 * Storage is best-effort. A read that throws (private mode) reads as nothing
 * stored, and a write that throws (quota) still updates the value in memory,
 * so a preference can never crash the app.
 */
const KEY_PREFIX = 'rove.setting.'

type Listener = () => void

/** The part of `Storage` the store uses, so tests can hand it a fake. */
export type SettingStorage = Pick<Storage, 'getItem' | 'setItem'>

export type SettingStore = {
  /** The stored text for `key`, or null when nothing is stored. */
  read: (key: string) => string | null
  /** Store `value` for `key` and tell its readers. */
  write: (key: string, value: string) => void
  /** Call `listener` whenever `key` changes. Returns the unsubscribe. */
  subscribe: (key: string, listener: Listener) => () => void
  /** Re-read a key another window changed, given the `storage` event's key (null when it cleared everything). */
  adoptExternalChange: (storageKey: string | null) => void
}

export function createSettingStore(getStorage: () => SettingStorage): SettingStore {
  // What each key read last, so a snapshot read is a map lookup and stays the
  // same value until the key changes.
  const cache = new Map<string, string | null>()
  const listeners = new Map<string, Set<Listener>>()

  const notify = (key: string): void => {
    for (const listener of listeners.get(key) ?? []) listener()
  }

  const readStorage = (key: string): string | null => {
    try {
      return getStorage().getItem(KEY_PREFIX + key)
    } catch {
      return null
    }
  }

  return {
    read(key) {
      if (!cache.has(key)) cache.set(key, readStorage(key))
      return cache.get(key) ?? null
    },
    write(key, value) {
      cache.set(key, value)
      try {
        getStorage().setItem(KEY_PREFIX + key, value)
      } catch {
        // Persisting is best-effort; the in-memory value still updates.
      }
      notify(key)
    },
    subscribe(key, listener) {
      const keyListeners = listeners.get(key) ?? new Set<Listener>()
      keyListeners.add(listener)
      listeners.set(key, keyListeners)
      return () => {
        keyListeners.delete(listener)
      }
    },
    adoptExternalChange(storageKey) {
      if (storageKey == null) {
        const keys = [...cache.keys()]
        cache.clear()
        keys.forEach(notify)
        return
      }
      if (!storageKey.startsWith(KEY_PREFIX)) return
      const key = storageKey.slice(KEY_PREFIX.length)
      cache.delete(key)
      notify(key)
    },
  }
}

/** A stored setting as its type: a boolean is stored as `true`/`false`, a string as itself. */
export function decodeSetting(raw: string | null, fallback: boolean): boolean
export function decodeSetting(raw: string | null, fallback: string): string
export function decodeSetting(raw: string | null, fallback: boolean | string): boolean | string
export function decodeSetting(raw: string | null, fallback: boolean | string): boolean | string {
  if (raw == null) return fallback
  return typeof fallback === 'boolean' ? raw === 'true' : raw
}

/** The app's settings, in this window's localStorage. */
export const settingStore = createSettingStore(() => window.localStorage)

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => settingStore.adoptExternalChange(event.key))
}
