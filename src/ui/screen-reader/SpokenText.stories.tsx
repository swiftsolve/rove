import type { Meta, StoryObj } from '@storybook/react-vite'

import { type Guidance, GUIDANCE_TOC } from '../../../.storybook/docs-page'
import { SpokenText } from './SpokenText'

const meta = {
  title: 'Accessibility/SpokenText',
  component: SpokenText,
  args: { children: '≥ 25 Mbps', spoken: 'at least 25 Mbps' },
  parameters: {
    docs: { subtitle: 'Text that a screen reader says in plain words.', toc: GUIDANCE_TOC },
    guidance: {
      whenToUse: [
        'A value with a symbol a screen reader would read out: “≥ 25 Mbps”.',
        'A label with brackets or a slash: “TV / Media”.',
      ],
      whenNotToUse: [
        'Text only screen readers hear: a `sr-only` span.',
        'A status read out as it changes: use `ScreenReaderStatus`.',
      ],
      accessibility: {
        handledByComponent: ['The shown text is hidden from screen readers.', 'The spoken text is hidden on screen.'],
        handledByYourCode: ['Spoken text that says the same as the screen, in words.'],
      },
    } satisfies Guidance,
  },
} satisfies Meta<typeof SpokenText>

export default meta
type Story = StoryObj<typeof meta>

/** Shows “≥ 25 Mbps”; a screen reader says “at least 25 Mbps”. */
export const Default: Story = {}
