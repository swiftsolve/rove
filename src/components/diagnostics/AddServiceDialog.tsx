import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ServiceDefinition } from '@/types'
import { ButtonSpinner } from '@/components/ui/ButtonSpinner'
import { ServiceIcon } from '@/components/ui/ServiceIcon'
import { CloseIcon } from '@/components/ui/Icons'
import { parseServiceInput } from '@/lib/serviceInput'
import { formatLatencyMs } from '@/lib/format'
import './AddServiceDialog.css'

// Same reachability bands the Services card uses for its rows.
function serviceLevel(ms: number): string {
  if (ms <= 120) return 'val-good'
  if (ms <= 300) return 'val-warn'
  return 'val-bad'
}

interface TestOutcome extends ServiceDefinition {
  /** Measured latency in ms, or null when the host couldn't be reached. */
  readonly latencyMs: number | null
}

interface AddServiceDialogProps {
  /** Persist the confirmed service, passing the latency just measured by the
   *  test so the new row can show it at once instead of waiting for the next
   *  diagnostics run. Resolves once the list is updated. */
  readonly onAdd: (name: string, host: string, latencyMs: number | null) => Promise<void>
  readonly onClose: () => void
  /** When editing an existing service, its current name/host to pre-fill; the
   *  dialog re-tests and re-saves it. Omit for the add flow. */
  readonly editing?: { readonly name: string; readonly host: string }
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
  const [draft, setDraft] = useState(editing?.host ?? '')
  const [name, setName] = useState(editing?.name ?? '')
  // In edit mode the name is the user's own from the start, so never auto-derive
  // over it as they touch the address.
  const [nameTouched, setNameTouched] = useState(editing != null)
  const [phase, setPhase] = useState<'idle' | 'testing' | 'tested'>('idle')
  const [outcome, setOutcome] = useState<TestOutcome | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  // Escape closes the dialog, the native expectation for a modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !adding) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [adding, onClose])

  const runTest = (): void => {
    const parsed = parseServiceInput(draft)
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

  const tested = phase === 'tested' && outcome != null

  const confirm = (): void => {
    if (!outcome) return
    setAdding(true)
    // The editable name wins over the auto-detected one; fall back to the
    // derived name if the field somehow ended up blank.
    const finalName = name.trim() || outcome.name
    void onAdd(finalName, outcome.host, outcome.latencyMs)
      .then(onClose)
      .catch(() => {
        setError('Could not add that service.')
        setAdding(false)
      })
  }

  const onInputChange = (value: string): void => {
    setDraft(value)
    // Any edit invalidates a prior test — the confirm must reflect a fresh probe.
    if (phase === 'tested') setPhase('idle')
    if (outcome) setOutcome(null)
    if (error) setError(null)
    // Keep the name in sync with the address until the user takes it over.
    if (!nameTouched) {
      const parsed = parseServiceInput(value)
      setName(parsed ? parsed.name : '')
    }
  }

  const onNameChange = (value: string): void => {
    setName(value)
    // Blanking the field hands the name back to auto-detection; re-derive from
    // the current address so it never lingers empty when a host is present.
    if (value.trim() === '') {
      setNameTouched(false)
      const parsed = parseServiceInput(draft)
      if (parsed) setName(parsed.name)
    } else {
      setNameTouched(true)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (phase === 'tested') confirm()
    else if (draft.trim() && phase !== 'testing') runTest()
  }

  const overlay = (
    <div className="svc-dialog-overlay" role="presentation" onClick={adding ? undefined : onClose}>
      <div
        className="svc-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-service-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="svc-dialog-head">
          <div className="svc-dialog-heading">
            <h2 id="add-service-title" className="svc-dialog-title">
              {editing ? 'Edit service' : 'Add a service'}
            </h2>
            <p className="svc-dialog-sub">Track a service by URL or IP address.</p>
          </div>
          <button
            type="button"
            className="btn-icon btn-icon-secondary svc-dialog-close"
            onClick={onClose}
            disabled={adding}
            aria-label="Close"
          >
            <CloseIcon size={15} />
          </button>
        </header>

        <div className="svc-dialog-body">
          <label className="svc-dialog-field">
            <span className="svc-dialog-field-label">Address</span>
            <div className="svc-dialog-inputgroup" data-invalid={error != null}>
              <input
                type="text"
                className="svc-dialog-input"
                value={draft}
                onChange={(e) => onInputChange(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="example.com or 192.168.1.1"
                aria-label="Service URL or IP address"
                aria-invalid={error != null}
                autoFocus
              />
              <button
                type="button"
                className={`svc-dialog-test${phase === 'testing' ? ' is-loading' : ''}`}
                onClick={runTest}
                disabled={!draft.trim() || phase === 'testing'}
              >
                {phase === 'testing' ? <ButtonSpinner size={13} /> : 'Test'}
              </button>
            </div>
            {/* Feedback for the address sits right under it: the "test first" hint
                while idle, the error when one occurs, or the measured result once
                a test lands — so the hint is gone the moment the test is done. */}
            {error ? (
              <p className="svc-dialog-note svc-dialog-note-error">{error}</p>
            ) : phase === 'tested' && outcome ? (
              <div className="svc-dialog-result">
                <ServiceIcon host={outcome.host} name={name || outcome.name} size={18} />
                <span className="svc-dialog-result-name">{name || outcome.name}</span>
                {outcome.latencyMs == null ? (
                  <span className="svc-dialog-result-status val-bad">Unreachable</span>
                ) : (
                  <span className={`svc-dialog-result-status ${serviceLevel(outcome.latencyMs)}`}>
                    {formatLatencyMs(outcome.latencyMs)}
                  </span>
                )}
              </div>
            ) : phase === 'testing' ? (
              <p className="svc-dialog-note">Testing…</p>
            ) : (
              <p className="svc-dialog-note">Test the connection before adding.</p>
            )}
          </label>

          <label className="svc-dialog-field">
            <span className="svc-dialog-field-label">Name</span>
            <input
              type="text"
              className="svc-dialog-input"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Auto-detected from the address"
              aria-label="Service name"
            />
          </label>

        </div>

        <footer className="svc-dialog-foot">
          <button
            type="button"
            className="svc-dialog-btn is-primary"
            onClick={confirm}
            disabled={!tested || adding}
          >
            {adding ? <ButtonSpinner size={14} /> : editing ? 'Save' : 'Add service'}
          </button>
        </footer>
      </div>
    </div>
  )

  // Anchor the modal to the main content column so it centres over the page
  // area, not the whole window (the nav rail stays uncovered). Fall back to
  // inline rendering if the column isn't in the DOM.
  const host = typeof document !== 'undefined' ? document.querySelector('.app-col') : null
  return host ? createPortal(overlay, host) : overlay
}
