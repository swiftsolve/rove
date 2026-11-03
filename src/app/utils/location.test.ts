import { describe, expect, it } from 'vitest'

import { HOME_LOCATION, isSameLocation, locationKey, parentLocation } from './location'

describe('parentLocation', () => {
  it('goes from a subpage to its tab, and from a tab to Home', () => {
    expect(parentLocation({ tab: 'speed', speedSub: { view: 'history' } })).toEqual({ tab: 'speed' })
    expect(parentLocation({ tab: 'apps', appsSub: { view: 'traffic' } })).toEqual({ tab: 'apps' })
    expect(parentLocation({ tab: 'devices' })).toEqual(HOME_LOCATION)
  })
})

describe('isSameLocation', () => {
  it('compares the subpage and its state, not just the tab', () => {
    const details = (target: 'gaming' | 'browsing') => ({
      tab: 'speed' as const,
      speedSub: { view: 'details' as const, target },
    })
    expect(isSameLocation(details('gaming'), details('gaming'))).toBe(true)
    expect(isSameLocation(details('gaming'), details('browsing'))).toBe(false)
    expect(
      isSameLocation(
        { tab: 'apps', appsSub: { view: 'hosts', app: 'Zoom' } },
        { tab: 'apps', appsSub: { view: 'hosts' } },
      ),
    ).toBe(false)
    expect(isSameLocation({ tab: 'speed', speedSub: null }, { tab: 'speed' })).toBe(true)
  })
})

describe('locationKey', () => {
  it('differs exactly when the location does', () => {
    expect(locationKey({ tab: 'speed' })).toBe(locationKey({ tab: 'speed', speedSub: null }))
    expect(locationKey({ tab: 'apps', appsSub: { view: 'hosts', app: 'Zoom' } })).not.toBe(
      locationKey({ tab: 'apps', appsSub: { view: 'hosts', app: 'Slack' } }),
    )
  })
})
