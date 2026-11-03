import { useNavigation } from '@/app/hooks/useNavigation'
import { HistoryCard } from '@/features/speed/components/HistoryCard'
import { useSpeedHistory } from '@/features/speed/hooks/useSpeedHistory'
import { type SpeedHistoryEntry } from '@/features/speed/utils/speed-history'
import { EmptyState, Menu, MenuContent, MenuItem, MenuTrigger, PageHeader, TrashIcon } from '@/ui'

/** The header overflow menu: Delete, which clears all history. */
function HistoryMenu({ onDelete }: { onDelete: () => void }) {
  return (
    <Menu>
      <MenuTrigger label="History options" />
      <MenuContent>
        <MenuItem icon={TrashIcon} tone="negative" onClick={onDelete}>
          Delete
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}

function HistoryList({ entries }: { entries: SpeedHistoryEntry[] }) {
  if (entries.length === 0) {
    return <EmptyState title="No speed tests yet" description="Run a test to start your history." />
  }

  return (
    <ul role="list" className="flex flex-col gap-10">
      {/* Keyed by when the result was saved, one per test: a new result on top
          leaves the rows below with the keys they had. */}
      {entries.map((entry) => (
        <HistoryCard key={entry.timestamp} entry={entry} />
      ))}
    </ul>
  )
}

export function SpeedHistoryView() {
  const { back } = useNavigation()
  // Undefined until the first read, so the empty placeholder doesn't flash first.
  const { entries, clear } = useSpeedHistory()

  return (
    <div className="page">
      <PageHeader
        title="Speed Test Results"
        description="Results from your past speed tests, newest first."
        onBack={back}
        actions={entries != null && entries.length > 0 ? <HistoryMenu onDelete={clear} /> : undefined}
      />
      {entries != null && <HistoryList entries={entries} />}
    </div>
  )
}
