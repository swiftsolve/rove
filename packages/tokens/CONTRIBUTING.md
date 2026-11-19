# Contributing

Tokens flow one way: designed in Figma, exported into this package, built, and used by Rove's library in the same commit, then released to npm for the sites that install them. Every change starts in Figma. Coding agents follow the same steps in the [`update-tokens` skill](../../.claude/skills/update-tokens/SKILL.md).

## Set up

The package is one of the Rove monorepo's workspaces. From the repo root, with Node 24 (`.nvmrc`):

```bash
nvm use 24
pnpm install
```

`pnpm install` builds the tokens and turns on the repo's git hooks. Run the package's own scripts from the root as `pnpm tokens <script>`. The scripts are TypeScript, which Node runs directly. `pnpm tokens typecheck` is what checks their types.

## Update the tokens

A change is done once it's exported, built and committed with the code that uses it, and `figma:check` finds no difference between Figma and the repo.

1. **Change it in Figma.** Edit the variables, text styles or `Shadow/*` effect styles. A new token takes its siblings' collection, modes, scopes and code syntax, and a description.
2. **Export it** to `src/figma/variables.json`, `text-styles.json` and `effect-styles.json`. Use either of these:
   - **The plugin** in `figma-plugin/`. In Figma desktop, go to Plugins → Development → Import plugin from manifest, then click **Export**.
   - **The Figma MCP.** Run `pnpm tokens figma:export`, run the script it prints through `use_figma`, then `pnpm tokens figma:save <result.json>` with an absolute path, as the script runs in this folder.
3. **Check it** with the root's `pnpm check`, which builds the tokens, checks them, and checks Rove against them. It builds, so look at `dist/tokens.css` too. The build stops if a token has no description, if a variable's code syntax doesn't match its name, or if a DTCG reference doesn't resolve. It rewrites `DESIGN.md`'s front matter, so commit that with the change.
4. **Compare with Figma.** The plugin's **Check** tab, or `pnpm tokens figma:check`, lists every difference in values, code syntax, descriptions, scopes, text styles and shadows. A difference means one of two things:
   - The repo is behind Figma: export again.
   - The repo was edited directly: undo the edit, and make the change in Figma.
5. **Commit** the change, with any code in Rove it renames or adds a use for, and resync the sites with Rove's `resync-sites` skill.

**Only what Figma can't hold** is edited here, in `src/code-tokens.json`: the font stacks and the focus expressions. Check and commit it as above. `src/figma/*.json` changes only by export, since the next export undoes a direct edit.

## Release

Rove uses the tokens from this folder, so it needs no release. A release puts them on npm for the sites that install them (nabilr.com and rove.swiftsolve.net). Changes collect on `master` and go out together, when those need them.

1. **Stamp the Figma cover.** On the `COVER` page, set **Version** to the version you're about to release and **Updated** to today's date (`27 Oct 2026`). Figma's API can't edit canvas text on this plan, so edit them in Figma, or have an agent do it through the Figma connection.
2. **Bump, commit and tag** in one step, then push both:

   ```bash
   pnpm tokens release minor
   ```

   ```bash
   git push origin master tokens-v<version>
   ```

   The tag is `tokens-v<version>`, since Rove's app releases on `v*` tags. Pick the bump by what a site sees:

   | Bump | When |
   | --- | --- |
   | `patch` | No CSS variable is added, removed or renamed |
   | `minor` | A new token |
   | `major` | A token is renamed or removed |

3. **The tag runs the publish-tokens workflow.** It builds, typechecks and tests the tokens and publishes to [npm](https://www.npmjs.com/package/@swiftsolve/rove-tokens) only if that passes, through npm trusted publishing. `pnpm dlx npm@11 trust list @swiftsolve/rove-tokens` shows the link to `publish-tokens.yml`. If the workflow fails to publish, `pnpm publish` from this folder works too.

## Scripts

| Script | What it does |
| --- | --- |
Each runs from the repo root as `pnpm tokens <script>`. The root's `pnpm check` runs the build, typecheck and test through turbo, after which the library's checks run against the new build, and lints this folder with the rest of the repo.

| Script | What it does |
| --- | --- |
| `build` | Figma export → DTCG → `tokens.css`, `text-styles.css`, `tailwind-theme.css` and `DESIGN.md`'s front matter. `pnpm install` and `pnpm publish` run it too. |
| `typecheck` | `tsc` over the scripts and the plugin's test. |
| `test` | The Figma plugin's test (Export and Check against a stand-in file made from the repo), then the WCAG AA contrast check and the DESIGN.md format check on the build. |
| `figma:export` | Prints a script for the Figma MCP's `use_figma` that exports the file. `figma:save <result.json>` writes its result into `src/figma/`. |
| `figma:check` | Prints a script for `use_figma` that lists every difference between the Figma file and the repo. Add a tag or commit to check against it instead of the working tree. |
| `release <bump>` | Bumps the version (`patch`, `minor` or `major`), then commits `package.json` as `chore(tokens): release v<version>` and tags it `tokens-v<version>`. Release has the steps. |
| `storybook` | The Tokens Storybook on <http://localhost:6007>. Its Theme menu switches Dark and Light. `build:storybook` writes a static copy to `storybook-static/`. |

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
| `scripts/tokens/build.ts` | `build`: runs the steps below and writes everything to `dist/`, where `package.json`'s `exports` points the import paths. |
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
| `scripts/release.ts` | `release <bump>`: bumps, commits and tags a release. |
| `eslint.config.js`, `.prettierrc.json` | The package's own lint and format rules, which the root's ESLint and Prettier pick up for files here. |
| `AGENTS.md` | The rules for coding agents. The procedure is Rove's `update-tokens` skill, and the git hooks, Claude Code hooks and CI (`publish-tokens.yml` among them) are Rove's, at the repo root. |
| `docs/` | [Using the tokens](docs/using-the-tokens.md), the [rationale](docs/rationale.md) for the values, and the decision records in `adr/`. |
