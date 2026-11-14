/**
 * A button's busy indicator: a ring in the button's text colour, so it suits
 * a solid, soft or icon button alike. Drawn inline (an `<svg>`, phrasing
 * content) so it's valid inside a `<button>`, where a `<div>` isn't.
 */
export function ButtonSpinner({
  size = 14,
  color = 'currentColor',
}: {
  /** In px: match the icon it replaces. */
  size?: number
  /** Any CSS colour. */
  color?: string
}) {
  const strokeWidth = 2
  const centre = size / 2
  const radius = Math.max(0, centre - strokeWidth / 2)
  return (
    <svg
      className="shrink-0 origin-center animate-ring-rotate overflow-visible"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      aria-hidden
    >
      <circle cx={centre} cy={centre} r={radius} pathLength={100} opacity={0.2} />
      <circle
        className="animate-ring-stretch"
        cx={centre}
        cy={centre}
        r={radius}
        pathLength={100}
        strokeLinecap="round"
        strokeDasharray="1 200"
      />
    </svg>
  )
}
