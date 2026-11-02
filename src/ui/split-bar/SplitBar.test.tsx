import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SplitBar } from './SplitBar'

function segmentWidths(): string[] {
  const segments = screen.getByRole('img').querySelectorAll('span')
  return Array.from(segments, (segment) => segment.style.width)
}

describe('SplitBar', () => {
  it('reads out as one image, named by its label', () => {
    render(<SplitBar down={1} up={1} max={2} label="1 MB down, 1 MB up" />)
    expect(screen.getByRole('img', { name: '1 MB down, 1 MB up' })).toBeInTheDocument()
  })

  it('scales each segment against the max', () => {
    render(<SplitBar down={50} up={25} max={200} label="Traffic" />)
    expect(segmentWidths()).toEqual(['25%', '12.5%'])
  })

  it('collapses both segments when the max is zero, rather than NaN', () => {
    render(<SplitBar down={0} up={0} max={0} label="No traffic" />)
    expect(segmentWidths()).toEqual(['0%', '0%'])
  })
})
