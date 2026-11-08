import { BrandIcon } from '@/ui'

/**
 * The Share Wi‑Fi QR code: `svg` on a white plate, so it keeps its quiet zone
 * and contrast in dark mode, with the Rove mark on a white tile in its middle.
 * The backend encodes at the highest error correction, so the code still
 * scans with its centre covered.
 */
export function WifiQrCode({ svg, alt }: { svg: string; alt: string }) {
  return (
    <div className="relative flex animate-fade-in justify-center rounded-lg border border-line bg-[#ffffff] p-16">
      <img
        className="block size-[240px]"
        src={`data:image/svg+xml,${encodeURIComponent(svg)}`}
        alt={alt}
        width={240}
        height={240}
      />
      {/* Well inside what high error correction recovers. The tile is the
          mark's ink (28 by 24) with 4px all round; the ring opens at the
          bottom, so the mark drops 1.75px to centre its ink. */}
      <span className="absolute top-1/2 left-1/2 flex h-[32px] w-[36px] -translate-1/2 items-center justify-center rounded-md bg-[#ffffff]">
        <BrandIcon size={34} hasGradient className="translate-y-[1.75px]" />
      </span>
    </div>
  )
}
