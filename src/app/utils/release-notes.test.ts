import { describe, expect, it } from 'vitest'
import { releaseNoteItems } from '@/app/utils/release-notes'

describe('releaseNoteItems', () => {
  it('gives one item per line', () => {
    expect(releaseNoteItems('Faster speed tests.\nOne dialog style across the app.')).toEqual([
      'Faster speed tests.',
      'One dialog style across the app.',
    ])
  })

  it('drops blank lines and existing bullets', () => {
    // eslint-disable-next-line no-restricted-syntax -- a typed bullet is the input under test, not a separator.
    expect(releaseNoteItems('- First\n\n* Second\n  • Third  \n')).toEqual(['First', 'Second', 'Third'])
  })
})
