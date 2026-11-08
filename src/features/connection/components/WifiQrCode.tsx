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
      {/* About a fifth of the code's width: well inside what high error correction recovers. */}
      <span className="absolute top-1/2 left-1/2 flex size-[48px] -translate-1/2 items-center justify-center rounded-md bg-[#ffffff]">
        <BrandIcon size={36} hasGradient />
      </span>
    </div>
  )
}
