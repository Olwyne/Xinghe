/**
 * La tâche qu'un bloc planifié demande au minuteur de prendre.
 *
 * Un store module plutôt qu'un prop traversant l'arbre : la grille du jour est
 * montée sous deux écrans différents, et `selectedTaskId` est un état local de
 * TimerScreen que personne d'autre ne peut fixer. Le store ne remplace pas cet
 * état, il lui fournit une valeur d'amorçage à consommer une fois.
 */
function createTimerTaskStore() {
  let pending: string | null = null
  const listeners = new Set<() => void>()

  function getSnapshot(): string | null {
    return pending
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }

  function request(taskId: string): void {
    pending = taskId
    listeners.forEach((l) => l())
  }

  /** Rend la demande et la vide : elle ne doit servir qu'une fois. */
  function consume(): string | null {
    const taskId = pending
    pending = null
    return taskId
  }

  function resetForTests(): void {
    pending = null
    listeners.clear()
  }

  return { getSnapshot, subscribe, request, consume, resetForTests }
}

export const timerTaskStore = createTimerTaskStore()
