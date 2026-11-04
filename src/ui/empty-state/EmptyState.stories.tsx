import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { fn } from 'storybook/test'

import { type Guidance, GUIDANCE_TOC } from '../../../.storybook/docs-page'
import { Button } from '../button/Button'
import { PlusIcon, RefreshIcon } from '../icons/Icons'
import { EmptyState, EmptyStateDescription } from './EmptyState'

const meta = {
  title: 'Status and feedback/EmptyState',
  component: EmptyState,
  args: { title: 'No services yet', description: "Add one to see whether it's up." },
  parameters: {
    docs: {
      subtitle: 'A page with nothing to show yet: faded placeholder rows, a title and a way forward.',
      toc: GUIDANCE_TOC,
    },
    guidance: {
      whenToUse: [
        'A page with nothing to show yet: “No services yet”.',
        'A page the user can fill, its step in `actions`: Scan again.',
        'A page waiting on the user, `isLocked`: “Administrator access needed”.',
      ],
      whenNotToUse: [
        'A page still loading: use `LoadingState`.',
        'A load that failed: use `Banner`.',
        'One missing value in a row: use `NoValue`.',
      ],
      accessibility: {
        builtIn: [
          'The title is an `<h2>`, in the page outline.',
          'The placeholder rows and lock are hidden from screen readers.',
        ],
        toHandle: [
          'A title naming what’s empty: “No devices found”.',
          '`role="status"` on a note an action adds, so it’s announced.',
        ],
      },
    } satisfies Guidance,
  },
  argTypes: { actions: { control: false } },
  // It fills the page's content area, so it gets a box to centre in.
  render: (args) => (
    <div className="flex h-[280px] w-[360px]">
      <EmptyState {...args} />
    </div>
  ),
} satisfies Meta<typeof EmptyState>

export default meta
type Story = StoryObj<typeof meta>

/** Waiting on the user, with the action that fills it. */
export const WithAction: Story = {
  args: {
    actions: (
      <Button variant="solid" icon={PlusIcon} onClick={fn()}>
        Add service
      </Button>
    ),
  },
}

/** Nothing to do but wait. */
export const DescriptionOnly: Story = {
  args: { title: 'No events yet', description: 'Connection changes show up here as they happen.' },
}

export const TitleOnly: Story = { args: { title: 'No devices found', description: undefined } }

/** Can't fill until the user acts outside Rove: a lock over the rows. */
export const Locked: Story = {
  args: { isLocked: true, title: 'Needs administrator access', description: 'Restart Rove as admin to see this.' },
}

/** An extra note the actions add once pressed, announced as it appears. */
export const WithNote: Story = {
  args: {
    title: 'No interfaces found',
    description: 'Rove found no network adapters.',
    actions: <RetryWithNote />,
  },
}

function RetryWithNote() {
  const [hasRetried, setHasRetried] = useState(false)
  return (
    <div className="flex flex-col items-center gap-8">
      <Button icon={RefreshIcon} onClick={() => setHasRetried(true)}>
        Try again
      </Button>
      {hasRetried && (
        <EmptyStateDescription role="status">Still nothing. Check the adapter is on.</EmptyStateDescription>
      )}
    </div>
  )
}

/** Each kind side by side. */
export const AllStates: Story = {
  render: () => (
    <div className="grid w-[740px] grid-cols-2 gap-12">
      <div className="flex h-[280px]">
        <EmptyState
          title="No services yet"
          description="Add one to see whether it's up."
          actions={
            <Button variant="solid" icon={PlusIcon}>
              Add service
            </Button>
          }
        />
      </div>
      <div className="flex h-[280px]">
        <EmptyState isLocked title="Needs administrator access" description="Restart Rove as admin to see this." />
      </div>
      <div className="flex h-[280px]">
        <EmptyState title="No events yet" description="Connection changes show up here as they happen." />
      </div>
      <div className="flex h-[280px]">
        <EmptyState title="No devices found" />
      </div>
    </div>
  ),
}
