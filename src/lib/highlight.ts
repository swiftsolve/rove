const FOCUSABLE = 'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * Briefly ring an element that was just scrolled to after a navigation, so the
 * eye lands on the item that was clicked rather than hunting the page for it.
 * The ring animates itself out and strips its own class on the way, so callers
 * have nothing to tear down — an element that unmounts mid-flash takes the
 * pending listener with it.
 *
 * Keyboard focus moves there too — to the item's own control (e.g. a Hosts
 * group's header), else the item itself — so the next Tab continues from the
 * highlighted item instead of from the top of the page. This overrides the
 * app's focus-the-h1 on navigation, which runs first. The caller owns the
 * scroll, so focusing doesn't scroll.
 */
export function flashHighlight(el: HTMLElement): void {
  const target = el.matches(FOCUSABLE) ? el : el.querySelector<HTMLElement>(FOCUSABLE)
  if (target) {
    target.focus({ preventScroll: true })
  } else {
    el.tabIndex = -1
    el.focus({ preventScroll: true })
  }

  // Restart cleanly if the same element is flashed twice in a row — without the
  // reflow between removing and adding, the browser coalesces the two and the
  // animation never replays.
  el.classList.remove('nav-flash')
  void el.offsetWidth
  el.classList.add('nav-flash')
  el.addEventListener('animationend', () => el.classList.remove('nav-flash'), { once: true })
}
