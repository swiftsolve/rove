import { useCallback, useSyncExternalStore } from 'react'

import { decodeSetting, settingStore } from '@/utils/setting-store'

/**
 * A preference persisted to localStorage (see `setting-store.ts`): a boolean
 * toggle or free text, typed by its fallback. Every component reading the same
 * key shares one value, in this window and in any other, so a change made in
 * one place shows everywhere at once.
 *
 * A missing value reads as `fallback`; a value that isn't `true` reads as false
 * for a boolean.
 */
export function useSetting(key: string, fallback: boolean): [boolean, (value: boolean) => void]
export function useSetting(key: string, fallback: string): [string, (value: string) => void]
export function useSetting(key: string, fallback: boolean | string): [boolean | string, (value: never) => void] {
  const subscribe = useCallback((listener: () => void) => settingStore.subscribe(key, listener), [key])
  const raw = useSyncExternalStore(subscribe, () => settingStore.read(key))
  const setValue = useCallback((value: boolean | string): void => settingStore.write(key, String(value)), [key])
  return [decodeSetting(raw, fallback), setValue]
}

/** Read a setting once, outside React (at launch, or when a sound is about to play). */
export function getSetting(key: string, fallback: boolean): boolean
export function getSetting(key: string, fallback: string): string
export function getSetting(key: string, fallback: boolean | string): boolean | string {
  return decodeSetting(settingStore.read(key), fallback)
}
