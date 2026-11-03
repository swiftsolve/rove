import { describe, expect, it, vi } from 'vitest'

import { createSettingStore, decodeSetting, type SettingStorage } from './setting-store'

function fakeStorage(entries: Record<string, string> = {}): SettingStorage & { entries: Map<string, string> } {
  const map = new Map(Object.entries(entries))
  return {
    entries: map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value)
    },
  }
}

describe('createSettingStore', () => {
  it('reads what is stored under the setting prefix, or null', () => {
    const store = createSettingStore(() => fakeStorage({ 'rove.setting.sound': 'false' }))
    expect(store.read('sound')).toBe('false')
    expect(store.read('missing')).toBeNull()
  })

  it('persists a write under the prefix and reads it back', () => {
    const storage = fakeStorage()
    const store = createSettingStore(() => storage)
    store.write('sound', 'true')
    expect(storage.entries.get('rove.setting.sound')).toBe('true')
    expect(store.read('sound')).toBe('true')
  })

  it('tells every reader of the key about a write, and no one else', () => {
    const store = createSettingStore(() => fakeStorage())
    const first = vi.fn()
    const second = vi.fn()
    const other = vi.fn()
    store.subscribe('sound', first)
    store.subscribe('sound', second)
    store.subscribe('autoUpdate', other)
    store.write('sound', 'false')
    expect(first).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledOnce()
    expect(other).not.toHaveBeenCalled()
  })

  it('stops calling a listener once it unsubscribes', () => {
    const store = createSettingStore(() => fakeStorage())
    const listener = vi.fn()
    const unsubscribe = store.subscribe('sound', listener)
    unsubscribe()
    store.write('sound', 'false')
    expect(listener).not.toHaveBeenCalled()
  })

  it('reads the same value until the key changes', () => {
    const storage = fakeStorage({ 'rove.setting.mode': 'dark' })
    const store = createSettingStore(() => storage)
    expect(store.read('mode')).toBe('dark')
    // Written behind the store's back, as another window would.
    storage.entries.set('rove.setting.mode', 'light')
    expect(store.read('mode')).toBe('dark')
  })

  it('adopts a change another window made to one of its keys', () => {
    const storage = fakeStorage({ 'rove.setting.mode': 'dark' })
    const store = createSettingStore(() => storage)
    const listener = vi.fn()
    store.subscribe('mode', listener)
    expect(store.read('mode')).toBe('dark')
    storage.entries.set('rove.setting.mode', 'light')
    store.adoptExternalChange('rove.setting.mode')
    expect(listener).toHaveBeenCalledOnce()
    expect(store.read('mode')).toBe('light')
  })

  it('ignores another window changing a key that is not a setting', () => {
    const store = createSettingStore(() => fakeStorage())
    const listener = vi.fn()
    store.subscribe('mode', listener)
    store.adoptExternalChange('rove.speed-history.v1')
    expect(listener).not.toHaveBeenCalled()
  })

  it('re-reads every key when another window clears storage', () => {
    const storage = fakeStorage({ 'rove.setting.mode': 'light', 'rove.setting.sound': 'false' })
    const store = createSettingStore(() => storage)
    const listener = vi.fn()
    store.subscribe('mode', listener)
    store.read('mode')
    store.read('sound')
    storage.entries.clear()
    store.adoptExternalChange(null)
    expect(listener).toHaveBeenCalledOnce()
    expect(store.read('mode')).toBeNull()
    expect(store.read('sound')).toBeNull()
  })

  it('reads nothing stored when storage throws', () => {
    const store = createSettingStore(() => {
      throw new Error('SecurityError')
    })
    expect(store.read('sound')).toBeNull()
  })

  it('still updates in memory when persisting throws', () => {
    const storage = fakeStorage()
    storage.setItem = () => {
      throw new Error('QuotaExceededError')
    }
    const store = createSettingStore(() => storage)
    const listener = vi.fn()
    store.subscribe('sound', listener)
    store.write('sound', 'false')
    expect(store.read('sound')).toBe('false')
    expect(listener).toHaveBeenCalledOnce()
  })
})

describe('decodeSetting', () => {
  it('falls back when nothing is stored', () => {
    expect(decodeSetting(null, true)).toBe(true)
    expect(decodeSetting(null, 'dark')).toBe('dark')
  })

  it('reads a boolean as true only for "true"', () => {
    expect(decodeSetting('true', false)).toBe(true)
    expect(decodeSetting('false', true)).toBe(false)
    expect(decodeSetting('garbage', true)).toBe(false)
  })

  it('reads a string as stored, even when empty', () => {
    expect(decodeSetting('light', 'dark')).toBe('light')
    expect(decodeSetting('', 'dark')).toBe('')
  })
})
