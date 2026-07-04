import { useState } from 'react'
import { splitSpeedMbps, formatLatencyMs } from '../utils/format'
import {
  clearSpeedHistory,
  formatHistoryTimestamp,
  loadSpeedHistory,
  type SpeedHistoryEntry,
} from '../utils/speed-history'
import Subpage from './ui/Subpage'
import { HistoryIcon, TrashIcon } from './Icons'
import './SpeedHistory.css'

interface SpeedHistoryProps {
  readonly onBack: () => void
}

function speedText(mbps: number): string {
  const { value, unit } = splitSpeedMbps(mbps)
  return `${value} ${unit}`
}

function pingText(entry: SpeedHistoryEntry): string {
  return Number.isFinite(entry.latencyMs) && entry.latencyMs < 999
    ? formatLatencyMs(entry.latencyMs)
    : '—'
}

export default function SpeedHistory({ onBack }: SpeedHistoryProps): JSX.Element {
  const [entries, setEntries] = useState<readonly SpeedHistoryEntry[]>(loadSpeedHistory)

  const handleClear = (): void => {
    clearSpeedHistory()
    setEntries([])
  }

  return (
    <Subpage
      title="Speed test history"
      description="Results from your past speed tests, newest first."
      onBack={onBack}
      action={
        entries.length > 0 ? (
          <button
            type="button"
            className="btn-icon btn-icon-secondary"
            onClick={handleClear}
            title="Clear history"
            aria-label="Clear history"
          >
            <TrashIcon size={15} />
          </button>
        ) : undefined
      }
    >
      {entries.length === 0 ? (
        <div className="surface">
          <div className="section-placeholder history-empty">
            <HistoryIcon size={24} className="section-placeholder-icon" />
            <p className="text-hint">
              No tests recorded yet. Results appear here each time you run a speed test.
            </p>
          </div>
        </div>
      ) : (
        <div className="surface history-table">
          <div className="history-row history-head" aria-hidden>
            <span className="field-label">When</span>
            <span className="field-label history-cell">Download</span>
            <span className="field-label history-cell">Upload</span>
            <span className="field-label history-cell history-cell-ping">Ping</span>
          </div>

          {entries.map((entry) => (
            <div key={entry.timestamp} className="history-row">
              <span className="history-when">{formatHistoryTimestamp(entry.timestamp)}</span>
              <span className="history-cell num">{speedText(entry.downloadMbps)}</span>
              <span className="history-cell num">{speedText(entry.uploadMbps)}</span>
              <span className="history-cell history-cell-ping num">{pingText(entry)}</span>
            </div>
          ))}
        </div>
      )}
    </Subpage>
  )
}
