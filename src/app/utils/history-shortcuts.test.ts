import { describe, expect, it } from 'vitest'

import { historyStepForButton, historyStepForKey, type ShortcutKey } from './history-shortcuts'

type Mods = { isAlt?: boolean; isMeta?: boolean; isCtrl?: boolean; isShift?: boolean }

const press = (
  key: string,
  { isAlt = false, isMeta = false, isCtrl = false, isShift = false }: Mods = {},
): ShortcutKey => ({
  key,
  altKey: isAlt,
  metaKey: isMeta,
  ctrlKey: isCtrl,
  shiftKey: isShift,
})

const OFF_MAC = { isMac: false, isEditing: false }
const ON_MAC = { isMac: true, isEditing: false }

describe('historyStepForKey', () => {
  it('takes Alt+arrows off macOS', () => {
    expect(historyStepForKey(press('ArrowLeft', { isAlt: true }), OFF_MAC)).toBe('back')
    expect(historyStepForKey(press('ArrowRight', { isAlt: true }), OFF_MAC)).toBe('forward')
    expect(historyStepForKey(press('ArrowLeft'), OFF_MAC)).toBeNull()
    expect(historyStepForKey(press('[', { isMeta: true }), OFF_MAC)).toBeNull()
  })

  it('takes ⌘[ ⌘] and ⌘arrows on macOS, not Option+arrows', () => {
    expect(historyStepForKey(press('[', { isMeta: true }), ON_MAC)).toBe('back')
    expect(historyStepForKey(press(']', { isMeta: true }), ON_MAC)).toBe('forward')
    expect(historyStepForKey(press('ArrowLeft', { isMeta: true }), ON_MAC)).toBe('back')
    expect(historyStepForKey(press('ArrowLeft', { isAlt: true }), ON_MAC)).toBeNull()
  })

  it('leaves the arrows to a text field, but not the brackets', () => {
    expect(historyStepForKey(press('ArrowLeft', { isAlt: true }), { ...OFF_MAC, isEditing: true })).toBeNull()
    expect(historyStepForKey(press('ArrowLeft', { isMeta: true }), { ...ON_MAC, isEditing: true })).toBeNull()
    expect(historyStepForKey(press('[', { isMeta: true }), { ...ON_MAC, isEditing: true })).toBe('back')
  })

  it('ignores the shortcuts with Shift or Ctrl held', () => {
    expect(historyStepForKey(press('ArrowLeft', { isAlt: true, isShift: true }), OFF_MAC)).toBeNull()
    expect(historyStepForKey(press('[', { isMeta: true, isCtrl: true }), ON_MAC)).toBeNull()
  })

  it('takes the keyboard’s own Back and Forward keys everywhere', () => {
    expect(historyStepForKey(press('BrowserBack'), ON_MAC)).toBe('back')
    expect(historyStepForKey(press('BrowserForward'), { ...OFF_MAC, isEditing: true })).toBe('forward')
  })
})

describe('historyStepForButton', () => {
  it('maps the thumb buttons and nothing else', () => {
    expect(historyStepForButton(3)).toBe('back')
    expect(historyStepForButton(4)).toBe('forward')
    expect(historyStepForButton(0)).toBeNull()
  })
})
