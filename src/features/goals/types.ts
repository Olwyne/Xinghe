export interface DailyGoal {
  id: string
  targetMinutes: number
  createdAt: number
}

export interface Session {
  id: string
  projectId: string
  taskId?: string | null
  startedAt: number
  durationMs: number
  type: 'focus'
  /** Fin réelle de la session. Absent sur les documents créés avant ce champ. */
  endedAt?: number
  /** Comment l'entrée est née. Absent sur les documents antérieurs = 'timer'. */
  origin?: 'timer' | 'manual'
  /** Dernière correction manuelle. Absent = jamais corrigée. */
  editedAt?: number
}
