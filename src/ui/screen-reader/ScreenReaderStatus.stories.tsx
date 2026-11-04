import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'

import { type Guidance, GUIDANCE_TOC } from '../../../.storybook/docs-page'
import { Button } from '../button/Button'
import { ScreenReaderStatus } from './ScreenReaderStatus'

const meta = {
  title: 'Accessibility/ScreenReaderStatus',
  component: ScreenReaderStatus,
  args: { children: 'Testing download…' },
  parameters: {
    docs: { subtitle: 'A status only screen readers hear, read out when it changes.', toc: GUIDANCE_TOC },
    guidance: {
      whenToUse: [
        'A run’s steps and result, like the speed test’s.',
        'An outcome the screen shows silently: “You’re on the latest version.”',
      ],
      whenNotToUse: [
        'A page’s status: use `PageHeader`’s `status`, already announced.',
        'An error the user must see: use `Banner`, which announces it.',
      ],
      accessibility: {
        builtIn: ['`role="status"`: a polite live region.', 'Hidden on screen, still read by screen readers.'],
        toHandle: [
          'Keep it mounted; pass empty text when there’s nothing to say.',
          'Text that makes sense heard alone.',
          'New text only when the status changes, not on every tick.',
        ],
      },
    } satisfies Guidance,
  },
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
