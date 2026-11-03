import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { LoadingState } from './LoadingState'

describe('LoadingState', () => {
  it('announces what is loading', () => {
    render(<LoadingState label="Loading usage…" />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading usage…')
  })
})
