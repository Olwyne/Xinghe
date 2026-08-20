import { useTranslation } from 'react-i18next'
import type { Task } from './types'

import { TaskItem } from './TaskItem'
import './TaskList.css'

interface TaskListProps {
  tasks: Task[]
  projectColors: Record<string, string>
  fallbackColor: string
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onOpen?: (task: Task) => void
}

export function TaskList({ tasks, projectColors, fallbackColor, onToggle, onDelete, onOpen }: TaskListProps) {
  const { t } = useTranslation()

  const active = tasks.filter((t) => !t.completed)
  const done = tasks.filter((t) => t.completed)

  if (tasks.length === 0) {
    return (
      <div className="task-list__empty">
        {t('tasks.empty')}
      </div>
    )
  }

  return (
    <div className="task-list">
      {active.map((task) => (
        <TaskItem
          key={task.id}
          task={task}
          projectColor={projectColors[task.projectId] ?? fallbackColor}
          onToggle={onToggle}
          onDelete={onDelete}
          onOpen={onOpen}
        />
      ))}
      {done.length > 0 && (
        <>
          <div className="task-list__separator">
            {t('tasks.completed', { count: done.length })}
          </div>
          {done.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              projectColor={projectColors[task.projectId] ?? fallbackColor}
              onToggle={onToggle}
              onDelete={onDelete}
              onOpen={onOpen}
            />
          ))}
        </>
      )}
    </div>
  )
}
