import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Button } from '../button/Button'
import { Card, focusCardLink } from './Card'
import { CardHeader } from './components/CardHeader'

describe('Card', () => {
  it('names an openable card’s link by its header’s title', async () => {
    const onOpen = vi.fn()
    render(
      <Card onOpen={onOpen}>
        <CardHeader title="Usage" />
      </Card>,
    )
    await userEvent.click(screen.getByRole('link', { name: 'Usage' }))
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it('names the link by linkLabel when it says more', () => {
    render(
      <Card onOpen={vi.fn()} linkLabel="Usage: 4.9 GB down. Open Usage.">
        <CardHeader title="Usage" />
      </Card>,
    )
    expect(screen.getByRole('link', { name: 'Usage: 4.9 GB down. Open Usage.' })).toBeInTheDocument()
  })

  it('draws no link or caret without onOpen', () => {
    const { container } = render(
      <Card>
        <CardHeader title="Usage" />
      </Card>,
    )
    expect(screen.queryByRole('link')).toBeNull()
    expect(container.querySelector('svg')).toBeNull()
  })
})

describe('focusCardLink', () => {
  it('moves focus from a control in an openable card to the card’s link', () => {
    render(
      <Card onOpen={vi.fn()}>
        <CardHeader title="Usage" actions={<Button>Reset</Button>} />
      </Card>,
    )
    const reset = screen.getByRole('button', { name: 'Reset' })
    reset.focus()
    focusCardLink(reset)
    expect(screen.getByRole('link', { name: 'Usage' })).toHaveFocus()
  })

  it('leaves focus alone outside an openable card', () => {
    render(
      <Card>
        <CardHeader title="Usage" actions={<Button>Reset</Button>} />
      </Card>,
    )
    const reset = screen.getByRole('button', { name: 'Reset' })
    reset.focus()
    focusCardLink(reset)
    expect(reset).toHaveFocus()
  })
})
