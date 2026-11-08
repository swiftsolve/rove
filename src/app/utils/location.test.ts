import { describe, expect, it } from 'vitest'

import { HOME_LOCATION, isAppLocation, isSameLocation, locationKey, parentLocation } from './location'

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

describe('isAppLocation', () => {
  it('accepts a tab this build has, and nothing else history might hold', () => {
    expect(isAppLocation({ tab: 'speed', speedSub: { view: 'history' } })).toBe(true)
    expect(isAppLocation({ tab: 'retired-tab' })).toBe(false)
    expect(isAppLocation({ speedSub: { view: 'history' } })).toBe(false)
    expect(isAppLocation(null)).toBe(false)
    expect(isAppLocation('home')).toBe(false)
  })
})
