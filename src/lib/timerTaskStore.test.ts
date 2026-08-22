import { describe, it, expect, beforeEach } from 'vitest'
import { timerTaskStore } from './timerTaskStore'

beforeEach(() => {
  timerTaskStore.resetForTests()
})

describe('timerTaskStore', () => {
  it('part vide', () => {
    expect(timerTaskStore.getSnapshot()).toBeNull()
  })

  it('retient la tâche demandée', () => {
    timerTaskStore.request('t1')
    expect(timerTaskStore.getSnapshot()).toBe('t1')
  })

  it('prévient ses abonnés', () => {
    let calls = 0
    const unsubscribe = timerTaskStore.subscribe(() => { calls += 1 })
    timerTaskStore.request('t1')
    expect(calls).toBe(1)
    unsubscribe()
    timerTaskStore.request('t2')
    expect(calls).toBe(1)
  })

  it('rend la tâche une seule fois', () => {
    // consume() vide la demande : sans cela, revenir sur l'écran du minuteur
    // resélectionnerait la tâche d'un bloc touché il y a une heure.
    timerTaskStore.request('t1')
    expect(timerTaskStore.consume()).toBe('t1')
    expect(timerTaskStore.consume()).toBeNull()
    expect(timerTaskStore.getSnapshot()).toBeNull()
  })

  it('remplace une demande non consommée', () => {
    timerTaskStore.request('t1')
    timerTaskStore.request('t2')
    expect(timerTaskStore.consume()).toBe('t2')
  })
})
