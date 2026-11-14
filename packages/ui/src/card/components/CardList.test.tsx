import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { CardList } from './CardList'

const DEVICE_NAMES = ['MacBook Pro', 'Living room TV', 'Pixel 8']

function renderDeviceList() {
  render(
    <CardList label="Devices">
      {DEVICE_NAMES.map((name) => (
        <li key={name}>
          <button type="button">{name}</button>
          <button type="button" aria-haspopup="menu">{`More for ${name}`}</button>
        </li>
      ))}
    </CardList>,
  )
}

const rowButton = (name: string): HTMLElement => screen.getByRole('button', { name })

describe('CardList', () => {
  it('moves focus between rows with Up and Down, stopping at the ends', async () => {
    renderDeviceList()
    rowButton('MacBook Pro').focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(rowButton('Living room TV')).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    expect(rowButton('Pixel 8')).toHaveFocus()
    await userEvent.keyboard('{ArrowUp}')
    expect(rowButton('Living room TV')).toHaveFocus()
  })

  it('jumps to the first and last row with Home and End', async () => {
    renderDeviceList()
    rowButton('Living room TV').focus()
    await userEvent.keyboard('{End}')
    expect(rowButton('Pixel 8')).toHaveFocus()
    await userEvent.keyboard('{Home}')
    expect(rowButton('MacBook Pro')).toHaveFocus()
  })

  it('keeps every row a Tab stop', async () => {
    renderDeviceList()
    await userEvent.tab()
    expect(rowButton('MacBook Pro')).toHaveFocus()
    await userEvent.tab()
    await userEvent.tab()
    expect(rowButton('Living room TV')).toHaveFocus()
  })

  it('leaves a menu trigger’s arrow keys to its menu', async () => {
    renderDeviceList()
    rowButton('More for MacBook Pro').focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(rowButton('More for MacBook Pro')).toHaveFocus()
  })
})
