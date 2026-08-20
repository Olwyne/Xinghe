import { useTranslation } from 'react-i18next'
import type { Task, Project, Quadrant } from '@/features/tasks/types'
import { TaskItem } from '@/features/tasks/TaskItem'
import { QUADRANT_META } from './quadrantMeta'
import './QuadrantCard.css'

interface QuadrantCardProps {
  quadrant: Quadrant
  tasks: Task[]
  projectMap: Record<string, Project>
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onOpen: (task: Task) => void
}

export function QuadrantCard({ quadrant, tasks, projectMap, onToggle, onDelete, onOpen }: QuadrantCardProps) {
  const { t } = useTranslation()
  const meta = QUADRANT_META[quadrant]

  return (
    <div className="qcard" style={{ '--qcard-color': meta.color } as React.CSSProperties}>
      <div className="qcard__header">
        <div className="qcard__labels">
          <span className="qcard__label">{t(`matrix.q${quadrant}.label`)}</span>
          <span className="qcard__sublabel">{t(`matrix.q${quadrant}.sublabel`)}</span>
        </div>
        {tasks.length > 0 && (
          <span className="qcard__count">{tasks.length}</span>
        )}
      </div>
      <div className="qcard__tasks">
        {tasks.length === 0
          ? <div className="qcard__empty">—</div>
          : tasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              projectColor={projectMap[task.projectId]?.color ?? 'var(--xh-text-faint)'}
              onToggle={onToggle}
              onDelete={onDelete}
              onOpen={onOpen}
            />
          ))
        }
      </div>
    </div>
  )
}
