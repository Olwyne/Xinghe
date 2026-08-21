import type { Session } from '@/features/goals/types'

export interface TimeEntryDraft {
  /** Minuit local du jour choisi. */
  day: number
  /** Minutes depuis minuit. */
  startMinutes: number
  durationMinutes: number
}

export type TimeEntryError = 'duration-too-short' | 'starts-in-future'

/**
 * Deux règles seulement : au moins une minute, pas de début dans le futur.
 * Les chevauchements sont autorisés — le seul qui gêne se verra sur la grille
 * horaire du calendrier, pas dans ce formulaire.
 *
 * null = valide.
 */
export function validateEntry(draft: TimeEntryDraft, now: number): TimeEntryError | null {
  if (!Number.isInteger(draft.durationMinutes) || draft.durationMinutes < 1) {
    return 'duration-too-short'
  }
  if (draftToStartedAt(draft) > now) return 'starts-in-future'
  return null
}

export function draftToStartedAt(draft: TimeEntryDraft): number {
  return draft.day + draft.startMinutes * 60_000
}

/** Décompose une session pour pré-remplir le formulaire. Les secondes sont perdues. */
export function sessionToDraft(session: Session): TimeEntryDraft {
  const start = new Date(session.startedAt)
  const dayStart = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime()
  return {
    day: dayStart,
    startMinutes: Math.round((session.startedAt - dayStart) / 60_000),
    durationMinutes: Math.floor(session.durationMs / 60_000),
  }
}

/** Total tronqué à la minute inférieure, comme l'agrégation des objectifs de projet. */
export function totalMinutes(sessions: Session[]): number {
  const ms = sessions.reduce((sum, s) => sum + s.durationMs, 0)
  return Math.floor(ms / 60_000)
}

/**
 * Le temps suit la tâche : déplacer une tâche vers un autre projet réaffecte
 * ses sessions, sinon son temps resterait compté ailleurs qu'elle.
 */
export function reassignSessions(
  sessions: Session[],
  taskId: string,
  newProjectId: string,
): Session[] {
  return sessions.map((s) =>
    s.taskId === taskId ? { ...s, projectId: newProjectId } : s,
  )
}
