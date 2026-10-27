import { useId, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { ServiceDefinition } from '@/types'
import { ButtonSpinner } from '@/components/ButtonSpinner'
import { ServiceIcon } from '@/components/icons/ServiceIcon'
import { CloseIcon } from '@/components/icons/Icons'
import { parseServiceInput } from '@/features/services/utils/service-input'
import { latencyBand } from '@/features/services/utils/service-status'
import { formatLatencyMs } from '@/lib/format'
import { Button } from '@/components/Button'
import { IconButton } from '@/components/IconButton'
import { cva } from 'class-variance-authority'
import { useModalFocus } from '@/hooks/useModalFocus'
import styles from './AddServiceDialog.module.css'

const inputGroupVariants = cva(styles.inputGroup, {
  variants: {
    /** The address failed to parse or test: a red border. */
    isInvalid: { true: styles.isInvalid },
  },
})

const testVariants = cva(styles.test, {
  variants: {
    /** Testing: the label is a spinner, so the button collapses to a square. */
    isLoading: { true: styles.isLoading },
  },
})

const noteVariants = cva(styles.note, {
  variants: {
    isError: { true: styles.isError },
  },
})

const resultStatusVariants = cva(styles.resultStatus, {
  variants: {
    /** The measured latency's health band, or bad when the host was down. */
    level: { good: 'val-good', warn: 'val-warn', bad: 'val-bad' },
  },
})

type TestPhase = 'idle' | 'testing' | 'tested'

interface TestOutcome extends ServiceDefinition {
  /** Measured latency in ms, or null when the host couldn't be reached. */
  latencyMs: number | null
}

interface AddServiceDialogProps {
  /** Persist the confirmed service, passing the latency just measured by the
   *  test so the new row can show it at once instead of waiting for the next
   *  services poll. Resolves once the list is updated. */
  onAdd: (name: string, host: string, latencyMs: number | null) => Promise<void>
  onClose: () => void
  /** When editing an existing service, its current name/host to pre-fill; the
   *  dialog re-tests and re-saves it. Omit for the add flow. */
  editing?: { name: string; host: string }
}

/**
 * Feedback for the address sits right under it: the "test first" hint while
 * idle, the error when one occurs, or the measured result once a test lands —
 * so the hint is gone the moment the test is done.
 */
function AddressFeedback({
  error,
  phase,
  outcome,
  name,
}: {
  error: string | null
  phase: TestPhase
  outcome: TestOutcome | null
  name: string
}): JSX.Element {
  if (error) {
    return (
      <p className={noteVariants({ isError: true })} role="alert">
        {error}
      </p>
    )
  }
  if (phase === 'tested' && outcome) {
    const shownName = name || outcome.name
    return (
      <div className={styles.result}>
        <ServiceIcon host={outcome.host} name={shownName} size={18} />
        <span className={styles.resultName}>{shownName}</span>
        {outcome.latencyMs == null ? (
          <span className={resultStatusVariants({ level: 'bad' })}>Down</span>
        ) : (
          <span className={resultStatusVariants({ level: latencyBand(outcome.latencyMs) })}>
            {formatLatencyMs(outcome.latencyMs)}
          </span>
        )}
      </div>
    )
  }
  if (phase === 'testing') return <p className={noteVariants()}>Testing…</p>
  return <p className={noteVariants()}>Test the connection before adding.</p>
}

function confirmLabel(isAdding: boolean, isEditing: boolean): ReactNode {
  if (isAdding) return <ButtonSpinner size={14} />
  return isEditing ? 'Save' : 'Add service'
}

/** The confirm's spoken name while it shows only a spinner. */
function busyConfirmName(isAdding: boolean, isEditing: boolean): string | undefined {
  if (!isAdding) return undefined
  return isEditing ? 'Saving' : 'Adding service'
}

/**
 * The "add a service" popup: enter a URL/IP, **test** its reachability, then
 * **confirm** to add it. The test probes the host without storing it (see
 * `testService`), so the user sees whether it's reachable — and its latency —
 * before committing. Editing the address after a test clears the result, so the
 * confirm always reflects what was actually measured.
 *
 * The display name is auto-detected from the address (github.com → "Github") but
 * stays editable: once the user types their own name, we stop overwriting it.
 * Clearing the field back to empty resumes auto-detection.
 *
 * Passing `editing` pre-fills the fields and switches the copy to "Edit service";
 * the flow is otherwise identical (test, then save), and the caller decides how to
 * persist (re-adding the same host updates its label; a changed host is a move).
 */
export function AddServiceDialog({ onAdd, onClose, editing }: AddServiceDialogProps): JSX.Element {
  const [address, setAddress] = useState(editing?.host ?? '')
  const [name, setName] = useState(editing?.name ?? '')
  // In edit mode the name is the user's own from the start, so never auto-derive
  // over it as they touch the address.
  const [isNameTouched, setIsNameTouched] = useState(editing != null)
  const [phase, setPhase] = useState<TestPhase>('idle')
  const [outcome, setOutcome] = useState<TestOutcome | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)

  // Focus stays in the dialog while it's open; Escape closes it (not mid-add).
  const dialogRef = useModalFocus(onClose, !isAdding)
  const titleId = useId()
  const descriptionId = useId()
  const addressId = useId()
  const feedbackId = useId()
  const isTesting = phase === 'testing'

  const runTest = (): void => {
    const parsed = parseServiceInput(address)
    if (!parsed) {
      setError('Enter a valid URL or IP address.')
      return
    }
    setError(null)
    setPhase('testing')
    void (async () => {
      try {
        const latencyMs = (await window.networkAPI?.testService(parsed.host)) ?? null
        setOutcome({ ...parsed, latencyMs })
        setPhase('tested')
      } catch {
        setError('Could not test that address. Try again.')
        setPhase('idle')
      }
    })()
  }

  const hasTested = phase === 'tested' && outcome != null

  const confirm = (): void => {
    if (!outcome) return
    setIsAdding(true)
    // The editable name wins over the auto-detected one; fall back to the
    // derived name if the field somehow ended up blank.
    const finalName = name.trim() || outcome.name
    void onAdd(finalName, outcome.host, outcome.latencyMs)
      .then(onClose)
      .catch(() => {
        setError('Could not add that service.')
        setIsAdding(false)
      })
  }

  const onAddressChange = (value: string): void => {
    setAddress(value)
    // Any edit invalidates a prior test — the confirm must reflect a fresh probe.
    if (phase === 'tested') setPhase('idle')
    if (outcome) setOutcome(null)
    if (error) setError(null)
    // Keep the name in sync with the address until the user takes it over.
    if (!isNameTouched) {
      const parsed = parseServiceInput(value)
      setName(parsed ? parsed.name : '')
    }
  }

  const onNameChange = (value: string): void => {
    setName(value)
    // Blanking the field hands the name back to auto-detection; re-derive from
    // the current address so it never lingers empty when a host is present.
    if (value.trim() === '') {
      setIsNameTouched(false)
      const parsed = parseServiceInput(address)
      if (parsed) setName(parsed.name)
    } else {
      setIsNameTouched(true)
    }
  }

  // Enter advances the flow: confirm once tested, otherwise run the test.
  const onFieldKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (phase === 'tested') confirm()
    else if (address.trim() && phase !== 'testing') runTest()
  }

  const overlay = (
    <div className={styles.overlay} role="presentation" onClick={isAdding ? undefined : onClose}>
      <div
        className={styles.dialog}
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.head}>
          <div className={styles.heading}>
            <h2 id={titleId} className={styles.title}>
              {editing ? 'Edit service' : 'Add a service'}
            </h2>
            <p id={descriptionId} className={styles.sub}>
              Track a service by URL or IP address.
            </p>
          </div>
          <IconButton
            className={styles.close}
            onClick={onClose}
            disabled={isAdding}
            aria-label="Close"
          >
            <CloseIcon size={15} />
          </IconButton>
        </div>

        <div className={styles.body}>
          {/* A div, not a wrapping label: the field also holds the Test button and
              the feedback below it, which a label can't contain. */}
          <div className={styles.field}>
            <label htmlFor={addressId} className={styles.fieldLabel}>
              Address
            </label>
            <div className={inputGroupVariants({ isInvalid: error != null })}>
              <input
                id={addressId}
                type="text"
                className={styles.input}
                value={address}
                onChange={(e) => onAddressChange(e.target.value)}
                onKeyDown={onFieldKeyDown}
                placeholder="example.com or 192.168.1.1"
                aria-invalid={error != null}
                aria-describedby={feedbackId}
                autoFocus
              />
              <button
                type="button"
                className={testVariants({ isLoading: isTesting })}
                onClick={runTest}
                disabled={!address.trim() || isTesting}
                aria-label={isTesting ? 'Testing' : undefined}
              >
                {isTesting ? <ButtonSpinner size={13} /> : 'Test'}
              </button>
            </div>
            {/* One persistent live region, so "Testing…", the result and any
                error are announced as they swap in. */}
            <div id={feedbackId} role="status">
              <AddressFeedback error={error} phase={phase} outcome={outcome} name={name} />
            </div>
          </div>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Name</span>
            <input
              type="text"
              className={styles.input}
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              onKeyDown={onFieldKeyDown}
              placeholder="Auto-detected from the address"
            />
          </label>
        </div>

        <div className={styles.foot}>
          <Button
            variant="filled"
            className={styles.confirm}
            onClick={confirm}
            disabled={!hasTested || isAdding}
            aria-busy={isAdding}
            aria-label={busyConfirmName(isAdding, editing != null)}
          >
            {confirmLabel(isAdding, editing != null)}
          </Button>
        </div>
      </div>
    </div>
  )

  // Anchor the modal to the main content column so it centres over the page
  // area, not the whole window (the nav rail stays uncovered). Fall back to
  // inline rendering if the column isn't in the DOM.
  const portalTarget = typeof document !== 'undefined' ? document.querySelector('[data-modal-root]') : null
  return portalTarget ? createPortal(overlay, portalTarget) : overlay
}
