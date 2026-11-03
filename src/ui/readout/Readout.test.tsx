import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Readout } from './Readout'

describe('Readout', () => {
  it('pairs its label with its value in a description list', () => {
    render(
      <dl>
        <Readout label="Download" value="182" unit="Mbps" />
      </dl>,
    )
    expect(screen.getByRole('term')).toHaveTextContent('Download')
    expect(screen.getByRole('definition')).toHaveTextContent('182Mbps')
  })

  it('speaks the settled value while the visible digits animate', () => {
    render(
      <dl>
        <Readout label="Download" value="97.4" unit="Mbps" spokenValue="182 Mbps" />
      </dl>,
    )
    const value = screen.getByRole('definition')
    expect(value.querySelector('.sr-only')).toHaveTextContent('182 Mbps')
    expect(screen.getByText('97.4')).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders a bare figure, outside any list, without a label', () => {
    render(<Readout size="compact" value="4.6" unit="GB" />)
    expect(screen.queryByRole('term')).toBeNull()
    expect(screen.getByText('4.6').closest('.metric')).toHaveClass('metric-compact')
  })
})
