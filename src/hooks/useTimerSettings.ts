import { useSyncExternalStore } from 'react'
import { settingsStore } from '@/lib/settingsStore'

/**
 * Réglages du minuteur, partagés par tous les appelants.
 *
 * La signature est inchangée : les cinq consommateurs existants n'ont rien à
 * modifier, mais ils voient désormais tous le même état.
 */
export function useTimerSettings() {
  const settings = useSyncExternalStore(settingsStore.subscribe, settingsStore.getSnapshot)
  return { settings, setSettings: settingsStore.setSettings }
}
