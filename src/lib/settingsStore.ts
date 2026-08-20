import { DEFAULT_SETTINGS, type TimerSettings } from '@/features/timer/timerEngine'

const STORAGE_KEY = 'xinghe-timer-settings'

function loadSettings(): TimerSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch { /* use defaults */ }
  return DEFAULT_SETTINGS
}

/**
 * Source unique des réglages du minuteur.
 *
 * Un store module plutôt qu'un état local par composant : `dayStart` est lu par
 * trois hooks de sessions en plus de l'écran des réglages, et un `useState` par
 * appelant leur donnait chacun une copie figée au montage.
 */
function createSettingsStore() {
  let snapshot: TimerSettings | null = null
  const listeners = new Set<() => void>()

  function getSnapshot(): TimerSettings {
    if (snapshot === null) snapshot = loadSettings()
    return snapshot
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }

  function setSettings(update: Partial<TimerSettings>): void {
    snapshot = { ...getSnapshot(), ...update }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
    } catch { /* quota ou navigation privée : l'état en mémoire suffit */ }
    listeners.forEach((l) => l())
  }

  /** Vide le snapshot mémorisé pour que le test suivant relise le stockage. */
  function resetForTests(): void {
    snapshot = null
  }

  return { getSnapshot, subscribe, setSettings, resetForTests }
}

export const settingsStore = createSettingsStore()
