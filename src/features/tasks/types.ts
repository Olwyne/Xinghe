export type Quadrant = 1 | 2 | 3 | 4

export interface Project {
  id: string
  name: string
  color: string
  icon: string
  createdAt: number
  order: number
  isInbox: boolean
}

export interface Task {
  id: string
  title: string
  projectId: string
  quadrant: Quadrant
  completed: boolean
  completedAt: number | null
  createdAt: number
  order: number
  notes: string
}
