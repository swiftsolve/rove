import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { TitleBarStatus } from './TitleBarStatus'

describe('TitleBarStatus', () => {
  it('announces its words as a status', () => {
    render(<TitleBarStatus tone="positive">Online</TitleBarStatus>)
    expect(screen.getByRole('status')).toHaveTextContent('Online')
  })

  it('replays the rise when the words change, not when only the tone does', () => {
    const words = (): HTMLElement => screen.getByText(/./, { selector: '.animate-status-flip' })
    const { rerender } = render(<TitleBarStatus tone="positive">Online</TitleBarStatus>)
    const online = words()

    rerender(<TitleBarStatus tone="negative">No internet</TitleBarStatus>)
    const noInternet = words()
    expect(noInternet).not.toBe(online)
    expect(noInternet).toHaveTextContent('No internet')

    rerender(<TitleBarStatus tone="neutral">No internet</TitleBarStatus>)
    expect(words()).toBe(noInternet)
  })
})
