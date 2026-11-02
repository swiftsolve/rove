import { spring } from 'motion'

/**
 * The spring that moves and resizes things, settling with a slight overshoot:
 * a dialog easing to its content's height, a tooltip gliding between triggers.
 * A CSS transition's duration and easing (`linear()`), so it runs without
 * JavaScript and reduced motion cuts it short like any other transition:
 * `transition: height ${SPRING}`.
 */
export const SPRING = spring(0.3, 0.15).toString()
