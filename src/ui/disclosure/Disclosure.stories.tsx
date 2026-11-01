import { useState, type ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { Card } from '../card/Card'
import { DataList, DataRow } from '../data-list/DataList'
import { ChevronDownIcon } from '../icons/Icons'
import { Disclosure, DisclosurePanel, DisclosureTrigger } from './Disclosure'

type DisclosureArgs = ComponentProps<typeof Disclosure>

const TRIGGER = [
  'group flex w-full items-center justify-between gap-12 text-left',
  'h-(--card-header-height) px-(--card-header-padding-x) text-heading-small',
  'transition-[background] duration-(--duration-fast) ease-in-out hover:bg-fill-faint',
].join(' ')

const CHEVRON = [
  'shrink-0 text-tertiary transition-transform duration-(--duration-normal) ease-out',
  'group-data-panel-open:transform-[rotate(180deg)]',
].join(' ')

/** The connection card's details: a trigger row and the rows it shows. */
function details(isAnimated: boolean): JSX.Element {
  return (
    <>
      <DisclosureTrigger className={TRIGGER}>
        Connection details
        <ChevronDownIcon size={14} className={CHEVRON} />
      </DisclosureTrigger>
      <DisclosurePanel isAnimated={isAnimated}>
        <div className="px-(--card-body-padding) pb-(--card-body-padding)">
          <DataList>
            <DataRow label="Address" value="192.168.1.20" />
            <DataRow label="Gateway" value="192.168.1.1" />
            <DataRow label="DNS" value="1.1.1.1" />
          </DataList>
        </div>
      </DisclosurePanel>
    </>
  )
}

/** Holds the open state, so the trigger works in the canvas. */
function ControlledDisclosure({ isOpen: isInitiallyOpen, onOpenChange, ...props }: DisclosureArgs): JSX.Element {
  const [isOpen, setIsOpen] = useState(isInitiallyOpen)
  return (
    <Card as="div" className="w-[360px]">
      <Disclosure
        {...props}
        isOpen={isOpen}
        onOpenChange={(isNowOpen) => {
          setIsOpen(isNowOpen)
          onOpenChange(isNowOpen)
        }}
      />
    </Card>
  )
}

const meta = {
  title: 'Containers/Disclosure',
  component: Disclosure,
  subcomponents: { DisclosureTrigger, DisclosurePanel },
  args: { isOpen: false, onOpenChange: fn(), hasFocusFrame: false, children: details(false) },
  argTypes: {
    as: { control: 'inline-radio', options: ['div', 'li'] },
    children: { control: false },
  },
  // Keyed, so changing isOpen in the controls starts it afresh.
  render: (args) => <ControlledDisclosure key={String(args.isOpen)} {...args} />,
} satisfies Meta<typeof Disclosure>

export default meta
type Story = StoryObj<typeof meta>

export const Closed: Story = {}

export const Open: Story = { args: { isOpen: true } }

/** The panel grows and shrinks to its height. */
export const Animated: Story = { args: { children: details(true) } }

/** Keyboard focus rings the whole disclosure, for a trigger that spans a card's header. Tab to it. */
export const FocusFrame: Story = { args: { hasFocusFrame: true, isOpen: true, className: 'rounded-[inherit]' } }

/** Closed, open and framed together. */
export const AllStates: Story = {
  render: (args) => (
    <div className="flex flex-col gap-12">
      <ControlledDisclosure {...args} />
      <ControlledDisclosure {...args} isOpen />
      <ControlledDisclosure {...args} isOpen hasFocusFrame className="rounded-[inherit]">
        {details(true)}
      </ControlledDisclosure>
    </div>
  ),
}
