import js from '@eslint/js'
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments'
import jsxA11y from 'eslint-plugin-jsx-a11y-x'
import reactHooks from 'eslint-plugin-react-hooks'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import tseslint from 'typescript-eslint'

import comments from './scripts/eslint/comments.mjs'

// ── Import boundaries ──────────────────────────────────────────────────────

const UI_INTERNALS = {
  group: ['@/ui/**', '**/ui/*/**'],
  message: "Import the UI library from '@/ui', its public entry.",
}
const CONTEXT_OBJECTS = {
  group: ['**/context/*-context'],
  message: 'Read a context through its hook (useTheme(), useNetwork()…), not use().',
}
const APP_CODE = {
  group: ['@/**'],
  message: 'The UI library imports only itself (relative paths) and packages; pass app values in as props.',
}

// ── Code style ─────────────────────────────────────────────────────────────
// Like the import patterns, `no-restricted-syntax` doesn't merge across
// blocks, so the raw-button block repeats these.

// A typed dot sits on the baseline and scales with the font, so it never
// matches the designed one.
const NO_DOT_GLYPH_MESSAGE = 'Separate inline items with DotSeparator or InlineMeta from @/ui, not a typed "·" or "•".'
const NO_DOT_GLYPH = ['Literal[value=/[·•]/]', 'TemplateElement[value.raw=/[·•]/]', 'JSXText[value=/[·•]/]'].map(
  (selector) => ({ selector, message: NO_DOT_GLYPH_MESSAGE }),
)
// A missing value is a drawn bar that scales with its line, so a lone typed
// dash standing in for one is out too.
const NO_DASH_VALUE_MESSAGE = 'Show a missing value with NoValue from @/ui, not a typed "—".'
const NO_DASH_VALUE = ['Literal[value=/^\\s*—\\s*$/]', 'JSXText[value=/^\\s*—\\s*$/]'].map((selector) => ({
  selector,
  message: NO_DASH_VALUE_MESSAGE,
}))
// Copy never punctuates with an em dash: two short sentences read better. The
// lookahead leaves a lone dash to the rule above.
const NO_EM_DASH_MESSAGE = 'No em dash in copy: write two short sentences or rephrase.'
const NO_EM_DASH = [
  'Literal[value=/(?=[\\s\\S]*[^\\s—])[\\s\\S]*—/]',
  'TemplateElement[value.raw=/—/]',
  'JSXText[value=/(?=[\\s\\S]*[^\\s—])[\\s\\S]*—/]',
].map((selector) => ({ selector, message: NO_EM_DASH_MESSAGE }))
// An event handler is onX as a local too, the name its prop takes.
const NO_HANDLE_PREFIX_MESSAGE = 'Name an event handler onX (onClick), as a local and as a prop, not handleX.'
const NO_HANDLE_PREFIX = [
  'VariableDeclarator[id.name=/^handle[A-Z]/]',
  'FunctionDeclaration[id.name=/^handle[A-Z]/]',
].map((selector) => ({ selector, message: NO_HANDLE_PREFIX_MESSAGE }))
const CODE_STYLE = [...NO_DOT_GLYPH, ...NO_DASH_VALUE, ...NO_EM_DASH, ...NO_HANDLE_PREFIX]

// ── Boolean names ──────────────────────────────────────────────────────────

const BOOLEAN_PREFIXES = [
  'is',
  'are',
  'has',
  'have',
  'can',
  'should',
  'was',
  'were',
  'did',
  'does',
  'will',
  'needs',
  'meets',
  'may',
]
const BOOLEAN_EXEMPT = '^(_|aria-|data-)|^(value|fallback)$'
// The scripts have no types for naming-convention, so they catch a boolean by
// its shape: a variable set to a comparison or a `!`.
const NOT_A_QUESTION = `:not([id.name=/^(${BOOLEAN_PREFIXES.join('|')})[A-Z0-9]|^(${BOOLEAN_PREFIXES.join('|').toUpperCase()})_/])`
const UNTYPED_BOOLEAN_NAME = [
  `VariableDeclarator[init.type="BinaryExpression"][init.operator=/^(===|!==|==|!=|<|>|<=|>=|in|instanceof)$/]${NOT_A_QUESTION}`,
  `VariableDeclarator[init.type="UnaryExpression"][init.operator="!"]${NOT_A_QUESTION}`,
].map((selector) => ({ selector, message: `Name a boolean as a question: ${BOOLEAN_PREFIXES.join('/')} + a noun.` }))

