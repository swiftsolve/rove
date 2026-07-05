import { invoke } from '@tauri-apps/api/core'
import { useLiveThroughput } from '@/hooks/useLiveThroughput'
import SpeedReadout from '@/components/traffic/SpeedReadout'
import ThroughputChart from '@/components/traffic/ThroughputChart'
import { ActivityIcon, WifiIcon } from '@/components/ui/Icons'
import './TrayPopover.css'

/** Fire a backend command, swallowing errors (e.g. when previewed in a browser). */
function run(command: string): void {
  void invoke(command).catch(() => {})
}

/**
 * The compact panel shown when the tray icon is clicked. It streams live
 * throughput (reusing the same reference-counted backend subscription as the
 * main window) and offers the two escape hatches a tray app needs: open the
 * full window, or quit for real.
 */
export default function TrayPopover(): JSX.Element {
  const { throughput, history } = useLiveThroughput(true)

  return (
    <div className="tray-popover">
      <header className="tp-header">
        <span className="tp-title">
          <WifiIcon size={14} />
          Beacon
        </span>
        <span className="tp-live">
          <ActivityIcon size={12} />
          Live
        </span>
      </header>

      <div className="tp-readouts">
        <SpeedReadout label="Download" mbps={throughput.downloadMbps} series="down" compact />
        <SpeedReadout label="Upload" mbps={throughput.uploadMbps} series="up" compact />
      </div>

      <div className="tp-chart">
        <ThroughputChart download={history.download} upload={history.upload} />
      </div>

      <footer className="tp-actions">
        <button type="button" className="tp-btn tp-btn-primary" onClick={() => run('open_main_window')}>
          Open Beacon
        </button>
        <button type="button" className="tp-btn tp-btn-quit" onClick={() => run('quit_app')}>
          Quit
        </button>
      </footer>
    </div>
  )
}
