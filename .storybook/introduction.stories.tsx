import type { Meta, StoryObj } from '@storybook/react-vite'

import { Introduction } from './introduction'

// The library's front page. Its Docs page is the page itself; the one story
// stays out of the sidebar and exists so the page runs through axe like every
// other story.
const meta = {
  title: 'Introduction',
  component: Introduction,
  parameters: { layout: 'fullscreen', docs: { page: Introduction } },
} satisfies Meta<typeof Introduction>

export default meta

export const Page: StoryObj<typeof meta> = { tags: ['!dev'] }
