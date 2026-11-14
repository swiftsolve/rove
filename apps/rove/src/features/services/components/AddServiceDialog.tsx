import { Button, Dialog, NoValue, STATUS_TEXT, TextField, TextFieldAction, useLatestRef } from '@swiftsolve/rove-ui'
import { useMutation } from '@tanstack/react-query'
import { cva } from 'class-variance-authority'
import { useId, useState } from 'react'

import { getNetworkApi } from '@/bridge/network-api'
import { ServiceIcon } from '@/features/services/components/ServiceIcon'
import { parseServiceInput } from '@/features/services/utils/service-input'
import { latencyBand } from '@/features/services/utils/service-status'
import type { ServiceDefinition } from '@/types'
import { formatLatencyMs } from '@/utils/format'

/**
 * The tested result swaps in for the field's hint as a taller inset row, at the
 * address field's outer height (line-height 18 + 20 padding + 2 border), so it
 * reads as a same-sized box.
 */
const RESULT_ROW = 'flex min-h-[40px] items-center gap-8 rounded-sm border border-line bg-inset px-12'

const resultStatusVariants = cva('type-body shrink-0 font-sans', {
  variants: {
    /** The measured latency's health band, or negative when the host was down. */
    status: STATUS_TEXT,
  },
})

type TestPhase = 'idle' | 'testing' | 'tested'

type TestOutcome = {
  /** Measured latency in ms, or null when the host couldn't be reached. */
  latencyMs: number | null
} & ServiceDefinition

type SaveTarget = { name: string; host: string; latencyMs: number | null | undefined }

type AddServiceDialogProps = {
  /**
   * Persist the confirmed service, passing the latency just measured by the
   * test so the new row can show it at once instead of waiting for the next
   * services poll; undefined when an edit only renamed it and nothing was
   * measured. Resolves once the list is updated.
   */
  onSave: (name: string, host: string, latencyMs: number | null | undefined) => Promise<void>
  onClose: () => void
  /**
   * When editing an existing service, its current name and host to pre-fill.
   * A changed address is re-tested before it saves. Omit for the add flow.
   */
  editedService?: { name: string; host: string }
}

/**
 * Feedback for the address sits right under it: the "tested on add" hint while
 * idle, the error when one occurs, or the measured result once a test lands,
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
}) {
  if (error) return <span role="alert">{error}</span>
  if (phase === 'tested' && outcome) {
    const shownName = name || outcome.name
    return (
      <div className={RESULT_ROW}>
        <ServiceIcon host={outcome.host} name={shownName} size={18} />
        <span className="type-body min-w-0 flex-auto truncate text-primary">{shownName}</span>
        {outcome.latencyMs == null ? (
          <span className={resultStatusVariants({ status: 'negative' })}>Down</span>
        ) : (
          <span className={resultStatusVariants({ status: latencyBand(outcome.latencyMs) })}>
            {formatLatencyMs(outcome.latencyMs) ?? <NoValue />}
          </span>
        )}
      </div>
    )
  }
  if (phase === 'testing') return <>Testing…</>
  return <>{isEditing ? 'Tested when you save it.' : 'Tested when you add it.'}</>
}

function testPhase(isTesting: boolean, outcome: TestOutcome | null): TestPhase {
  if (isTesting) return 'testing'
  if (outcome) return 'tested'
  return 'idle'
}

/** What's shown under the address: a bad address first, then a failed test, then a failed save. */
function errorText(inputError: string | null, hasTestFailed: boolean, hasSaveFailed: boolean): string | null {
  if (inputError != null) return inputError
  if (hasTestFailed) return 'Could not test that address. Try again.'
  if (hasSaveFailed) return 'Could not add that service.'
  return null
}

function confirmLabel(isBusy: boolean, isEditing: boolean, isDown: boolean): string {
  if (isBusy) return isEditing ? 'Saving…' : 'Adding…'
  if (isDown) return isEditing ? 'Save anyway' : 'Add anyway'
  return isEditing ? 'Save' : 'Add service'
}

/**
 * The "add a service" popup. Adding tests the host first: a reachable one goes
 * straight in, a down one shows its result and waits for "Add anyway". Editing
 * the address clears the result, so the confirm reflects what was measured.
 *
 * The name is guessed from the address (github.com → "Github") until the user
 * types their own; clearing it resumes the guess. `editedService` pre-fills the
 * fields for "Edit service", where a rename alone saves without a test.
 */
