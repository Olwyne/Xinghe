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

export interface Subtask {
  id: string
  title: string
  done: boolean
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
  /** Epoch ms at local midnight of the due day, or null when unscheduled. */
  dueDate?: number | null
  subtasks?: Subtask[]
  /** Total focus time spent on this task in ms (summed from sessions). */
  spentMs?: number
}
