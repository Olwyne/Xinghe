import { useMemo, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useTasks } from '@/hooks/useTasks'
import { useProjects } from '@/hooks/useProjects'
import type { Quadrant, Project, Task } from '@/features/tasks/types'
import { QuadrantCard } from './QuadrantCard'
import { TaskModal, type TaskDraft } from '@/features/tasks/TaskModal'
import './MatrixScreen.css'

const QUADRANTS: Quadrant[] = [1, 2, 3, 4]

export function MatrixScreen() {
  const { user } = useAuth()
  const uid = user?.uid ?? null

  const { tasks, updateTask, toggleComplete, deleteTask } = useTasks(uid, 'all')
  const { projects } = useProjects(uid)

  const projectMap = useMemo<Record<string, Project>>(
    () => Object.fromEntries(projects.map((p) => [p.id, p])),
    [projects],
  )

  const activeTasks = useMemo(() => tasks.filter((t) => !t.completed), [tasks])
  const [openTask, setOpenTask] = useState<Task | null>(null)

  async function handleSaveTask(draft: TaskDraft) {
    if (openTask) {
      await updateTask(openTask.id, {
        title: draft.title,
        notes: draft.notes,
        projectId: draft.projectId,
        quadrant: draft.quadrant,
        dueDate: draft.dueDate,
        subtasks: draft.subtasks,
      })
    }
    setOpenTask(null)
  }

  async function handleDeleteTask() {
    if (openTask) await deleteTask(openTask.id)
    setOpenTask(null)
  }


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
            onOpen={setOpenTask}
          />
        ))}
      </div>

      {openTask && (
        <TaskModal
          task={openTask}
          projects={projects}
          defaultProjectId={openTask.projectId}
          defaultQuadrant={openTask.quadrant}
          onSave={handleSaveTask}
          onDelete={handleDeleteTask}
          onClose={() => setOpenTask(null)}
        />
      )}
    </div>
  )
}
