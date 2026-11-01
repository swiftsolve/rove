import { useId, useState } from 'react'
import type { ServiceDefinition } from '@/types'
import { Button, Dialog, TextField, TextFieldAction } from '@/ui'
import { ServiceIcon } from '@/features/services/components/ServiceIcon'
import { parseServiceInput } from '@/features/services/utils/service-input'
import { latencyBand } from '@/features/services/utils/service-status'
import { formatLatencyMs } from '@/lib/format'
import { cva } from 'class-variance-authority'

// Feedback tucked directly under the address field: the idle hint, an error, or
// the tested result. The hint is a snug one-line caption; the result is a taller
// inset row, so it swaps in the moment a test lands.
const noteVariants = cva('mt-8 flex min-h-[18px] items-center text-sm leading-body-small', {
  variants: {
    isError: { true: 'text-negative', false: 'text-tertiary' },
  },
  defaultVariants: { isError: false },
})

// Matches the address field's outer height (line-height 18 + 20 padding + 2
// border), so the result reads as the same-sized box swapping in.
const RESULT = 'mt-8 flex min-h-[40px] items-center gap-8 rounded-sm border border-line bg-inset px-12'

const resultStatusVariants = cva('shrink-0 font-numeric text-sm', {
  variants: {
    /** The measured latency's health band, or negative when the host was down. */
    status: { positive: 'text-positive', warning: 'text-warning', negative: 'text-negative' },
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
   *  services poll; undefined when an edit only renamed it and nothing was
   *  measured. Resolves once the list is updated. */
  onAdd: (name: string, host: string, latencyMs: number | null | undefined) => Promise<void>
  onClose: () => void
  /** When editing an existing service, its current name/host to pre-fill; the
   *  dialog re-tests and re-saves it. Omit for the add flow. */
  editing?: { name: string; host: string }
}

/**
 * Feedback for the address sits right under it: the "tested on add" hint while
 * idle, the error when one occurs, or the measured result once a test lands —
 * so the hint is gone the moment the test is done.
 */
function AddressFeedback({
  error,
  phase,
  outcome,
  name,
  isEditing,
}: {
  error: string | null
  phase: TestPhase
  outcome: TestOutcome | null
  name: string
  isEditing: boolean
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
      <div className={RESULT}>
        <ServiceIcon host={outcome.host} name={shownName} size={18} />
        <span className="min-w-0 flex-auto truncate text-sm text-primary">{shownName}</span>
        {outcome.latencyMs == null ? (
          <span className={resultStatusVariants({ status: 'negative' })}>Down</span>
        ) : (
          <span className={resultStatusVariants({ status: latencyBand(outcome.latencyMs) })}>
            {formatLatencyMs(outcome.latencyMs)}
          </span>
        )}
      </div>
    )
  }
  if (phase === 'testing') return <p className={noteVariants()}>Testing…</p>
  return <p className={noteVariants()}>{isEditing ? 'Tested when you save it.' : 'Tested when you add it.'}</p>
}

function confirmLabel(isBusy: boolean, isEditing: boolean, isDown: boolean): string {
  if (isBusy) return isEditing ? 'Saving…' : 'Adding…'
  if (isDown) return isEditing ? 'Save anyway' : 'Add anyway'
  return isEditing ? 'Save' : 'Add service'
}

/**
 * The "add a service" popup: enter a URL/IP and **add** it. Adding tests the
 * host first (see `testService`, which probes without storing it): a reachable
 * one goes straight in, while a down one shows its result and waits for "Add
 * anyway". The inline Test checks an address without adding it. Editing the
 * address after a test clears the result, so the confirm always reflects what
 * was actually measured.
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
  // The test was started by Add (not the inline Test), so it adds once it lands.
  const [isSubmitting, setIsSubmitting] = useState(false)

  const formId = useId()
  const isEditing = editing != null
  const isTesting = phase === 'testing'

  const hasTested = phase === 'tested' && outcome != null
  // An edit that leaves the address alone is just a rename: it saves without a
  // re-test, since the host it would probe is the one already tracked.
  const parsedAddress = parseServiceInput(address)
  const isSameHost = editing != null && parsedAddress?.host === editing.host
  const isRenameOnly = isSameHost && name.trim() !== editing.name
  // An edit with nothing changed has nothing to save.
  const isUnchanged = isSameHost && name.trim() === editing.name
  const canConfirm = hasTested || isRenameOnly
  const isDown = hasTested && outcome.latencyMs == null
  const isBusy = isAdding || isSubmitting
  const isDirty = address.trim() !== (editing?.host ?? '') || name.trim() !== (editing?.name ?? '')

  const confirm = (tested: TestOutcome | null = outcome): void => {
    const target = tested ?? (isRenameOnly && parsedAddress ? { ...parsedAddress, latencyMs: undefined } : null)
    if (!target) return
    setIsAdding(true)
    // The editable name wins over the auto-detected one; fall back to the
    // derived name if the field somehow ended up blank.
    const finalName = name.trim() || target.name
    void onAdd(finalName, target.host, target.latencyMs)
      .then(onClose)
      .catch(() => {
        setError('Could not add that service.')
        setIsAdding(false)
      })
  }

  const runTest = (shouldConfirm = false): void => {
    const parsed = parseServiceInput(address)
    if (!parsed) {
      setError('Enter a valid URL or IP address.')
      return
    }
    setError(null)
    setPhase('testing')
    setIsSubmitting(shouldConfirm)
    void (async () => {
      try {
        const latencyMs = (await window.networkAPI?.testService(parsed.host)) ?? null
        const tested = { ...parsed, latencyMs }
        setOutcome(tested)
        setPhase('tested')
        // A reachable host goes straight in; a down one waits for "Add anyway".
        if (shouldConfirm && latencyMs != null) confirm(tested)
      } catch {
        setError('Could not test that address. Try again.')
        setPhase('idle')
      } finally {
        setIsSubmitting(false)
      }
    })()
  }

  // Add: save what was tested (or a rename), otherwise test first.
  const submit = (): void => {
    if (isTesting || isAdding || isUnchanged) return
    if (canConfirm) confirm()
    else if (address.trim()) runTest(true)
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
    // Blanking the field hands the name back to auto-detection: it stays empty
    // (the placeholder says so) and the confirm falls back to the derived name.
    setIsNameTouched(value.trim() !== '')
  }

  return (
    <Dialog
      title={isEditing ? 'Edit service' : 'Add a service'}
      description="Track a service by URL or IP address."
      onClose={onClose}
      canClose={!isAdding}
      isDirty={isDirty}
      cancelLabel="Cancel"
      actions={
        <Button
          variant="solid"
          type="submit"
          form={formId}
          isDisabled={!address.trim() || isTesting || isUnchanged}
          isLoading={isBusy}
        >
          {confirmLabel(isBusy, isEditing, isDown)}
        </Button>
      }
    >
      {/* Enter in either field submits, as the Add button does. */}
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <TextField
          label="Address"
          value={address}
          onChange={onAddressChange}
          placeholder="example.com or 192.168.1.1"
          isInvalid={error != null}
          autoFocus
          action={
            <TextFieldAction
              onClick={() => runTest()}
              isDisabled={!address.trim() || isTesting || isAdding}
              isLoading={isTesting}
              loadingLabel="Testing"
            >
              Test
            </TextFieldAction>
          }
          feedback={<AddressFeedback error={error} phase={phase} outcome={outcome} name={name} isEditing={isEditing} />}
        />
        <TextField
          className="mt-16"
          label="Name"
          value={name}
          onChange={onNameChange}
          placeholder="Auto-detected from the address"
        />
      </form>
    </Dialog>
  )
}
