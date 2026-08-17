import { useState, useEffect } from 'react'
import { type ConnectivityStatus, getOnlineStatus, onConnectivityChange } from '@/lib/connectivity'

export function useConnectivity(): ConnectivityStatus {
  const [status, setStatus] = useState<ConnectivityStatus>(
    getOnlineStatus() ? 'synced' : 'offline'
  )

  useEffect(() => {
    return onConnectivityChange((online) => {
      setStatus(online ? 'synced' : 'offline')
    })
  }, [])

  return status
}
