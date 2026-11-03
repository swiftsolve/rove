// The library's stacking order, lowest first, named so a new overlay picks a
// layer instead of a number. Whole class names, so Tailwind finds them.

/** Above the page around it: the page header over the content it scrolls past. */
export const LAYER_RAISED = 'z-20'
/** A dialog and its scrim, over the content column but under the app frame. */
export const LAYER_DIALOG = 'z-90'
/** The title bar and nav rail, over the content column and its dialogs. */
export const LAYER_CHROME = 'z-100'
/** Menus and tooltips, portalled to the body: over everything, a dialog included. */
export const LAYER_POPOVER = 'z-9999'
