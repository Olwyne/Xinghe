import { useMemo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useTasks } from '@/hooks/useTasks'
import { useProjects } from '@/hooks/useProjects'
import type { Quadrant, Project } from '@/features/tasks/types'
import { QuadrantCard } from './QuadrantCard'
import './MatrixScreen.css'

const QUADRANTS: Quadrant[] = [1, 2, 3, 4]

export function MatrixScreen() {
  const { user } = useAuth()
  const uid = user?.uid ?? null

  const { tasks, toggleComplete, deleteTask } = useTasks(uid, 'all')
  const { projects } = useProjects(uid)

  const projectMap = useMemo<Record<string, Project>>(
    () => Object.fromEntries(projects.map((p) => [p.id, p])),
    [projects],
  )

  const activeTasks = useMemo(() => tasks.filter((t) => !t.completed), [tasks])

  return (
    <div className="matrix-screen">
      <div className="matrix-grid">
        {QUADRANTS.map((q) => (
          <QuadrantCard
            key={q}
            quadrant={q}
            tasks={activeTasks.filter((t) => t.quadrant === q)}
            projectMap={projectMap}
            onToggle={toggleComplete}
            onDelete={deleteTask}
          />
        ))}
      </div>
    </div>
  )
}
