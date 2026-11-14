import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SpokenText } from './SpokenText'

describe('SpokenText', () => {
  it('shows its text to sighted readers and its spoken words to screen readers', () => {
    const { container } = render(<SpokenText spoken="at least 25 Mbps">≥ 25 Mbps</SpokenText>)
    expect(container.querySelector('[aria-hidden]')).toHaveTextContent('≥ 25 Mbps')
    expect(container.querySelector('.sr-only')).toHaveTextContent('at least 25 Mbps')
  })
})
