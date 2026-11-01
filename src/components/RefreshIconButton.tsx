import { ButtonSpinner } from '@/components/ButtonSpinner'
import { RefreshIcon } from '@/components/icons/Icons'
import { Tooltip } from '@/components/Tooltip'
import { IconButton } from '@/components/IconButton'

interface RefreshIconButtonProps {
  /** Tooltip text and accessible name, e.g. "Scan again". */
  label: string
  /** Swaps the refresh glyph for a spinner and drops clicks while true. */
  isLoading: boolean
  onClick: () => void
}

/** The view headers' secondary refresh control: tooltip-wrapped icon button
 *  whose glyph becomes a spinner while the underlying reload runs. */
export function RefreshIconButton({ label, isLoading, onClick }: RefreshIconButtonProps): JSX.Element {
  return (
    <Tooltip content={label}>
      <IconButton isLoading={isLoading} onClick={onClick} aria-label={label}>
        {isLoading ? <ButtonSpinner size={14} /> : <RefreshIcon size={16} />}
      </IconButton>
    </Tooltip>
  )
}
