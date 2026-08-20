import type { TargetPeriod } from '@/lib/time'

export type Quadrant = 1 | 2 | 3 | 4

export type { TargetPeriod }

export interface TimeTarget {
  period: TargetPeriod
  /** Minutes visées sur une période complète. 1 à 1440/10080/44640 selon la cadence. */
  targetMinutes: number
}

export interface Project {
  id: string
  name: string
  color: string
  icon: string
  createdAt: number
  order: number
  isInbox: boolean
  /** Cible de temps du projet. Absent ou null = aucune cible. */
  timeTarget?: TimeTarget | null
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
