import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { ServiceDefinition } from '@/types'
import { ButtonSpinner } from '@/components/ButtonSpinner'
import { ServiceIcon } from '@/components/icons/ServiceIcon'
import { CloseIcon } from '@/components/icons/Icons'
import { parseServiceInput } from '@/features/services/utils/service-input'
import { latencyLevelClass } from '@/features/services/utils/service-status'
import { formatLatencyMs } from '@/lib/format'
import { cx } from '@/lib/cx'
import styles from './AddServiceDialog.module.css'

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
  if (error) return <p className={cx(styles.note, styles.isError)}>{error}</p>
  if (phase === 'tested' && outcome) {
    const shownName = name || outcome.name
    return (
      <div className={styles.result}>
        <ServiceIcon host={outcome.host} name={shownName} size={18} />
        <span className={styles.resultName}>{shownName}</span>
        {outcome.latencyMs == null ? (
          <span className={cx(styles.resultStatus, 'val-bad')}>Down</span>
        ) : (
          <span className={cx(styles.resultStatus, latencyLevelClass(outcome.latencyMs))}>
            {formatLatencyMs(outcome.latencyMs)}
          </span>
        )}
      </div>
    )
  }
  if (phase === 'testing') return <p className={styles.note}>Testing…</p>
  return <p className={styles.note}>Test the connection before adding.</p>
}

function confirmLabel(isAdding: boolean, isEditing: boolean): ReactNode {
  if (isAdding) return <ButtonSpinner size={14} />
  return isEditing ? 'Save' : 'Add service'
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

  // Escape closes the dialog, the native expectation for a modal.
  useEffect(() => {
    const onWindowKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !isAdding) onClose()
    }
    window.addEventListener('keydown', onWindowKeyDown)
    return () => window.removeEventListener('keydown', onWindowKeyDown)
  }, [isAdding, onClose])

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
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-service-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.head}>
          <div className={styles.heading}>
            <h2 id="add-service-title" className={styles.title}>
              {editing ? 'Edit service' : 'Add a service'}
            </h2>
            <p className={styles.sub}>Track a service by URL or IP address.</p>
          </div>
          <button
            type="button"
            className={cx('btn-icon btn-icon-secondary', styles.close)}
            onClick={onClose}
            disabled={isAdding}
            aria-label="Close"
          >
            <CloseIcon size={15} />
          </button>
        </header>

        <div className={styles.body}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Address</span>
            <div className={styles.inputGroup} data-invalid={error != null}>
              <input
                type="text"
                className={styles.input}
                value={address}
                onChange={(e) => onAddressChange(e.target.value)}
                onKeyDown={onFieldKeyDown}
                placeholder="example.com or 192.168.1.1"
                aria-label="Service URL or IP address"
                aria-invalid={error != null}
                autoFocus
              />
              <button
                type="button"
                className={cx(styles.test, phase === 'testing' && styles.isLoading)}
                onClick={runTest}
                disabled={!address.trim() || phase === 'testing'}
              >
                {phase === 'testing' ? <ButtonSpinner size={13} /> : 'Test'}
              </button>
            </div>
            <AddressFeedback error={error} phase={phase} outcome={outcome} name={name} />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Name</span>
            <input
              type="text"
              className={styles.input}
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              onKeyDown={onFieldKeyDown}
              placeholder="Auto-detected from the address"
              aria-label="Service name"
            />
          </label>
        </div>

        <footer className={styles.foot}>
          <button
            type="button"
            className={cx('btn-primary btn-filled', styles.confirm)}
            onClick={confirm}
            disabled={!hasTested || isAdding}
          >
            {confirmLabel(isAdding, editing != null)}
          </button>
        </footer>
      </div>
    </div>
  )

  // Anchor the modal to the main content column so it centres over the page
  // area, not the whole window (the nav rail stays uncovered). Fall back to
  // inline rendering if the column isn't in the DOM.
  const portalTarget = typeof document !== 'undefined' ? document.querySelector('[data-modal-root]') : null
  return portalTarget ? createPortal(overlay, portalTarget) : overlay
}
