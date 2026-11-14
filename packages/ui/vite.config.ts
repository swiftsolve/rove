import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// What Storybook and the stories' tests build with: React and Tailwind. The
// introduction's app specimens add the app's `@/` alias, in .storybook/main.ts.
export default defineConfig({
  plugins: [react(), tailwindcss()],
})
