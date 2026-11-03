import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'

import { Button } from '../button/Button'
import { ScreenReaderStatus } from './ScreenReaderStatus'

const meta = {
  title: 'Accessibility/ScreenReaderStatus',
  component: ScreenReaderStatus,
  args: { children: 'Testing download…' },
} satisfies Meta<typeof ScreenReaderStatus>

export default meta
type Story = StoryObj<typeof meta>

/** Nothing shows; a screen reader reads the text out as it changes. */
export const Default: Story = {}

function Announcer() {
  const [status, setStatus] = useState('')
  return (
    <div className="flex items-center gap-12">
      <Button onClick={() => setStatus('Check complete')}>Run check</Button>
      <ScreenReaderStatus>{status}</ScreenReaderStatus>
    </div>
  )
}

/** Mounted empty, it announces the text a button sets. */
export const AnnouncesAChange: Story = {
  tags: ['!autodocs'],
  render: () => <Announcer />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('status')).toBeEmptyDOMElement()
    await userEvent.click(canvas.getByRole('button', { name: 'Run check' }))
    await expect(canvas.getByRole('status')).toHaveTextContent('Check complete')
  },
}
