import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // Honor a harness-assigned PORT (e.g. the preview dev server) when present;
    // `tauri:dev` sets no PORT and keeps the 5173 that tauri.conf expects.
    port: Number(process.env.PORT) || 5173,
    strictPort: true,
    watch: {
      // The Rust build output isn't source; watching it exhausts inotify.
      ignored: ['**/target/**', '**/src-tauri/target/**'],
    },
  },
})
