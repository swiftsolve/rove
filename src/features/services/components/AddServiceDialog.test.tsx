import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { NetworkAPI } from '@/types'

import { AddServiceDialog } from './AddServiceDialog'

/** A probe the test settles itself, to check what happens while it's in flight. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

const testService = vi.fn<(host: string) => Promise<number | null>>()

beforeEach(() => {
  testService.mockReset()
  window.networkAPI = { testService } as Partial<NetworkAPI> as NetworkAPI
})

afterEach(() => {
  delete window.networkAPI
})

function renderDialog(props: { editedService?: { name: string; host: string }; onSave?: () => Promise<void> } = {}) {
  const onSave = vi.fn(props.onSave ?? (() => Promise.resolve()))
  const onClose = vi.fn()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AddServiceDialog onSave={onSave} onClose={onClose} editedService={props.editedService} />
    </QueryClientProvider>,
  )
  return { onSave, onClose, user: userEvent.setup() }
}

const address = () => screen.getByRole('textbox', { name: 'Address' })
const nameField = () => screen.getByRole('textbox', { name: 'Name' })

describe('AddServiceDialog', () => {
  it('names the service from its address until the user types a name', async () => {
    const { user } = renderDialog()
    await user.type(address(), 'api.github.com')
    expect(nameField()).toHaveValue('Github')

    await user.clear(nameField())
    await user.type(nameField(), 'Code')
    await user.type(address(), '/x')
    expect(nameField()).toHaveValue('Code')
  })

  it('tests a reachable host on Add, then adds it with the latency it measured', async () => {
    testService.mockResolvedValue(42)
    const { user, onSave, onClose } = renderDialog()
    await user.type(address(), 'zoom.us')
    await user.click(screen.getByRole('button', { name: 'Add service' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Zoom', 'zoom.us', 42))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(testService).toHaveBeenCalledWith('zoom.us')
  })

  it('holds a down host for "Add anyway", then adds it with no latency', async () => {
    testService.mockResolvedValue(null)
    const { user, onSave } = renderDialog()
    await user.type(address(), 'zoom.us')
    await user.click(screen.getByRole('button', { name: 'Add service' }))

    expect(await screen.findByText('Down')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Add anyway' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Zoom', 'zoom.us', null))
  })

  it('shows the inline Test result without adding, and an address edit clears it', async () => {
    testService.mockResolvedValue(42)
    const { user, onSave } = renderDialog()
    await user.type(address(), 'zoom.us')
    await user.click(screen.getByRole('button', { name: 'Test' }))

    expect(await screen.findByText('42.0 ms')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
    await user.type(address(), 'x')
    expect(screen.queryByText('42.0 ms')).not.toBeInTheDocument()
    expect(screen.getByText('Tested when you add it.')).toBeInTheDocument()
  })

  it('drops a test result that lands after the address changed', async () => {
    const probe = deferred<number | null>()
    testService.mockReturnValue(probe.promise)
    const { user, onSave } = renderDialog()
    await user.type(address(), 'zoom.us')
    await user.click(screen.getByRole('button', { name: 'Add service' }))
    await user.type(address(), 'x')

    probe.resolve(42)
    await new Promise((settle) => setTimeout(settle, 0))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.queryByText('42.0 ms')).not.toBeInTheDocument()
  })

  it('adds with the name typed while the test ran', async () => {
    const probe = deferred<number | null>()
    testService.mockReturnValue(probe.promise)
    const { user, onSave } = renderDialog()
    await user.type(address(), 'zoom.us')
    await user.click(screen.getByRole('button', { name: 'Add service' }))
    await user.clear(nameField())
    await user.type(nameField(), 'Meetings')

    probe.resolve(42)
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Meetings', 'zoom.us', 42))
  })

  it('does not add when cancelled while the test runs', async () => {
    const probe = deferred<number | null>()
    testService.mockReturnValue(probe.promise)
    const { user, onSave, onClose } = renderDialog()
    await user.type(address(), 'zoom.us')
    await user.click(screen.getByRole('button', { name: 'Add service' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()

    probe.resolve(42)
    await new Promise((settle) => setTimeout(settle, 0))
    expect(onSave).not.toHaveBeenCalled()
  })

  it('says why an address is invalid, a test failed, or adding failed', async () => {
    const { user } = renderDialog({ onSave: () => Promise.reject(new Error('disk full')) })
    await user.type(address(), 'not a host')
    await user.click(screen.getByRole('button', { name: 'Test' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid URL or IP address.')

    testService.mockRejectedValueOnce(new Error('no route'))
    await user.clear(address())
    await user.type(address(), 'zoom.us')
    await user.click(screen.getByRole('button', { name: 'Test' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not test that address. Try again.')

    testService.mockResolvedValueOnce(42)
    await user.click(screen.getByRole('button', { name: 'Add service' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not add that service.')
  })

  it('saves a rename without re-testing, and has nothing to save when unchanged', async () => {
    const { user, onSave } = renderDialog({ editedService: { name: 'Zoom', host: 'zoom.us' } })
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-disabled', 'true')

    await user.clear(nameField())
    await user.type(nameField(), 'Meetings')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Meetings', 'zoom.us', undefined))
    expect(testService).not.toHaveBeenCalled()
  })
})
