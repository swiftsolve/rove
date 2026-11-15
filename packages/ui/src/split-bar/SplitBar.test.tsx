import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SplitBar } from './SplitBar'

/** The fill's width on the track, then each segment's share of the fill. */
function barWidths(): string[] {
  const fill = screen.getByRole('img').querySelector<HTMLElement>('[data-part="fill"]')
  if (!fill) throw new Error('SplitBar rendered no fill')
  const segments = Array.from(fill.querySelectorAll('span'), (segment) => segment.style.width)
  return [fill.style.width, ...segments]
}

describe('SplitBar', () => {
  it('reads out as one image, named by its label', () => {
    render(<SplitBar down={1} up={1} max={2} label="1 MB down, 1 MB up" />)
    expect(screen.getByRole('img', { name: '1 MB down, 1 MB up' })).toBeInTheDocument()
  })

  it('scales the fill against the max, and splits it between the segments', () => {
    render(<SplitBar down={50} up={25} max={200} label="Traffic" />)
    expect(barWidths()).toEqual(['37.5%', `${(50 / 75) * 100}%`, `${(25 / 75) * 100}%`])
  })

  it('collapses the fill and both segments when everything is zero, rather than NaN', () => {
    render(<SplitBar down={0} up={0} max={0} label="No traffic" />)
    expect(barWidths()).toEqual(['0%', '0%', '0%'])
  })
})
