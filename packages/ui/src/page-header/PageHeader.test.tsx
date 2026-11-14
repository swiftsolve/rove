import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { PageHeader } from './PageHeader'

describe('PageHeader', () => {
  it('titles the page with its one heading', () => {
    render(<PageHeader title="Services" icon={null} description="12 services, all up" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Services' })).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('draws a Back button in the chip’s place that calls onBack', async () => {
    const onBack = vi.fn()
    render(<PageHeader title="Hosts" onBack={onBack} />)
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('fades the line in afresh when its text changes or it becomes an element, not when a count inside it ticks', () => {
    const line = (): HTMLElement | null | undefined =>
      screen.queryByRole('heading')?.nextElementSibling?.firstElementChild as HTMLElement | null
    const { rerender } = render(<PageHeader title="Speed" icon={null} description={null} />)
    const empty = line()

    rerender(<PageHeader title="Speed" icon={null} description="Measure your speeds" />)
    const text = line()
    expect(text).not.toBe(empty)
    expect(text).toHaveClass('animate-fade-in')

    rerender(<PageHeader title="Speed" icon={null} description={<span>2 up</span>} />)
    const element = line()
    expect(element).not.toBe(text)

    rerender(<PageHeader title="Speed" icon={null} description={<span>3 up</span>} />)
    expect(line()).toBe(element)
  })

  it('shows the status in the description’s place, and announces it through a region that was already there', () => {
    const { rerender } = render(<PageHeader title="Devices" icon={null} description="6 devices" />)
    const region = screen.getByRole('status')
    expect(region).toBeEmptyDOMElement()
    expect(screen.getByText('6 devices')).toBeInTheDocument()

    rerender(<PageHeader title="Devices" icon={null} description="6 devices" status="Scanning…" />)
    expect(screen.getByRole('status')).toBe(region)
    expect(region).toHaveTextContent('Scanning…')
    expect(screen.queryByText('6 devices')).not.toBeInTheDocument()

    rerender(<PageHeader title="Devices" icon={null} description="7 devices" />)
    expect(region).toBeEmptyDOMElement()
    expect(screen.getByText('7 devices')).toBeInTheDocument()
  })

  it('puts info before the actions, never among them', () => {
    const { container } = render(
      <PageHeader
        title="Speed"
        icon={null}
        info={{ label: 'About speed tests', hint: 'Hint' }}
        actions={<button type="button">Run test</button>}
      />,
    )
    const info = screen.getByRole('button', { name: 'About speed tests' })
    const run = screen.getByRole('button', { name: 'Run test' })
    expect(info.compareDocumentPosition(run) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(run.parentElement).not.toContainElement(info)
    expect(container.querySelector('header')).toContainElement(info)
  })
})
