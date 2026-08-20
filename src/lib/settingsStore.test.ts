import { describe, it, expect, beforeEach } from 'vitest'
import { DEFAULT_SETTINGS } from '@/features/timer/timerEngine'
import { settingsStore } from './settingsStore'

// Vitest tourne ici dans l'environnement Node, où `localStorage` n'existe pas
// (vérifié : `node -e "typeof localStorage"` répond `undefined` en v24).
// Le projet interdit d'ajouter jsdom, donc on installe le minimum utilisé.
function installFakeLocalStorage(): void {
  const data = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => { data.set(k, v) },
      removeItem: (k: string) => { data.delete(k) },
      clear: () => { data.clear() },
    },
  })
}

beforeEach(() => {
  installFakeLocalStorage()
  settingsStore.resetForTests()
})

describe('settingsStore', () => {
  it('retourne les réglages par défaut quand le stockage est vide', () => {
    expect(settingsStore.getSnapshot()).toEqual(DEFAULT_SETTINGS)
  })

  it('fusionne un réglage partiel dans le snapshot', () => {
    settingsStore.setSettings({ dayStart: 6 })
    expect(settingsStore.getSnapshot().dayStart).toBe(6)
    expect(settingsStore.getSnapshot().focusMinutes).toBe(DEFAULT_SETTINGS.focusMinutes)
  })

  it('retourne la même référence tant que rien ne change', () => {
    const first = settingsStore.getSnapshot()
    expect(settingsStore.getSnapshot()).toBe(first)
  })

  it('retourne une nouvelle référence après un changement', () => {
    const before = settingsStore.getSnapshot()
    settingsStore.setSettings({ dayStart: 6 })
    expect(settingsStore.getSnapshot()).not.toBe(before)
  })

  it('persiste dans localStorage', () => {
    settingsStore.setSettings({ dayStart: 6 })
    const raw = localStorage.getItem('xinghe-timer-settings')
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw as string).dayStart).toBe(6)
  })

  it('relit le stockage existant au premier snapshot', () => {
    localStorage.setItem('xinghe-timer-settings', JSON.stringify({ dayStart: 9 }))
    settingsStore.resetForTests()
    expect(settingsStore.getSnapshot().dayStart).toBe(9)
  })

  it('notifie tous les abonnés à chaque changement', () => {
    let a = 0
    let b = 0
    settingsStore.subscribe(() => { a += 1 })
    settingsStore.subscribe(() => { b += 1 })
    settingsStore.setSettings({ dayStart: 6 })
    expect(a).toBe(1)
    expect(b).toBe(1)
  })

  it('cesse de notifier après désabonnement', () => {
    let calls = 0
    const unsubscribe = settingsStore.subscribe(() => { calls += 1 })
    settingsStore.setSettings({ dayStart: 6 })
    unsubscribe()
    settingsStore.setSettings({ dayStart: 7 })
    expect(calls).toBe(1)
  })

  it('ignore un contenu de stockage illisible et retombe sur les défauts', () => {
    localStorage.setItem('xinghe-timer-settings', 'pas du json')
    settingsStore.resetForTests()
    expect(settingsStore.getSnapshot()).toEqual(DEFAULT_SETTINGS)
  })
})
