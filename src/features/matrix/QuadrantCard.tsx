import type { Task, Project, Quadrant } from '@/features/tasks/types'
import { TaskItem } from '@/features/tasks/TaskItem'
import './QuadrantCard.css'

interface QuadrantMeta {
  label: string
  sublabel: string
  color: string
}

export const QUADRANT_META: Record<Quadrant, QuadrantMeta> = {
  1: { label: 'Faire', sublabel: 'Urgent + Important', color: 'var(--xh-focus)' },
  2: { label: 'Planifier', sublabel: 'Important, pas urgent', color: 'var(--xh-short)' },
  3: { label: 'Déléguer', sublabel: 'Urgent, pas important', color: 'var(--xh-long)' },
  4: { label: 'Éliminer', sublabel: 'Ni urgent ni important', color: 'var(--xh-text-faint)' },
}

interface QuadrantCardProps {
  quadrant: Quadrant
  tasks: Task[]
  projectMap: Record<string, Project>
  onToggle: (id: string) => void
  onDelete: (id: string) => void
}

export function QuadrantCard({ quadrant, tasks, projectMap, onToggle, onDelete }: QuadrantCardProps) {
  const meta = QUADRANT_META[quadrant]

  return (
    <div className="qcard" style={{ '--qcard-color': meta.color } as React.CSSProperties}>
      <div className="qcard__header">
        <div className="qcard__labels">
          <span className="qcard__label">{meta.label}</span>
          <span className="qcard__sublabel">{meta.sublabel}</span>
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
            />
          ))
        }
      </div>
    </div>
  )
}