export function AddServiceDialog({ onSave, onClose, editedService }: AddServiceDialogProps) {
  const [address, setAddress] = useState(editedService?.host ?? '')
  const [name, setName] = useState(editedService?.name ?? '')
  // A test started by Add confirms after it lands, with the name typed meanwhile.
  const nameRef = useLatestRef(name)
  // In edit mode the name is the user's own from the start, so it's never auto-derived.
  const [isNameTouched, setIsNameTouched] = useState(editedService != null)
  const [inputError, setInputError] = useState<string | null>(null)

  // `reset()` drops a result still in flight: an address edit, or Cancel while
  // the dialog plays its leave animation, must not show or add a stale test.
  const testMutation = useMutation({
    mutationFn: async ({ parsed }: { parsed: ServiceDefinition; shouldConfirm: boolean }): Promise<TestOutcome> => ({
      ...parsed,
      latencyMs: await getNetworkApi().testService(parsed.host),
    }),
  })
  const saveMutation = useMutation({
    mutationFn: ({ name: finalName, host, latencyMs }: SaveTarget) => onSave(finalName, host, latencyMs),
  })

  const formId = useId()
  const isEditing = editedService != null
  const outcome = testMutation.isSuccess ? testMutation.data : null
  const isTesting = testMutation.isPending
  const phase = testPhase(isTesting, outcome)
  const error = errorText(inputError, testMutation.isError, saveMutation.isError)

  // An edit that leaves the address alone is just a rename: it saves without a
  // re-test, since the host it would probe is the one already tracked.
  const parsedAddress = parseServiceInput(address)
  const isSameHost = editedService != null && parsedAddress?.host === editedService.host
  const isRenameOnly = isSameHost && name.trim() !== editedService.name
  const isUnchanged = isSameHost && name.trim() === editedService.name
  const isDown = outcome?.latencyMs === null
  const isBusy = saveMutation.isPending || (isTesting && testMutation.variables.shouldConfirm)
  const isDirty = address.trim() !== (editedService?.host ?? '') || name.trim() !== (editedService?.name ?? '')

  const close = (): void => {
    testMutation.reset()
    saveMutation.reset()
    onClose()
  }

  const saveAndClose = (target: SaveTarget): void => {
    // The typed name wins; a blank field falls back to the derived one.
    const finalName = nameRef.current.trim() || target.name
    saveMutation.mutate({ name: finalName, host: target.host, latencyMs: target.latencyMs }, { onSuccess: close })
  }

  const runTest = (shouldConfirm: boolean): void => {
    const parsed = parseServiceInput(address)
    if (!parsed) {
      setInputError('Enter a valid URL or IP address.')
      return
    }
    setInputError(null)
    saveMutation.reset()
    testMutation.mutate(
      { parsed, shouldConfirm },
      {
        // A reachable host goes straight in; a down one waits for "Add anyway".
        onSuccess: (tested) => {
          if (shouldConfirm && tested.latencyMs != null) saveAndClose(tested)
        },
      },
    )
  }

  // Add: save what was tested (or a rename), otherwise test first.
  const submit = (): void => {
    if (isTesting || saveMutation.isPending || isUnchanged) return
    if (outcome) saveAndClose(outcome)
    else if (isRenameOnly) saveAndClose({ ...parsedAddress, latencyMs: undefined })
    else if (address.trim()) runTest(true)
  }

  const onAddressChange = (value: string): void => {
    setAddress(value)
    // Any edit invalidates a prior test, or one still running.
    testMutation.reset()
    saveMutation.reset()
    setInputError(null)
    if (!isNameTouched) setName(parseServiceInput(value)?.name ?? '')
  }

  const onNameChange = (value: string): void => {
    setName(value)
    // Blanking the field hands the name back to auto-detection.
    setIsNameTouched(value.trim() !== '')
  }

  return (
    <Dialog
      title={isEditing ? 'Edit service' : 'Add a service'}
      description="Track a service by URL or IP address."
      onClose={close}
      canClose={!saveMutation.isPending}
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
          // eslint-disable-next-line jsx-a11y-x/no-autofocus -- a dialog's first field takes focus; without it, the panel would.
          autoFocus
          action={
            <TextFieldAction
              onClick={() => runTest(false)}
              isDisabled={!address.trim() || isTesting || saveMutation.isPending}
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
