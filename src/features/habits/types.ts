export interface Habit {
  id: string
  name: string
  icon: string
  createdAt: number
  order: number
}

export interface HabitEntry {
  id: string
  habitId: string
  date: string
  completedAt: number
}
