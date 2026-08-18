import { useState } from 'react'
import type { Task } from './types'
import './TaskItem.css'

interface TaskItemProps {
  task: Task
  projectColor: string
  onToggle: (id: string) => void
  onDelete: (id: string) => void
}

export function TaskItem({ task, projectColor, onToggle, onDelete }: TaskItemProps) {
  const [removing, setRemoving] = useState(false)

  function handleDelete() {
    setRemoving(true)
    setTimeout(() => onDelete(task.id), 200)
  }

  return (
    <div className={`task-item ${task.completed ? 'task-item--done' : ''} ${removing ? 'task-item--removing' : ''}`}>
      <button
        className="task-item__check"
        onClick={() => onToggle(task.id)}
        aria-label={task.completed ? 'Marquer non fait' : 'Marquer fait'}
        style={{ borderColor: projectColor }}
      >
        {task.completed && (
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none">
            <path d="M3 8.5l3.5 3.5 6.5-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <span className="task-item__title">{task.title}</span>
      <button
        className="task-item__delete"
        onClick={handleDelete}
        aria-label="Supprimer"
      >
        ×
      </button>
    </div>
  )
}
