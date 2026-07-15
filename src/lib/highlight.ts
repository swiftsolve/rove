/**
 * Briefly ring an element that was just scrolled to after a navigation, so the
 * eye lands on the item that was clicked rather than hunting the page for it.
 * The ring animates itself out and strips its own class on the way, so callers
 * have nothing to tear down — an element that unmounts mid-flash takes the
 * pending listener with it.
 */
export function flashHighlight(el: HTMLElement): void {
  // Restart cleanly if the same element is flashed twice in a row — without the
  // reflow between removing and adding, the browser coalesces the two and the
  // animation never replays.
  el.classList.remove('nav-flash')
  void el.offsetWidth
  el.classList.add('nav-flash')
  el.addEventListener('animationend', () => el.classList.remove('nav-flash'), { once: true })
}
