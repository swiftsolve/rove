import { useEffect, useState } from 'react'
import type { ServiceDefinition } from '@/types'
import { ButtonSpinner } from '@/components/ui/ButtonSpinner'
import { ServiceIcon } from '@/components/ui/ServiceIcon'
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
  /** Persist the confirmed service. Resolves once the list is updated. */
  readonly onAdd: (name: string, host: string) => Promise<void>
  readonly onClose: () => void
}

/**
 * The "add a service" popup: enter a URL/IP, **test** its reachability, then
 * **confirm** to add it. The test probes the host without storing it (see
 * `testService`), so the user sees whether it's reachable — and its latency —
 * before committing. Editing the address after a test clears the result, so the
 * confirm always reflects what was actually measured.
 */
export function AddServiceDialog({ onAdd, onClose }: AddServiceDialogProps): JSX.Element {
  const [draft, setDraft] = useState('')
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

  const confirm = (): void => {
    if (!outcome) return
    setAdding(true)
    void onAdd(outcome.name, outcome.host)
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
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (phase === 'tested') confirm()
    else if (draft.trim() && phase !== 'testing') runTest()
  }

  return (
    <div className="svc-dialog-overlay" role="presentation" onClick={adding ? undefined : onClose}>
      <div
        className="svc-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-service-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="add-service-title" className="svc-dialog-title">
          Add a service
        </h2>
        <p className="svc-dialog-sub">Track a website or device by URL or IP address.</p>

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

        {error ? (
          <p className="svc-dialog-note svc-dialog-note-error">{error}</p>
        ) : phase === 'tested' && outcome ? (
          <div className="svc-dialog-result">
            <ServiceIcon host={outcome.host} name={outcome.name} size={18} />
            <span className="svc-dialog-result-name">{outcome.name}</span>
            {outcome.latencyMs == null ? (
              <span className="svc-dialog-result-status val-bad">Unreachable</span>
            ) : (
              <span className={`svc-dialog-result-status ${serviceLevel(outcome.latencyMs)}`}>
                {formatLatencyMs(outcome.latencyMs)}
              </span>
            )}
          </div>
        ) : (
          <p className="svc-dialog-note">Test the connection before adding.</p>
        )}

        <div className="svc-dialog-actions">
          <button type="button" className="svc-dialog-btn" onClick={onClose} disabled={adding}>
            Cancel
          </button>
          {phase === 'tested' ? (
            <button
              type="button"
              className="svc-dialog-btn is-primary"
              onClick={confirm}
              disabled={adding}
            >
              {adding ? <ButtonSpinner size={14} /> : 'Add'}
            </button>
          ) : (
            <button
              type="button"
              className="svc-dialog-btn is-primary"
              onClick={runTest}
              disabled={!draft.trim() || phase === 'testing'}
            >
              {phase === 'testing' ? <ButtonSpinner size={14} /> : 'Test'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
