import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ScreenReaderStatus } from './ScreenReaderStatus'

describe('ScreenReaderStatus', () => {
  it('is a status region hidden on screen', () => {
    render(<ScreenReaderStatus>Testing download…</ScreenReaderStatus>)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Testing download…')
    expect(status).toHaveClass('sr-only')
  })

  it('stays mounted with no text, so a later status is announced', () => {
    const { rerender } = render(<ScreenReaderStatus>{''}</ScreenReaderStatus>)
    const status = screen.getByRole('status')
    expect(status).toBeEmptyDOMElement()
    rerender(<ScreenReaderStatus>Done</ScreenReaderStatus>)
    expect(status).toHaveTextContent('Done')
  })
})
