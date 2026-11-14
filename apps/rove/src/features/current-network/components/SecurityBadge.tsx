import { DotSeparator, LockIcon, Tooltip, UnlockIcon } from '@swiftsolve/rove-ui'
import { cva, cx } from 'class-variance-authority'

import { isWeakSecurity, normalizeSecurity, shortSecurityLabel } from '@/features/current-network/utils/wifi-security'
import { isSecuredWifi } from '@/utils/format'
import { spokenText } from '@/utils/spoken'

type SecurityLevel = 'secured' | 'weak' | 'open'

/** Block flex, not inline-flex, which sits the lock on the baseline a little low. */
const securityBadgeVariants = cva('flex min-w-0 items-center gap-6 in-[dl]:justify-end', {
  variants: {
    level: { secured: null, weak: null, open: 'text-negative' },
  },
})

/**
 * Centred on the line box, the lock already sits at the middle of a mostly
 * lowercase label ("Secured"). The short label is all capitals ("WPA3"),
 * whose middle is higher, so there the lock is lifted 0.5px.
 */
const securityIconVariants = cva('shrink-0', {
  variants: {
    level: { secured: 'text-status-positive', weak: 'text-status-warning', open: null },
    isShort: { true: 'transform-[translateY(-0.5px)]', false: null },
  },
})

const VERDICTS: Record<SecurityLevel, string> = { secured: 'Secured', weak: 'Weak', open: 'Not secured' }

function securityLevel(security: string, fullLabel: string): SecurityLevel {
  if (isSecuredWifi(security) !== true) return 'open'
  if (isWeakSecurity(fullLabel)) return 'weak'
  return 'secured'
}

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
  const level = securityLevel(security, fullLabel)
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
        <Icon size={12} className={securityIconVariants({ level, isShort })} />
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
