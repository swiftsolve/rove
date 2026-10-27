/**
 * Join class names, skipping the falsy ones — so a conditional class reads as
 * `cx(styles.row, isDown && styles.isDown)` instead of a template string.
 */
export function cx(...classNames: (string | false | null | undefined)[]): string {
  return classNames.filter(Boolean).join(' ')
}
