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
    docs: { toc: GUIDANCE_TOC },
    guidance: {
      use: [
        'Progress the screen shows without words: “Testing download…”.',
        'An outcome to announce once it’s in, like an update check’s result.',
        'A status that changes while focus stays where it is.',
      ],
      avoid: [
        'A page’s status shown on screen too: use `PageHeader`’s `status`, already announced.',
        'A field’s error or hint: use `TextField`’s `feedback`.',
        'A failure the user must see: use `Banner`.',
        'Hidden words that never change: a plain `sr-only` span.',
      ],
      states: [
        'Empty: mounted, saying nothing.',
        'New text: read out once, after what’s being read.',
        'Never visible, whatever it holds.',
      ],
      accessibility: {
        builtIn: [
          '`role="status"`: a polite live region, read without interrupting.',
          'Hidden on screen, still in the accessibility tree.',
        ],
        yours: [
          'Keep it mounted, with empty text when there’s nothing to say.',
          'Short text that makes sense heard alone.',
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
