import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Link } from './Link'

describe('Link', () => {
  it('is a plain link by default', () => {
    render(<Link href="/docs">Docs</Link>)
    const link = screen.getByRole('link', { name: 'Docs' })
    expect(link).toHaveAttribute('href', '/docs')
    expect(link).not.toHaveAttribute('target')
  })

  it('opens an external link in a new window, and says so', () => {
    render(
      <Link href="https://example.com" isExternal>
        Example
      </Link>,
    )
    const link = screen.getByRole('link', { name: 'Example (opens in a new window)' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noreferrer')
  })
})
