import { useState, useCallback } from 'react'
import { DEFAULT_SETTINGS, type TimerSettings } from '@/features/timer/timerEngine'

const STORAGE_KEY = 'xinghe-timer-settings'

function loadSettings(): TimerSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch { /* use defaults */ }
  return DEFAULT_SETTINGS
}

function saveSettings(settings: TimerSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export function useTimerSettings() {
  const [settings, setSettingsState] = useState<TimerSettings>(loadSettings)

  const setSettings = useCallback((update: Partial<TimerSettings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...update }
      saveSettings(next)
      return next
    })
  }, [])

  return { settings, setSettings }
}
