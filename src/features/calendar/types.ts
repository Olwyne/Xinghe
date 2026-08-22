/**
 * Une intention : faire telle tâche à telle heure.
 *
 * Distinct d'une `Session`, qui atteste d'un temps vécu. Planifier en créant
 * des sessions à l'avance ferait compter le prévu comme du travail fait.
 */
export interface PlannedBlock {
  id: string
  /** Obligatoire : un bloc est toujours l'intention de faire une tâche. */
  taskId: string
  /** Celui de la tâche : le temps d'une tâche est compté dans son projet. */
  projectId: string
  startedAt: number
  durationMs: number
  createdAt: number
}
