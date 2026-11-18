import { useId } from 'react'

/** The Rove Mark's ring: a 17-unit circle open at the foot, in a 48-unit box. */
const ARC = 'M 11.98 36.02 A 17 17 0 1 1 36.02 36.02'

/**
 * The app icon, still: a dark tile domed like a drum head, the ring cut into
 * it as a groove lit from above, and the dot nearly flat. It matches the hero
 * icon on rove.swiftsolve.net and nabilr.com/rove, without their motion. Its
 * colours copy the icon, which looks the same in both themes.
 */
export function AppIconTile() {
  const id = useId()
  const grooveId = `${id}-groove`
  const ringPaintId = `${id}-ring`
  const dotPaintId = `${id}-dot`

  return (
    <span
      className="relative mb-8 inline-flex size-[72px] items-center justify-center overflow-hidden rounded-[16px]"
      style={{
        // Lighter where the light falls, darkening to the foot.
        background: 'radial-gradient(130% 130% at 50% 30%, #282a2f 0%, #1c1d21 55%, #121316 100%)',
        // A soft light along the top, a shade inside the foot only (shaded
        // round every edge, the rim read as an outline), and a drop below.
        boxShadow:
          'inset 0 2px 4px rgba(255,255,255,0.06), inset 0 -10px 18px -8px rgba(0,0,0,0.45), 0 14px 26px -12px rgba(0,0,0,0.55)',
      }}
    >
      {/* The dome: a light crown over the middle, and a shade from halfway out
          that deepens slowly to the sides, so they slope away. */}
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          background: [
            'radial-gradient(70% 62% at 50% 42%, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.02) 50%, rgba(255,255,255,0.005) 72%, rgba(255,255,255,0) 90%)',
            'radial-gradient(closest-side at 50% 46%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.06) 65%, rgba(0,0,0,0.14) 88%, rgba(0,0,0,0.18) 100%)',
            'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 40%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.2) 100%)',
          ].join(', '),
        }}
      />
      {/* 78% of the tile, moved down 3.5% of its height: its ink sits high in
          its box, as the ring is open at the foot, and centred exactly it
          reads as sitting low. */}
      <svg
        width="56"
        height="56"
        viewBox="0 0 48 48"
        fill="none"
        aria-hidden
        className="relative"
        style={{ transform: 'translateY(3.5%)' }}
      >
        <defs>
          <linearGradient id={ringPaintId} x1="24" y1="7" x2="24" y2="41" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#7aa4ff" />
            <stop offset="1" stopColor="#5484f5" />
          </linearGradient>
          {/* Nearly flat, a hint of light toward its upper left. */}
          <radialGradient id={dotPaintId} cx="50%" cy="50%" r="50%" fx="40%" fy="35%">
            <stop offset="0" stopColor="#76a0ff" />
            <stop offset="0.7" stopColor="#6893fa" />
            <stop offset="1" stopColor="#5f8df7" />
          </radialGradient>
          {/* The groove: its upper edge throws a crisp shadow down inside it,
              its floor is dimmer than the face, its lower wall catches a thin
              light, and the face just below its lower lip a faint one. */}
          <filter id={grooveId} x="-20%" y="-20%" width="140%" height="140%">
            <feColorMatrix
              in="SourceGraphic"
              type="matrix"
              values="0.72 0 0 0 0  0 0.72 0 0 0  0 0 0.78 0 0  0 0 0 1 0"
              result="floor"
            />
            <feComponentTransfer in="SourceAlpha" result="outside">
              <feFuncA type="table" tableValues="1 0" />
            </feComponentTransfer>
            <feGaussianBlur in="outside" stdDeviation="0.6" result="edgeBlur" />
            <feFlood floodColor="#020617" floodOpacity="0.25" />
            <feComposite in2="edgeBlur" operator="in" />
            <feComposite in2="SourceAlpha" operator="in" result="rounding" />
            <feOffset in="outside" dy="1.1" result="outsideDown" />
            <feGaussianBlur in="outsideDown" stdDeviation="0.5" result="shadeBlur" />
            <feFlood floodColor="#020617" floodOpacity="0.8" />
            <feComposite in2="shadeBlur" operator="in" />
            <feComposite in2="SourceAlpha" operator="in" result="shade" />
            <feOffset in="outside" dy="-1.1" result="outsideUp" />
            <feGaussianBlur in="outsideUp" stdDeviation="0.35" result="lightBlur" />
            <feFlood floodColor="#cfdcff" floodOpacity="0.3" />
            <feComposite in2="lightBlur" operator="in" />
            <feComposite in2="SourceAlpha" operator="in" result="light" />
            <feOffset in="SourceAlpha" dy="0.8" result="shapeDown" />
            <feComposite in="shapeDown" in2="SourceAlpha" operator="out" result="belowLip" />
            <feGaussianBlur in="belowLip" stdDeviation="0.3" result="lipBlur" />
            <feFlood floodColor="#ffffff" floodOpacity="0.1" />
            <feComposite in2="lipBlur" operator="in" result="lipLight" />
            <feMerge>
              <feMergeNode in="lipLight" />
              <feMergeNode in="floor" />
              <feMergeNode in="rounding" />
              <feMergeNode in="shade" />
              <feMergeNode in="light" />
            </feMerge>
          </filter>
        </defs>
        <circle cx="24" cy="24" r="7.5" fill={`url(#${dotPaintId})`} />
        <path
          d={ARC}
          fill="none"
          stroke={`url(#${ringPaintId})`}
          strokeWidth="5"
          strokeLinecap="round"
          filter={`url(#${grooveId})`}
        />
      </svg>
    </span>
  )
}
