/**
 * A component's usage guide, set as its stories' `guidance` parameter and shown
 * on its Docs page above the stories. Each line is a few words, with `code` in backticks.
 * A part shown on its family's page (MenuItem on Menu's) has its guide in that
 * page's `partGuidance` parameter, by name, shown at the end of the page.
 */
export type Guidance = {
  /**
   * When to use it: each line a situation, then how if it needs saying, then an
   * example ("The page’s main action, solid: “Run test”.").
   */
  whenToUse: string[]
  /** When not to use it: each line a situation, then what to use instead ("…: use `Link`."). */
  whenNotToUse: string[]
  /**
   * For whoever builds with it, in code terms. Figma's docs section has its own,
   * for whoever designs with it, so the two aren't line for line.
   */
  accessibility: {
    /** What the component does for you: its element, roles, names, keyboard. */
    builtIn: string[]
    /** What you pass or write around it: props, labels, wrapping markup. */
    toHandle: string[]
  }
}
