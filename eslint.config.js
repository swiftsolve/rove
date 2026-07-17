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
        localStorage: 'readonly',
        window: 'readonly',
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
      // React-Compiler-era rules. The codebase deliberately mirrors the latest
      // props/state into refs during render (see useBackendResource), syncs
      // state in a few effects (Tooltip, useNavigation), and reads the wall
      // clock during render for text that ages — "3m ago", "Down for …" — so it
      // advances on the re-renders that already happen rather than on a timer
      // per screen (format.ts, EventsView, DevicesView, ServicesTimelinePage).
      // Established patterns that predate the compiler. Keep them visible as
      // warnings rather than rewriting working code; revisit if the app ever
      // adopts the compiler.
      //
      // `purity` only ever fires on the clock read that sits directly in a
      // component body; the identical reads inside render-called helpers are
      // past what it traces. Downgrading it is what keeps that one honest —
      // hoisting it into a helper would silence the rule and change nothing.
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
)
