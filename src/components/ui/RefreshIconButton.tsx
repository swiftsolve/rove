import { ButtonSpinner } from '@/components/ui/ButtonSpinner'
import { RefreshIcon } from '@/components/ui/Icons'
import { Tooltip } from '@/components/ui/Tooltip'

interface RefreshIconButtonProps {
  /** Tooltip text and accessible name, e.g. "Scan again". */
  readonly label: string
  /** Swaps the refresh glyph for a spinner and gates clicks while true. */
  readonly isBusy: boolean
  readonly onClick: () => void
  /**
   * How clicks are gated while busy: `disable` (default) greys the button out;
   * `ignore` keeps it interactive — the tooltip still shows on hover — and
   * simply drops the click, announcing the busy state via `aria-busy` instead.
   */
  readonly busyBehavior?: 'disable' | 'ignore'
}

/** The view headers' secondary refresh control: tooltip-wrapped icon button
 *  whose glyph becomes a spinner while the underlying reload runs. */
export function RefreshIconButton({
  label,
  isBusy,
  onClick,
  busyBehavior = 'disable',
}: RefreshIconButtonProps): JSX.Element {
  const ignoresWhileBusy = busyBehavior === 'ignore'

  return (
    <Tooltip content={label}>
      <button
        type="button"
        className={`btn-icon btn-icon-secondary${isBusy ? ' is-scanning' : ''}`}
        onClick={ignoresWhileBusy && isBusy ? undefined : onClick}
        disabled={!ignoresWhileBusy && isBusy}
        aria-busy={ignoresWhileBusy ? isBusy : undefined}
        aria-label={label}
      >
        {isBusy ? <ButtonSpinner size={14} /> : <RefreshIcon size={16} />}
      </button>
    </Tooltip>
  )
}
