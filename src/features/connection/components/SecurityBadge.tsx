import { cva, cx } from 'class-variance-authority'

import { isWeakSecurity, normalizeSecurity, shortSecurityLabel } from '@/features/connection/utils/wifi-security'
import { DotSeparator, LockIcon, Tooltip, UnlockIcon } from '@/ui'
import { isSecuredWifi } from '@/utils/format'
import { spokenText } from '@/utils/spoken'

type SecurityLevel = 'secured' | 'weak' | 'open'

// Block flex, not inline-flex, which sits the lock on the baseline a little low.
const securityBadgeVariants = cva('flex min-w-0 items-center gap-6 in-[dl]:justify-end', {
  variants: {
    level: { secured: null, weak: null, open: 'text-negative' },
  },
})

// Centred on the line box the taller lock reads low, so it's lifted 1px.
const securityIconVariants = cva('shrink-0 transform-[translateY(-1px)]', {
  variants: {
    level: { secured: 'text-status-positive', weak: 'text-status-warning', open: null },
  },
})

const VERDICTS: Record<SecurityLevel, string> = { secured: 'Secured', weak: 'Weak', open: 'Not secured' }

type SecurityBadgeProps = {
  /** The OS's security string, e.g. "WPA3-Personal (H2E)", or "Open". */
  security: string
  /** For the collapsed strip: just the strongest protocol, or "Open", without the verdict. */
  isShort?: boolean
  className?: string
}

/**
 * Wi‑Fi security with a lock: green and closed when secured, an amber lock
 * when the best protocol is a broken one (WEP, WPA), red and open when it's open.
 */
export function SecurityBadge({ security, isShort = false, className }: SecurityBadgeProps) {
  const fullLabel = normalizeSecurity(security)
  const level: SecurityLevel =
    isSecuredWifi(security) !== true ? 'open' : isWeakSecurity(fullLabel) ? 'weak' : 'secured'
  const protocolLabel = isShort ? shortSecurityLabel(fullLabel) : fullLabel
  const description = {
    secured: `Secured (${fullLabel})`,
    weak: `Weak security (${fullLabel}). It's easy to break, so switch the router to WPA2 or WPA3.`,
    open: "Open network. Traffic isn't encrypted.",
  }[level]
  const spokenLabel = spokenText(fullLabel)
  const spokenDescription = {
    secured: `Secured, ${spokenLabel}`,
    weak: `Weak security, ${spokenLabel}. It's easy to break, so switch the router to WPA2 or WPA3.`,
    open: description,
  }[level]
  const Icon = level === 'open' ? UnlockIcon : LockIcon
  const hasProtocol = level !== 'open'

  return (
    <Tooltip content={description} shouldDescribe={false}>
      <span className={cx(securityBadgeVariants({ level }), className)}>
        <Icon size={12} className={securityIconVariants({ level })} />
        {/* The details row says the verdict, then the protocol; the strip, short
            on room, keeps just the protocol. */}
        {!isShort && (
          <span className="shrink-0" aria-hidden>
            {VERDICTS[level]}
          </span>
        )}
        {!isShort && hasProtocol && <DotSeparator />}
        {(isShort || hasProtocol) && (
          <span className="min-w-0 overflow-hidden text-ellipsis" aria-hidden>
            {hasProtocol ? protocolLabel : 'Open'}
          </span>
        )}
        {/* The hint isn't announced here; the full description is. */}
        <span className="sr-only">{spokenDescription}</span>
      </span>
    </Tooltip>
  )
}
