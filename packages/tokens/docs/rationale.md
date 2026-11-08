# Why the tokens are what they are

The reasons behind the token values. The values themselves live in Figma (and in `tokens.css`); this page doesn't repeat them, so it can't drift from them.

## Structure

- **Every colour lives once, in the Palette.** Color tokens point at Palette shades, and each shade is named by hue and darkness: `hue/N` has OKLCH lightness of about 100 − N/10, so `blue/450` is 55 (higher is darker).
- **Neutral is one even ramp.** Neutrals sit on 5-steps of OKLCH lightness, and the number says which: `neutral/N` has lightness 100 − N/10, so `neutral/850` is 15, white is `neutral/0` and black would be `neutral/1000`. The one exception is inset, which takes the half step between base and surface (`neutral/25`, `neutral/825`). They share one hue and one chroma curve, so the ramp reads as one family. The chroma stays under 0.007, so the grays read neutral with a hint of cool, not blue; dark shades show a tint most, so they carry the least. Only the steps a token uses are in the Palette. The hues keep their own shades, each tuned for its job.
- **A see-through shade sits with its base shade.** It takes the base's name plus `-a` and its opacity: `neutral/850-a10` is `neutral/850` at 10%, `blue/340-a14` is `blue/340` at 14%. Black only appears see-through (`neutral/1000-a22`), for dark-mode shadows and the scrim.
- **Solid shades are layers; see-through shades sit on one.** Backgrounds and text are solid, so they look the same whatever is behind them. Overlays, borders, shadows, the scrim and the accent's tints are see-through, so one value reads right on base, surface and popover alike; a solid grey would match only one of them. Light mode tints with `neutral/850` and Dark with white (`neutral/0`), which is why the Palette's second neutral row holds both.
- **CSS names follow Figma names.** `bg/base` is `--bg-base`, `border/default` is `--border-default`; the build refuses a code syntax that doesn't match.
- **Typography comes from the text styles, not variables.** Line heights and letter spacings live only in the styles; copying them into variables would give the type scale two sources that could drift apart.

## Surfaces and lines

- **Three backgrounds, named by role.** `bg/base` is the backdrop, `bg/surface` is content that sits on it, and `bg/inset` is sunk into a surface. The title bar and rail take `bg/chrome`, the inset shades, so the window's frame reads as one band with a card's details, apart from the backdrop. Tokens say what a colour is for, not which component uses it, so a new component picks from the same few.
- **They're half a ramp step apart.** Dark mode: base 15, inset 17.5, surface 20, hover 25. Light mode: base 95, inset 97.5, white surface, hover 90.
- **Hairlines** separate content inside a surface; the surfaces themselves are lifted by shadow.
- **Overlays flip with the theme:** white-on-dark in dark mode, near-black-on-light in light mode, so hovers, chips and tracks darken pale surfaces rather than disappearing on them.
- **Both overlay families share one set of strengths** (3, 5, 7, 16%), so a dark-mode token and its light-mode partner sit on the same steps. Light-mode hairlines take ink at 10%. The light-mode ink is `neutral/850`, so its overlays tint like the ramp, not navy. Light-mode shadows use the same ink; dark-mode shadows use black, since ink would be lighter than the backdrop.
- **Shadows give depth** instead of hard outlines; panels get a soft two-layer lift, menus and tooltips a deeper one.

## Text

- **`text/tertiary` is the quietest ramp step that still clears AA (4.5:1)**: on a hovered row in dark mode, and on the grey backdrop (not just the white cards) in light mode.
- **`text/accent` is for accent words**, on a surface or on `accent/muted` (a selected segment, a tinted button). Light mode's accent is 4.3:1 on the grey backdrop, and the tint lowers it further, so light mode uses the pressed accent to keep 4.5:1 (5.0:1 on the tint); dark mode's accent already clears it.

## Accent and solids

- **One blue, chosen against the other colours' jobs.** The accent marks the brand and what you act on: the mark, the active tab, solid buttons, links and the focus ring. Blue was the hue no other job claimed. Green, amber, orange and red say how good something is, so a teal or an orange accent would read as a verdict; upload is violet, so a violet accent would blur into it. Download is a lighter step of the same blue, so the main reading carries the brand. Blue also reads calm and technical, as a network tool should. A grey accent was calmer still, but left nothing that says "press here".
- **A violet-leaning blue at OKLCH hue 265.** In Dark `accent/default` (`#5b8cff`) sits at lightness 66, bright on the near-black backdrop; Light and the solids step down to lightness 55 (`#3a69d5`) for contrast, as below.
- **`accent/solid` sits a step darker than the accent.** The bright accent reads well as text but gives a white label only 3.2:1; the solid clears 4.5:1.
- **Solid hovers deepen rather than brighten:** any lighter solid would drop the white label below 4.5:1.
- **The negative reds** (negative, solid, solid hover) each step darker and duller, so they read as three reds rather than two. Both themes share the solid and hover, where white labels sit at 5.6:1 and 7.4:1.

## Status

