import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { AppUsageSupport } from '@/types'

import { UsageBody, type UsageBodyCopy } from './UsageBody'

const COPY: UsageBodyCopy = {
  unsupportedDescription: 'Run as administrator.',
  loadingLabel: 'Measuring…',
  emptyTitle: 'Nothing yet',
  emptyDescription: 'Rows appear here.',
}

type BodyState = {
  support?: AppUsageSupport
  isFirstLoad?: boolean
  isEmpty?: boolean
}

function renderBody(props: BodyState): void {
  // The unsupported state's Restart action reads its detail through a query.
  render(
    <QueryClientProvider client={new QueryClient()}>
      <UsageBody
        support={props.support ?? 'supported'}
        isFirstLoad={props.isFirstLoad ?? false}
        isEmpty={props.isEmpty ?? false}
        copy={COPY}
      >
        <ul aria-label="Rows" />
      </UsageBody>
    </QueryClientProvider>,
  )
}

describe('UsageBody', () => {
  it('asks for administrator access when unsupported, even while loading', () => {
    renderBody({ support: 'unsupported', isFirstLoad: true, isEmpty: true })
    expect(screen.getByText('Administrator access needed')).toBeInTheDocument()
    expect(screen.getByText('Run as administrator.')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows the spinner on a first load', () => {
    renderBody({ isFirstLoad: true, isEmpty: true })
    expect(screen.getByRole('status')).toHaveTextContent('Measuring…')
    expect(screen.queryByText('Nothing yet')).not.toBeInTheDocument()
  })

  it('shows the empty state once loaded with no rows', () => {
    renderBody({ isEmpty: true })
    expect(screen.getByText('Nothing yet')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('shows the list once there are rows', () => {
    renderBody({})
    expect(screen.getByRole('list', { name: 'Rows' })).toBeInTheDocument()
  })
})
