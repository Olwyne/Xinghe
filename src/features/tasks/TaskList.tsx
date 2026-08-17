import { useTranslation } from 'react-i18next'
import type { Task } from './types'
import { TaskItem } from './TaskItem'
import './TaskList.css'

interface TaskListProps {
  tasks: Task[]
  projectColor: string
  onToggle: (id: string) => void
  onDelete: (id: string) => void
}

export function TaskList({ tasks, projectColor, onToggle, onDelete }: TaskListProps) {
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
          projectColor={projectColor}
          onToggle={onToggle}
          onDelete={onDelete}
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
              projectColor={projectColor}
              onToggle={onToggle}
              onDelete={onDelete}
            />
          ))}
        </>
      )}
    </div>
  )
}