- **One shade per status hue for icons, bars and dots.** In light mode each is the lightest shade of its hue that clears 3:1 (the bar for graphics) on every surface it sits on, including the 14% tints of icon tiles and timeline markers. Each is held at the most saturated it can be at that lightness (OKLCH chroma at the sRGB edge), so the colours read bright rather than dark or brown.
- **Green moves from the dark theme's mint toward pure green** in light mode, where the gamut has more room.
- **Red stays a step below the sRGB edge,** where it would turn neon beside the other hues. Its hue sits a touch toward orange: at 0° or below, a light red reads salmon or pink.
- **Status words need 4.5:1, which the light-mode icon shades miss (3.5–4.4:1).** `text/positive`, `text/warning` and `text/negative` are the same hues, darkened just enough to clear it on every surface, including the 14% tint of their own hue that a badge sits on. Dark mode uses the icon shades, which already pass.
- **The capability scale's in-between steps** (good, poor) follow the same rules, with their hues pulled apart from their neighbours (good is yellow-green, poor is orange) so the four levels stay distinct. Their words take darkened light-mode shades too (`lime/520`, `orange/500`).
- **`scripts/checks/contrast.mjs` measures every pair above** in both themes, so a shade under its target fails the build instead of waiting for review.

## Opacity

- **Tint strengths are shared** so a tinted tile or an unlit bar reads the same wherever it appears. They're percentages, for `color-mix()`.

## Spacing, radius and focus

- **One 2px spacing scale:** every gap, padding and margin is one of its steps. The few lengths off it are set by something outside spacing (an icon's ink, a border, an outside shape), and each says why. The nav rail and the content column share the `spacing/12` side inset, so the content sits as far from the window edge as the nav icons do.
- **Cards use one padding on every axis** (`--card-padding`), matching the gap the cards stack at, so they read as evenly inset.
- **`radius/md` is for the nav item and page-header chip,** a step rounder than `radius/sm`.
- **The focus ring is the same 1px accent line as the nav-flash highlight.** Controls get it outside their edge (`focus/offset`). Rows flush in a card draw it just inside (`--focus-inset`), square-cornered like the highlight.

## Type

- **Two faces, each with one job.** [Urbanist](https://fonts.google.com/specimen/Urbanist) (`font-family/display`) sets the wordmark, titles and headings; [Hanken Grotesk](https://fonts.google.com/specimen/Hanken+Grotesk) (`font-family/sans`) sets everything else, numbers included. Urbanist is geometric, drawn from circles and straight strokes, so the name and each screen's title carry a distinct identity. Hanken is a quiet grotesque that stays out of the data's way: speeds, latencies, IP and MAC addresses, lists of devices.
- **The two faces set a character.** Urbanist is modern and clean, so the name and titles feel current. Hanken Grotesk is a take on the grotesques, the plain, engineered sans serifs of the industrial age, so the figures read like a tool's. That suits people who tune their network, gamers included. The pair contrasts in shape, round against upright, and agrees in cap height, so it reads as one voice.
- **Urbanist stays out of figures and small text.** Its digits are proportional and its 1 is narrow, so addresses crowd and a live number shifts sideways each time it updates. At 11–12px its round, open shapes also read less crisply than a grotesque's.
- **Hanken's figures hold still and sit level.** Every digit is the same width (0.56 of the size), so a counting speed doesn't jitter, and as tall as its own capitals and Urbanist's (71% of the size), so a figure lines up with the heading above it. Questrial, the face it replaced, ran 5% short.
- **Hanken has real weights from 100 to 900.** Questrial had one, so live speeds were faked bold, with a stroke in Figma and synthetic bold in code. Cal Sans, the first heading candidate, had the same limit and read heavy at small sizes.
- **Nine styles, two text sizes.** Text is 12px (Body, in Regular, Medium and SemiBold) and meta 11px (Caption). A 13px step sat 1px from both and read as a mistake rather than a level, so it went. A list row's name is Body and the rest of the row Caption; a data row's label and value share Body. Headings step up to 14px (Heading) and 17px (Title), and Display (28px) and Stat (17px) are for large figures only.
- **Line heights sit on a 4px grid** (12, 16, 20, 24 and 28px), so rows and cards add up to whole steps. A figure never wraps, so its line is as tall as its size.

## Where a change is made

- **Figma is where tokens are designed; git is the record.** Designers work in Figma, so it stays their library. But a release needs what Figma lacks: review on a diff, a build that refuses a broken reference, a version number. So a token ships only once it's in this repo, whichever side it started on.
- **Changes flow one way, and a check proves they agree.** The plugin exports Figma into `src/figma/`, and nothing writes back. Two places to edit a token would need a sync, and a sync can overwrite a designer's work with an edit they never saw, so a change is made in Figma, where designers work, and exported. The plugin's check lists anything in the repo that no longer matches the file. One piece of code exports and checks, for the plugin and for agents through the Figma MCP, so the two can't disagree about what matching means.
- **The check runs in Figma, not in CI.** Figma's REST API reads and writes variables only on the Enterprise plan, so nothing outside Figma can read them here. `npm run check` tests the plugin against a stand-in file instead, and the plugin or an agent runs the real check.
- **Shadows come from Figma; easings stay in code.** A shadow is a Figma effect style bound to the shadow colour variables, so it's designed there and exported like the variables, into `src/figma/effect-styles.json`. Figma has no token for an easing curve, so those stay in `src/code-tokens.json`.
- **Components start in code.** Each component's props, variants and usage guide come from `src/ui` in Rove (`components.gen.json`), and the Figma component mirrors them.
