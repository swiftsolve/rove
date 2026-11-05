import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import globals from 'globals'

// ── Doc copy ───────────────────────────────────────────────────────────────

// Copy never punctuates with an em dash: two short sentences read better. The
// lookahead leaves a lone dash, a table's empty cell, alone.
const NO_EM_DASH_MESSAGE = 'No em dash in copy: write two short sentences or rephrase.'
const NO_EM_DASH = [
  'Literal[value=/(?=[\\s\\S]*[^\\s—])[\\s\\S]*—/]',
  'TemplateElement[value.raw=/—/]',
  'JSXText[value=/(?=[\\s\\S]*[^\\s—])[\\s\\S]*—/]',
].map((selector) => ({ selector, message: NO_EM_DASH_MESSAGE }))

export default [
  // ── Not ours to lint ─────────────────────────────────────────────────────
  // Build outputs, and .claude's agent worktrees (other checkouts).
  { ignores: ['dist', 'storybook-static', '.claude'] },

  // ── Presets ──────────────────────────────────────────────────────────────
  js.configs.recommended,

  // ── Every file ───────────────────────────────────────────────────────────
  {
    // Packages, then relative paths; each group alphabetical. `--fix` sorts them.
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: { 'simple-import-sort/imports': 'error' },
  },

  // ── Node: the build, the checks, this config ──────────────────────────────
  {
    files: ['scripts/**/*.mjs', '*.js'],
    languageOptions: { globals: globals.node },
  },

  // ── The Storybook: React in the browser ──────────────────────────────────
  {
    files: ['stories/**/*.{js,jsx}', '.storybook/**/*.{js,jsx}'],
    ...reactHooks.configs.flat.recommended,
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    // The pages are doc copy.
    files: ['stories/**/*.{js,jsx}'],
    rules: { 'no-restricted-syntax': ['error', ...NO_EM_DASH] },
  },

  // ── The Figma plugin: Figma's sandbox ────────────────────────────────────
  {
    files: ['figma-plugin/**/*.js'],
    languageOptions: { sourceType: 'script', globals: { figma: 'readonly', __html__: 'readonly' } },
  },
]
