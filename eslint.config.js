import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // The Rust backend and build outputs are not ours to lint.
  { ignores: ['dist', 'src-tauri', 'crates', 'target'] },
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
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        fetch: 'readonly',
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
)
