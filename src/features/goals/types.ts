export interface DailyGoal {
  id: string
  targetMinutes: number
  createdAt: number
}

export interface Session {
  id: string
  projectId: string
  startedAt: number
  durationMs: number
  type: 'focus'
}
