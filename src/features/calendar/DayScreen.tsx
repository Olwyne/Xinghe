import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import { useTasks } from '@/hooks/useTasks'
import { useProjects } from '@/hooks/useProjects'
import { TaskModal, type TaskDraft } from '@/features/tasks/TaskModal'
import { DayGrid } from './DayGrid'
import type { Task } from '@/features/tasks/types'

export function DayScreen() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const uid = user?.uid ?? null
  const { projects } = useProjects(uid)
  const { updateTask } = useTasks(uid, 'all')
  const [openTask, setOpenTask] = useState<Task | null>(null)

  async function handleSave(draft: TaskDraft) {
    if (!openTask) return
    await updateTask(openTask.id, draft)
    setOpenTask(null)
  }

  return (
    <div className="day-screen">
      <h1 className="day-screen__title">{t('calendar.day')}</h1>
      <DayGrid onOpenTask={(task) => setOpenTask(task)} />

      {openTask && (
        <TaskModal
          task={openTask}
          projects={projects}
          defaultProjectId={openTask.projectId}
          onSave={handleSave}
          onClose={() => setOpenTask(null)}
        />
      )}
    </div>
  )
}
