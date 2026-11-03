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

// Like the import patterns, `no-restricted-syntax` doesn't merge across
// blocks, so the raw-button block repeats these.
const NO_READONLY_MESSAGE = 'No readonly: use the plain type (T[], Map, Set, Record).'
const NO_READONLY = [
  "TSTypeOperator[operator='readonly']",
  'TSPropertySignature[readonly=true]',
  'TSIndexSignature[readonly=true]',
  'PropertyDefinition[readonly=true]',
  'TSParameterProperty[readonly=true]',
  'TSTypeReference[typeName.name=/^Readonly(Array|Map|Set)?$/]',
].map((selector) => ({ selector, message: NO_READONLY_MESSAGE }))
// A typed dot sits on the baseline and scales with the font, so it never
// matches the designed one.
const NO_DOT_GLYPH_MESSAGE = 'Separate inline items with DotSeparator or InlineMeta from @/ui, not a typed "·" or "•".'
const NO_DOT_GLYPH = ['Literal[value=/[·•]/]', 'TemplateElement[value.raw=/[·•]/]', 'JSXText[value=/[·•]/]'].map(
  (selector) => ({ selector, message: NO_DOT_GLYPH_MESSAGE }),
)
const CODE_STYLE = [...NO_READONLY, ...NO_DOT_GLYPH]

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
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // The React-Compiler-era hooks rules (refs, set-state-in-effect, purity)
      // stay at their default `error`. Latest-value refs go through
      // `useLatestRef`, and text that ages reads the clock through `useNow`.
      'no-restricted-syntax': ['error', ...CODE_STYLE],
    },
  },
  {
    // A boolean reads as a yes/no question: isOpen, hasGradient, canRunTest,
    // shouldShowLabel, wasDeclined, or a verb phrase (needsNetworkInfo,
    // meetsRequirements). It needs types, so it covers src, as tsconfig does.
    // Left alone: object literal keys and destructured names (the DOM's and
    // libraries' own options), `aria-*` and `data-*` attributes, and a
    // generic stored `value` or `fallback` (useSetting). A hook still starts
    // with `use`.
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
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
    // IconButton, ListRow, StretchedLink…), so focus, disabled and loading
    // behave the same everywhere.
    files: ['src/**/*.tsx'],
    // Tests build their own harnesses.
    ignores: ['src/ui/**', 'src/**/*.test.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXOpeningElement[name.name='button']",
          message: 'Use a button from @/ui (Button, IconButton, ListRow, StretchedLink…), not a raw <button>.',
        },
        ...CODE_STYLE,
      ],
    },
  },
)
