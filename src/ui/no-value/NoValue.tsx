type NoValueProps = {
  /** What a screen reader hears in its place: "Not measured", "Unknown". */
  label?: string
}

/**
 * A short drawn bar where a value would be but there's none, never a typed
 * dash. It's sized in em, so it scales with the line it sits in, from a data
 * row to a hero number, and sits on that line's middle.
 */
export function NoValue({ label = 'None' }: NoValueProps) {
  return (
    <span className="inline-flex h-[1lh] items-center align-top">
      <span
        className="h-[max(1px,0.07em)] w-[0.6em] rounded-full bg-tertiary [@media(min-resolution:2dppx)]:h-[max(1.5px,0.07em)]"
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </span>
  )
}
