import { cva, cx } from 'class-variance-authority'

import { normalizeSecurity, shortSecurityLabel } from '@/features/connection/utils/wifi-security'
import { isSecuredWifi } from '@/lib/format'
import { LockIcon, Tooltip, UnlockIcon } from '@/ui'

// Block flex, not inline-flex, which sits the lock on the baseline a little low.
const securityBadgeVariants = cva('flex items-center gap-6 min-w-0 in-[dl]:justify-end', {
  variants: {
    isSecured: { true: null, false: 'text-negative' },
  },
})

// Centred on the line box the taller lock reads low, so it's lifted 1px.
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
