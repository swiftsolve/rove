import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SecurityBadge } from './SecurityBadge'

/** The words a sighted reader sees, without the screen-reader description or the dot. */
function visibleWords(container: HTMLElement): string[] {
  return [...container.querySelectorAll('span[aria-hidden]')].map((span) => span.textContent).filter(Boolean)
}

describe('SecurityBadge', () => {
  it('says the verdict, then the full protocol, in the details', () => {
    const { container } = render(<SecurityBadge security="WPA3-Personal (H2E)" />)
    expect(visibleWords(container)).toEqual(['Secured', 'WPA3-Personal (H2E)'])
  })

  it('tells a screen reader the protocol without brackets, which it would read out', () => {
    const { container } = render(<SecurityBadge security="WPA3-Personal (H2E)" />)
    expect(container.querySelector('.sr-only')).toHaveTextContent(/^Secured, WPA3-Personal H2E$/)
  })

  it('says an open network is not secured in the details, with no protocol', () => {
    const { container } = render(<SecurityBadge security="Open" />)
    expect(visibleWords(container)).toEqual(['Not secured'])
  })

  it('calls a WEP or WPA network weak, with an amber lock and plain words', () => {
    const { container, rerender } = render(<SecurityBadge security="WEP" />)
    expect(visibleWords(container)).toEqual(['Weak', 'WEP'])
    expect(container.querySelector('svg')).toHaveClass('text-status-warning')
    expect(container.firstElementChild).not.toHaveClass('text-warning')
    rerender(<SecurityBadge security="WPA Personal" isShort />)
    expect(visibleWords(container)).toEqual(['WPA'])
    expect(container.querySelector('svg')).toHaveClass('text-status-warning')
    rerender(<SecurityBadge security="WPA/WPA2 Personal" />)
    expect(visibleWords(container)).toEqual(['Secured', 'WPA/WPA2 Personal'])
  })

  it('keeps just the strongest protocol, or Open, in the strip', () => {
    const { container, rerender } = render(<SecurityBadge security="WPA2 WPA3 Personal" isShort />)
    expect(visibleWords(container)).toEqual(['WPA3'])
    rerender(<SecurityBadge security="Open" isShort />)
    expect(visibleWords(container)).toEqual(['Open'])
  })
})
