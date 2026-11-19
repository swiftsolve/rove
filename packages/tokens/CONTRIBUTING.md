# Contributing

Tokens flow one way: designed in Figma, exported into this repo, built, released to npm and taken up by Rove. Every change starts in Figma. Coding agents follow the same steps in the [`update-tokens` skill](.claude/skills/update-tokens/SKILL.md).

## Set up

You need Node 24 (`.nvmrc`):

```bash
nvm use 24
pnpm install
```

`pnpm install` builds the tokens and turns on the git hooks. The scripts are TypeScript, which Node runs directly. `pnpm typecheck` is what checks their types.

## Update the tokens

A change is done once it's exported, built, committed and released, and `figma:check` finds no difference between Figma and the repo.

1. **Change it in Figma.** Edit the variables, text styles or `Shadow/*` effect styles. A new token takes its siblings' collection, modes, scopes and code syntax, and a description.
2. **Export it** to `src/figma/variables.json`, `text-styles.json` and `effect-styles.json`. Use either of these:
   - **The plugin** in `figma-plugin/`. In Figma desktop, go to Plugins → Development → Import plugin from manifest, then click **Export**.
   - **The Figma MCP.** Run `pnpm figma:export`, run the script it prints through `use_figma`, then `pnpm figma:save <result.json>`.
3. **Check it** with `pnpm check`. It builds, so look at `dist/tokens.css` too. The build stops if a token has no description, if a variable's code syntax doesn't match its name, or if a DTCG reference doesn't resolve. It rewrites `DESIGN.md`'s front matter, so commit that with the change.
4. **Compare with Figma.** The plugin's **Check** tab, or `pnpm figma:check`, lists every difference in values, code syntax, descriptions, scopes, text styles and shadows. A difference means one of two things:
   - The repo is behind Figma: export again.
   - The repo was edited directly: undo the edit, and make the change in Figma.
5. **Commit** the change.

**Only what Figma can't hold** is edited here, in `src/code-tokens.json`: the font stacks and the focus expressions. Check and commit it as above. `src/figma/*.json` changes only by export, since the next export undoes a direct edit.

## Release

Changes collect on `main` and go out together, when Rove needs them.

1. **Stamp the Figma cover.** On the `COVER` page, set **Version** to the version you're about to release and **Updated** to today's date (`27 Oct 2026`). Figma's API can't edit canvas text on this plan, so edit them in Figma, or have an agent do it through the Figma connection.
2. **Bump, commit and tag** in one step, then push both:

   ```bash
   pnpm release minor
   ```

   ```bash
   git push --follow-tags
   ```

   Pick the bump by what Rove sees:

   | Bump | When |
   | --- | --- |
   | `patch` | No CSS variable is added, removed or renamed |
   | `minor` | A new token |
   | `major` | A token is renamed or removed |

