import type { Session } from '@/features/goals/types'

export interface TimeEntryDraft {
  /** Minuit local du jour choisi. */
  day: number
  /** Minutes depuis minuit. */
  startMinutes: number
  durationMinutes: number
}

export type TimeEntryError = 'duration-too-short' | 'starts-in-future' | 'invalid-time'

export interface ValidateEntryOptions {
  /** Un bloc planifié est dans le futur par nature ; une session mesurée, jamais. */
  allowFuture?: boolean
}

/**
 * Trois règles : au moins une minute, un jour et une heure de début valides
 * (un champ date/heure vidé par l'utilisateur produit NaN), pas de début
 * dans le futur (sauf pour un bloc planifié). Les chevauchements sont autorisés —
 * le seul qui gêne se verra sur la grille horaire du calendrier, pas dans ce formulaire.
 *
 * null = valide.
 */
export function validateEntry(
  draft: TimeEntryDraft,
  now: number,
  options: ValidateEntryOptions = {},
): TimeEntryError | null {
  if (!Number.isInteger(draft.durationMinutes) || draft.durationMinutes < 1) {
    return 'duration-too-short'
  }
  if (
    !Number.isInteger(draft.day) ||
    !Number.isInteger(draft.startMinutes) ||
    draft.startMinutes < 0 ||
    draft.startMinutes > 1439
  ) {
    return 'invalid-time'
  }
  if (!options.allowFuture && draftToStartedAt(draft) > now) return 'starts-in-future'
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
