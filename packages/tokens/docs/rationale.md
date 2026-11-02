# Why the tokens are what they are

The reasons behind the token values. The values themselves live in Figma (and in `tokens.css`); this page doesn't repeat them, so it can't drift from them.

## Structure

- **Every colour lives once, in the Palette.** Color tokens point at Palette shades, and each shade is named by hue and darkness: `hue/N` has OKLCH lightness of about 100 − N/10, so `blue/450` is 55 (higher is darker).
- **Neutral is one even ramp.** Neutrals sit on 5-steps of OKLCH lightness, and the number says which: `neutral/N` has lightness 100 − N/10, so `neutral/850` is 15, white is `neutral/0` and black would be `neutral/1000`. The one exception is inset, which takes the half step between base and surface (`neutral/25`, `neutral/825`). They share one hue and one chroma curve, so the ramp reads as one family. The chroma stays under 0.007, so the grays read neutral with a hint of cool, not blue; dark shades show a tint most, so they carry the least. Only the steps a token uses are in the Palette. The hues keep their own shades, each tuned for its job.
- **A see-through shade sits with its base shade.** It takes the base's name plus `-a` and its opacity: `neutral/850-a10` is `neutral/850` at 10%, `blue/340-a14` is `blue/340` at 14%. Black only appears see-through (`neutral/1000-a22`), for dark-mode shadows and the scrim.
- **CSS names follow Figma names.** `bg/base` is `--bg-base`, `border/default` is `--border-default`; the build refuses a code syntax that doesn't match.
- **Typography comes from the text styles, not variables.** Figma can't bind a percentage line height to a variable, so line heights and letter spacings live only in the styles; copying them into variables would give the type scale two sources that could drift apart.

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

## Accent and fills

- **`accent/fill` sits a step darker than the accent.** The bright accent reads well as text but gives a white label only 3.2:1; the fill clears 4.5:1.
- **Fill hovers deepen rather than brighten:** any lighter fill would drop the white label below 4.5:1.
- **The negative reds** (negative, fill, fill hover) each step darker and duller, so they read as three reds rather than two. Both themes share the fill and hover, where white labels sit at 5.6:1 and 7.4:1.

## Status

- **One shade per status hue for icons, bars and dots.** In light mode each is the lightest shade of its hue that clears 3:1 (the bar for graphics) on every surface it sits on, including the 14% tints of icon tiles and timeline markers. Each is held at the most saturated it can be at that lightness (OKLCH chroma at the sRGB edge), so the colours read bright rather than dark or brown.
- **Green moves from the dark theme's mint toward pure green** in light mode, where the gamut has more room.
- **Red stays a step below the sRGB edge,** where it would turn neon beside the other hues. Its hue sits a touch toward orange: at 0° or below, a light red reads salmon or pink.
- **Status words need 4.5:1, which the light-mode icon shades miss (3.5–4.4:1).** `text/positive`, `text/warning` and `text/negative` are the same hues, darkened just enough to clear it on every surface, including the 14% tint of their own hue that a badge sits on. Dark mode uses the icon shades, which already pass.
- **The capability scale's in-between steps** (good, poor) follow the same rules, with their hues pulled apart from their neighbours (good is yellow-green, poor is orange) so the four levels stay distinct.

## Opacity

- **Tint strengths are shared** so a tinted tile or an unlit bar reads the same wherever it appears. They're percentages, for `color-mix()`.

## Spacing, radius and focus

- **One 2px spacing scale:** every gap, padding and margin is one of its steps, with no odd ones out. The nav rail and the content column share the `spacing/12` side inset, so the content sits as far from the window edge as the nav icons do.
- **Cards use one padding on every axis** (`--card-padding`), matching the gap the cards stack at, so they read as evenly inset.
- **`radius/md` is for the nav item and page-header chip,** a step rounder than `radius/sm`.
- **The focus ring is the same 1px accent line as the nav-flash highlight.** Controls get it outside their edge (`focus/offset`). Rows flush in a card draw it just inside (`--focus-inset`), square-cornered like the highlight.

## Type sizes

- **`font-size/xl` is for Heading/Medium,** a step under Heading/Large.
