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
}
