import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Project } from './types'
import './AddTaskInput.css'

interface AddTaskInputProps {
  projects: Project[]
  projectId: string
  onProjectChange: (id: string) => void
  onAdd: (title: string) => void
  accentColor: string
}

export function AddTaskInput({
  projects,
  projectId,
  onProjectChange,
  onAdd,
  accentColor,
}: AddTaskInputProps) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const [open, setOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  const target = projects.find((p) => p.id === projectId)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!pickerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function submit() {
    const trimmed = value.trim()
    if (!trimmed) return
    onAdd(trimmed)
    setValue('')
  }

  return (
    <form
      className="add-task"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div className="add-task__picker" ref={pickerRef}>
        <button
          className="add-task__picker-btn"
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={t('tasks.chooseProject')}
          title={target ? (target.icon ? `${target.icon} ${target.name}` : target.name) : t('tasks.chooseProject')}
        >
          <span
            className="add-task__picker-dot"
            style={{ background: target?.color ?? accentColor }}
          />
        </button>

        {open && (
          <ul className="add-task__menu" role="listbox">
            {projects.map((p) => (
              <li key={p.id}>
                <button
                  className={`add-task__menu-item ${p.id === projectId ? 'add-task__menu-item--active' : ''}`}
                  type="button"
                  role="option"
                  aria-selected={p.id === projectId}
                  onClick={() => {
                    onProjectChange(p.id)
                    setOpen(false)
                  }}
                >
                  <span className="add-task__menu-dot" style={{ background: p.color }} />
                  {p.icon ? `${p.icon} ${p.name}` : p.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <input
        className="add-task__input"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
        placeholder={t('tasks.addPlaceholder')}
        style={{ '--add-accent': accentColor } as React.CSSProperties}
      />
      <button
        className="add-task__btn"
        type="submit"
        disabled={!value.trim()}
        style={{ background: accentColor }}
        aria-label={t('common.add')}
      >
        +
      </button>
    </form>
  )
}
