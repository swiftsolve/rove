import path from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  build: {
    outDir: 'dist',
  },
  css: {
    modules: {
      // `.row-name` in a .module.css file is `styles.rowName` in code.
      localsConvention: 'camelCaseOnly',
      // Readable in devtools: `ServicesView-module_row_a1b2c`.
      generateScopedName: '[name]_[local]_[hash:base64:5]',
    },
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
