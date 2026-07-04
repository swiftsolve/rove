import { useCallback, useEffect, useRef, useState } from 'react'
import type { LanDeviceScan } from '@shared/types'

interface UseDevicesResult {
  readonly scan: LanDeviceScan | null
  readonly isScanning: boolean
  readonly error: string | null
  readonly rescan: () => Promise<void>
}

export function useDevices(enabled: boolean): UseDevicesResult {
  const [scan, setScan] = useState<LanDeviceScan | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const autoRunDoneRef = useRef(false)

  const rescan = useCallback(async (): Promise<void> => {
    if (!window.networkAPI?.getDevices) return

    setIsScanning(true)
    setError(null)

    try {
      const result = await window.networkAPI.getDevices()
      setScan(result)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to scan for devices')
    } finally {
      setIsScanning(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled || autoRunDoneRef.current) return
    autoRunDoneRef.current = true
    void rescan()
  }, [enabled, rescan])

  return { scan, isScanning, error, rescan }
}
