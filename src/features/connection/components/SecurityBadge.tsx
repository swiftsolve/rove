import { cva, cx } from 'class-variance-authority'
import { isSecuredWifi } from '@/lib/format'
import { normalizeSecurity, shortSecurityLabel } from '@/features/connection/utils/wifi-security'
import { LockIcon, Tooltip, UnlockIcon } from '@/ui'

// Lock + protocol, green when secured, red when open. A block flex box (not
// inline-flex) so the lock centres on the text instead of sitting on the line's
// baseline, which drops it a couple of pixels low. In the expanded rows (the
// details' <dl>) it right-aligns in the value cell.
const securityBadgeVariants = cva('flex items-center gap-6 min-w-0 in-[dl]:justify-end', {
  variants: {
    isSecured: { true: null, false: 'text-negative' },
  },
})

// The lock is taller than the text's cap height, and centring on the line box
// leaves it reading low; lift it to sit level with the protocol text (the same
// optical nudge the signal bars get).
const securityIconVariants = cva('shrink-0 transform-[translateY(-1px)]', {
  variants: {
    isSecured: { true: 'text-status-positive' },
  },
})

type SecurityBadgeProps = {
  /** The OS's security string, e.g. "WPA3-Personal (H2E)", or "Open". */
  security: string
  /** Trims the label to the strongest protocol, for the collapsed strip. */
  isShort?: boolean
  className?: string
}

/** Wi‑Fi security with a lock: closed and green when the network is secured,
 *  open and red when it's open. */
export function SecurityBadge({ security, isShort = false, className }: SecurityBadgeProps) {
  const isSecured = isSecuredWifi(security) === true
  const fullLabel = normalizeSecurity(security)
  const securedLabel = isShort ? shortSecurityLabel(fullLabel) : fullLabel
  const description = isSecured ? `Secured (${fullLabel})` : "Open network. Traffic isn't encrypted."
  const Icon = isSecured ? LockIcon : UnlockIcon

  return (
    <Tooltip content={description} shouldDescribe={false}>
      <span className={cx(securityBadgeVariants({ isSecured }), className)}>
        <Icon size={12} className={securityIconVariants({ isSecured })} />
        <span className="min-w-0 overflow-hidden text-ellipsis" aria-hidden>
          {isSecured ? securedLabel : 'Open'}
        </span>
        {/* The hint isn't announced here; the full description is. */}
        <span className="sr-only">{description}</span>
      </span>
    </Tooltip>
  )
}