3. **The tag runs the Release workflow.** It runs `pnpm check` and publishes to [npm](https://www.npmjs.com/package/@swiftsolve/rove-tokens) only if that passes, through npm trusted publishing. `pnpm dlx npm@11 trust list @swiftsolve/rove-tokens` shows the link to `publish.yml`. If the workflow fails to publish, `pnpm publish` from a checkout works too.
4. **Take it up in Rove** once npm serves it: `pnpm --filter @swiftsolve/rove-ui add @swiftsolve/rove-tokens@<version>`, run Rove's `pnpm check`, and commit. Then resync the sites that embed Rove, with Rove's `resync-sites` skill.

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm build` | Figma export → DTCG → `tokens.css`, `text-styles.css`, `tailwind-theme.css` and `DESIGN.md`'s front matter. `pnpm install` and `pnpm publish` run it too. |
| `pnpm check` | Builds, typechecks and lints, then runs the contrast and DESIGN.md format checks and `pnpm test`. Run it before every commit. CI runs it on every release tag, before publishing. |
| `pnpm typecheck` | `tsc` over the scripts and the plugin's test. |
| `pnpm test` | The Figma plugin's test: Export and Check against a stand-in file made from the repo. |
| `pnpm lint` | ESLint and Prettier over the repo. `pnpm format` fixes what Prettier reports. |
| `pnpm figma:export` | Prints a script for the Figma MCP's `use_figma` that exports the file. `figma:save <result.json>` writes its result into `src/figma/`. |
| `pnpm figma:check` | Prints a script for `use_figma` that lists every difference between the Figma file and the repo. Add a tag or commit to check against it instead of the working tree. |
| `pnpm release <bump>` | Bumps the version (`patch`, `minor` or `major`), then commits and tags it as `chore: release v<version>`. Release has the steps. |
| `pnpm storybook` | The Tokens Storybook on <http://localhost:6007>. Its Theme menu switches Dark and Light. `build:storybook` writes a static copy to `storybook-static/`. |

## What's where

### Sources

| Path | What |
| --- | --- |
| `src/figma/variables.json` | The raw Figma export. Every variable with a Web code syntax becomes that CSS variable. |
| `src/figma/text-styles.json` | The local text styles: font, size, weight, line height, letter spacing, text case (when set) and the variables bound to them. Each becomes a `--type-*` group. |
| `src/figma/effect-styles.json` | The `Shadow/*` effect styles: each layer's offset, blur and spread, and the colour variable bound to it. Each becomes a `--shadow-*` token. |
| `src/code-tokens.json` | What Figma can't hold: font stacks for the font-family variables, and CSS expressions built on variables (`--focus-outline`). `{figma/name}` pulls in a Figma value per theme. |
| `figma-plugin/` | Rove Tokens, the Figma plugin. **Export** writes the three exports. **Check** compares the file with the three files you choose from a checkout and lists every difference. It never writes to the file, and needs no network access. |
| `scripts/figma/use-figma.ts` | `figma:export` and `figma:check`: the plugin's own code, wrapped for the Figma MCP's `use_figma`, so an agent exports and checks the same way. |

### Build

| Path | What |
| --- | --- |
| `scripts/tokens/build.ts` | `pnpm build`: runs the steps below and writes everything to `dist/`, where `package.json`'s `exports` points the import paths. |
| `scripts/tokens/figma-to-dtcg.ts` | Figma export → the DTCG files in `dist/tokens/`, checking that every reference resolves in both themes. |
| `scripts/tokens/dtcg-to-css.ts` | DTCG → `tokens.css`, with Style Dictionary: Dark on `:root`, and on `:root.theme-light` only what differs in Light. |
| `scripts/tokens/dtcg-to-text-styles.ts` | DTCG text styles → `text-styles.css`: a `.type-<style>` class per style that reads its `--type-*` variables. |
| `scripts/tokens/tailwind-theme.ts` | Figma export → `tailwind-theme.css`: the Tailwind v4 `@theme` that maps each token to its utility, with Tailwind's defaults cleared. |
| `scripts/tokens/design-front-matter.ts` | Figma export and `tokens.css` → `DESIGN.md`'s front matter. The format's own groups come first, then Rove's (`EXTRA_GROUPS`), then `light`: every token whose value differs in Light. The build fails if a token fits no group. |
| `scripts/tokens/shared.ts`, `types.ts` | What the steps share: how to write a colour and name a text style, and the shapes of the Figma export and the DTCG files. |
| `DESIGN.md` | How to build Rove UI with the tokens. The build writes the front matter; the prose below it is edited directly. |

### Checks and tests

| Path | What |
| --- | --- |
| `scripts/checks/contrast.ts` | Measures every text and graphic colour on what DESIGN.md lets it sit on, in both themes, against WCAG 2.2 AA. |
| `scripts/checks/design-md-format.ts` | Runs Google's DESIGN.md linter and fails on any error or warning, except that the format's exports skip Rove's own groups. |
| `figma-plugin/code.test.ts` | `pnpm test`: runs the plugin against a stand-in Figma file made from the repo. Export must give back `src/figma/*.json`, and Check must find nothing, then each planted difference. |
| `tsconfig.json` | Types the scripts and the test for `pnpm typecheck`. Only syntax Node can erase is allowed. |

### Storybook

| Path | What |
| --- | --- |
| `.storybook/` | The Tokens Storybook's config, and the font files it bundles. |
| `stories/` | Its pages, one file per sidebar group, each with its own CSS. `tokens.js` reads the DTCG files, so a new build shows up without editing them. |

The README's How it works diagram is a capture of the Storybook Introduction's diagram, in each theme (`docs/assets/how-it-works-*.png`). Retake both when the diagram changes, with a margin around it.

### Repo

| Path | What |
| --- | --- |
| `.github/workflows/publish.yml` | On each release tag, runs `pnpm check`, then publishes that version to npm with trusted publishing, so the repo holds no npm token. Run it on demand from Actions to check `main`: it publishes only from a tag. |
| `scripts/hooks/git/` | Git hooks, on after `pnpm install`. `pre-commit` lints and format-checks the staged files, and `commit-msg` refuses an agent attribution line. |
| `scripts/hooks/claude/`, `.claude/settings.json` | Claude Code hooks: each edited file is formatted and linted, and commands that skip a hook or throw away work are refused. |
| `AGENTS.md`, `.claude/skills/` | The rules and procedures for coding agents. |
| `docs/` | [Using the tokens](docs/using-the-tokens.md), the [rationale](docs/rationale.md) for the values, and the decision records in `adr/`. |
