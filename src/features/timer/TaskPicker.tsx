import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Task } from '@/features/tasks/types'
import './TaskPicker.css'

interface TaskPickerProps {
  tasks: Task[]
  projectColors: Record<string, string>
  selectedId: string | null
  onSelect: (taskId: string | null) => void
  /** Coupe l'ouverture du menu : la saisie associée n'est pas exploitable en l'état. */
  disabled?: boolean
}

export function TaskPicker({
  tasks,
  projectColors,
  selectedId,
  onSelect,
  disabled = false,
}: TaskPickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = tasks.find((t) => t.id === selectedId)

  // La saisie devient invalide pendant que le menu est ouvert (ex. l'heure
  // tapée passe hors champ) : on referme plutôt que de laisser un choix
  // possible sur un menu que handlePick va de toute façon ignorer.
  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  useEffect(() => {
    if (!open) return
    function onDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const color = selected ? (projectColors[selected.projectId] ?? 'var(--xh-text-faint)') : 'var(--xh-text-faint)'

  return (
    <div className="task-picker" ref={ref}>
      <button
        className="task-picker__btn"
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        style={{ '--tp-color': color } as React.CSSProperties}
      >
        {selected
          ? (
            <>
              <span className="task-picker__dot" style={{ background: color }} />
              <span className="task-picker__name">{selected.title}</span>
            </>
          )
          : <span className="task-picker__placeholder">{t('timer.noTask')}</span>}
        <span className="task-picker__chevron">▾</span>
      </button>

      {open && (
        <ul className="task-picker__menu" role="listbox">
          <li>
            <button
              className={`task-picker__item ${!selectedId ? 'task-picker__item--active' : ''}`}
              type="button"
              onClick={() => { onSelect(null); setOpen(false) }}
            >
              {t('timer.noTask')}
            </button>
          </li>
          {tasks.map((task) => {
            const c = projectColors[task.projectId] ?? 'var(--xh-text-faint)'
            return (
              <li key={task.id}>
                <button
                  className={`task-picker__item ${task.id === selectedId ? 'task-picker__item--active' : ''}`}
                  type="button"
                  onClick={() => { onSelect(task.id); setOpen(false) }}
                >
                  <span className="task-picker__item-dot" style={{ background: c }} />
                  {task.title}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
