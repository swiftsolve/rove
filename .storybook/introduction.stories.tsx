import type { Meta, StoryObj } from '@storybook/react-vite'

import { Introduction as IntroductionPage } from './introduction'

// The library's front page, a full-width story as Rove Tokens' Introduction is,
// so it takes the whole canvas instead of a Docs page's column. It runs through
// axe like every other story.
const meta = {
  title: 'Introduction',
  component: IntroductionPage,
  tags: ['!autodocs'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof IntroductionPage>

export default meta

export const Introduction: StoryObj<typeof meta> = {}