export default tseslint.config(
  // ── Not ours to lint ─────────────────────────────────────────────────────
  // The Rust backend and build outputs, and .claude's agent worktrees (other
  // checkouts, not this one's code).
  { ignores: ['dist', 'storybook-static', 'src-tauri', 'crates', 'target', '.claude'] },

  // ── Presets ──────────────────────────────────────────────────────────────
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // The app's code has type information, so it gets the strict, type-aware sets.
  ...[...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked].map((config) => ({
    ...config,
    files: ['src/**/*.{ts,tsx}'],
  })),
  reactHooks.configs.flat.recommended,
  { ...jsxA11y.configs.strict, files: ['src/**/*.tsx'] },

  // ── Every file ───────────────────────────────────────────────────────────
  {
    // Packages, then the app's own modules (@/…), then relative paths; each
    // group alphabetical. `--fix` sorts them.
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: { 'simple-import-sort/imports': 'error' },
  },
  {
    // Comments: short (scripts/eslint/comments.mjs), and a lint exception says
    // why.
    plugins: { comments, 'eslint-comments': eslintComments },
    rules: {
      'comments/max-lines': 'error',
      'eslint-comments/require-description': 'error',
      // Named steps over dense expressions: a third case is an if or a lookup.
      'no-nested-ternary': 'error',
    },
  },

  // ── TypeScript ───────────────────────────────────────────────────────────
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // Match tsconfig's noUnusedLocals: underscore-prefixed names are
      // deliberate placeholders (e.g. destructuring to drop a field).
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // The React-Compiler-era hooks rules (refs, set-state-in-effect, purity)
      // stay at their default `error`. Latest-value refs go through
      // `useLatestRef`, and text that ages reads the clock through `useNow`.
      'no-restricted-syntax': ['error', ...CODE_STYLE],
    },
  },

  // ── The app's source ─────────────────────────────────────────────────────
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // Where the strict sets fight ordinary React: numbers read fine in a
      // template, `onClick={() => setOpen(true)}` is the idiom, and props are
      // `type`s, not interfaces.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      // `|| null` turns an empty string into "no value", and `|| undefined`
      // drops a false attribute: both on purpose.
      '@typescript-eslint/prefer-nullish-coalescing': ['error', { ignorePrimitives: { string: true, boolean: true } }],
      // A no-op callback is an empty arrow function.
      '@typescript-eslint/no-empty-function': ['error', { allow: ['arrowFunctions'] }],
      // A rejection passes on whatever the inner promise rejected with.
      '@typescript-eslint/prefer-promise-reject-errors': ['error', { allowThrowingUnknown: true }],
      // A boolean reads as a yes/no question (isOpen, canRunTest) or a verb
      // phrase (needsNetworkInfo). It needs types, so it covers src. Left alone:
      // object keys and names taken from an object by destructuring (other
      // APIs' options); array destructuring, like a useState pair, is covered.
      // Also `aria-*` and `data-*`, and useSetting's generic `value` and `fallback`.
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: ['variable', 'parameter', 'typeProperty', 'classProperty', 'accessor'],
          types: ['boolean'],
          format: null,
          prefix: BOOLEAN_PREFIXES,
          filter: { regex: BOOLEAN_EXEMPT, match: false },
        },
        {
          // A module constant: IS_MAC.
          selector: 'variable',
          modifiers: ['const'],
          types: ['boolean'],
          format: ['UPPER_CASE'],
          prefix: BOOLEAN_PREFIXES.map((prefix) => `${prefix.toUpperCase()}_`),
          filter: { regex: '^[A-Z][A-Z0-9_]*$', match: true },
        },
        { selector: 'variable', modifiers: ['destructured'], types: ['boolean'], format: null },
      ],
    },
  },
  {
    // invoke<void> types a Tauri command that returns nothing.
    files: ['src/bridge/**'],
    rules: { '@typescript-eslint/no-invalid-void-type': 'off' },
  },
  {
    // The dev mock implements the async bridge with synchronous bodies, and its
    // flags flip inside callbacks that narrowing can't see.
    files: ['src/bridge/mock-network-api.ts'],
    rules: {
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
    },
  },
  {
    files: ['src/**/*.tsx'],
    // Safari drops a list's role once its markers are styled away, so a
    // styled <ul> says role="list" on purpose.
    rules: { 'jsx-a11y-x/no-redundant-roles': ['error', { ul: ['list'] }] },
  },

  // ── Import boundaries ────────────────────────────────────────────────────
  // ESLint doesn't merge one rule's options across blocks (the last block that
  // matches a file wins), so each block lists every pattern that applies to
  // its files.
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

  // ── Library components only ──────────────────────────────────────────────
  {
    // Every button outside the library is one of its components (Button,
    // IconButton, Link, ListRow, StretchedLink), so focus, disabled and
    // loading behave the same everywhere.
    files: ['src/**/*.tsx'],
    // Tests build their own harnesses.
    ignores: ['src/ui/**', 'src/**/*.test.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXOpeningElement[name.name='button']",
          message: 'Use a button from @/ui (Button, IconButton, Link, ListRow, StretchedLink), not a raw <button>.',
        },
        ...CODE_STYLE,
      ],
    },
  },

  // ── Tooling scripts ──────────────────────────────────────────────────────
  {
    // Tooling scripts run under Node, so they get Node's globals, plus the
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
    rules: { 'no-restricted-syntax': ['error', ...NO_HANDLE_PREFIX, ...UNTYPED_BOOLEAN_NAME] },
  },
)
