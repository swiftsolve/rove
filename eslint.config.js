import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

const UI_INTERNALS = {
  group: ['@/ui/**', '**/ui/*/**'],
  message: "Import the UI library from '@/ui', its public entry.",
}
const CONTEXT_OBJECTS = {
  group: ['**/context/*-context'],
  message: 'Read a context through its hook (useTheme(), useNetwork()…), not useContext.',
}
const APP_CODE = {
  group: ['@/**'],
  message: 'The UI library imports only itself (relative paths) and packages; pass app values in as props.',
}

export default tseslint.config(
  // The Rust backend and build outputs are not ours to lint.
  // .claude holds agent worktrees: other checkouts, not this one's code.
  { ignores: ['dist', 'storybook-static', 'src-tauri', 'crates', 'target', '.claude'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    // Tooling scripts run under Node, so they get Node's globals — plus the
    // browser ones, because a script driving a page (see screenshots.mjs) ships
    // callbacks that are serialized and run inside it.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        localStorage: 'readonly',
        window: 'readonly',
        document: 'readonly',
        PopStateEvent: 'readonly',
      },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // Match tsconfig's noUnusedLocals: underscore-prefixed names are
      // deliberate placeholders (e.g. destructuring to drop a field).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // The React-Compiler-era hooks rules (refs, set-state-in-effect, purity)
      // stay at their default `error`. Latest-value refs go through
      // `useLatestRef`, and text that ages reads the clock through `useNow`.
    },
  },
  // Import boundaries. ESLint doesn't merge one rule's options across blocks
  // (the last block that matches a file wins), so each block lists every
  // pattern that applies to its files.
  {
    // Outside the library, the UI comes through its one public entry.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/ui/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: [UI_INTERNALS] }] },
  },
  {
    // A context object is read only through its hook (useTheme, useNetwork…),
    // which also fails loudly outside the provider. Its provider and hook are
    // the only code that imports it.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/ui/**', 'src/**/context/**', 'src/**/hooks/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: [UI_INTERNALS, CONTEXT_OBJECTS] }] },
  },
  {
    // The library knows nothing about the app: no screens, no data, no bridge.
    // It follows the same context rule inside itself.
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', { patterns: [APP_CODE, CONTEXT_OBJECTS] }] },
  },
  {
    files: ['src/ui/**/context/**', 'src/ui/**/hooks/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: [APP_CODE] }] },
  },
  {
    // Every button outside the library is one of its components (Button,
    // IconButton, ListRow, StretchedButton…), so focus, disabled and loading
    // behave the same everywhere.
    files: ['src/**/*.tsx'],
    // Tests build their own harnesses.
    ignores: ['src/ui/**', 'src/**/*.test.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXOpeningElement[name.name='button']",
          message: 'Use a button from @/ui (Button, IconButton, ListRow, StretchedButton…), not a raw <button>.',
        },
      ],
    },
  },
)
