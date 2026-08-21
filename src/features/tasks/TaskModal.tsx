import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { QUADRANT_META } from '@/features/matrix/quadrantMeta'
import type { Project, Quadrant, Subtask, Task } from './types'
import './TaskModal.css'

const QUADRANTS: Quadrant[] = [1, 2, 3, 4]

export interface TaskDraft {
  title: string
  notes: string
  projectId: string
  quadrant: Quadrant
  dueDate: number | null
  subtasks: Subtask[]
}

interface TaskModalProps {
  /** null opens the modal in creation mode. */
  task: Task | null
  projects: Project[]
  defaultProjectId: string
  defaultQuadrant?: Quadrant
  onSave: (draft: TaskDraft) => void
  onDelete?: () => void
  onClose: () => void
}

/** Epoch ms (local midnight) <-> the yyyy-mm-dd an <input type="date"> speaks. */
function toInputDate(ms: number | null | undefined): string {
  if (!ms) return ''
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function fromInputDate(value: string): number | null {
  if (!value) return null
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

export function TaskModal({
  task,
  projects,
  defaultProjectId,
  defaultQuadrant = 2,
  onSave,
  onDelete,
  onClose,
}: TaskModalProps) {
  const { t } = useTranslation()

  const [title, setTitle] = useState(task?.title ?? '')
  const [notes, setNotes] = useState(task?.notes ?? '')
  const [projectId, setProjectId] = useState(task?.projectId ?? defaultProjectId)
  const [quadrant, setQuadrant] = useState<Quadrant>(task?.quadrant ?? defaultQuadrant)
  const [dueDate, setDueDate] = useState(toInputDate(task?.dueDate))
  const [subtasks, setSubtasks] = useState<Subtask[]>(task?.subtasks ?? [])
  const [subtaskDraft, setSubtaskDraft] = useState('')

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function addSubtask() {
    const trimmed = subtaskDraft.trim()
    if (!trimmed) return
    setSubtasks((prev) => [...prev, { id: crypto.randomUUID(), title: trimmed, done: false }])
    setSubtaskDraft('')
  }

  function save() {
    const trimmed = title.trim()
    if (!trimmed) return
    onSave({
      title: trimmed,
      notes: notes.trim(),
      projectId,
      quadrant,
      dueDate: fromInputDate(dueDate),
      subtasks,
    })
  }

  return (
    <div className="tm-overlay" onClick={onClose}>
      <div className="tm-card" onClick={(e) => e.stopPropagation()}>
        <div className="tm-card__header">
          <h2 className="tm-card__title">
            {task ? t('tasks.editTask') : t('tasks.newTask')}
          </h2>
          <button className="tm-card__close" onClick={onClose} aria-label={t('common.close')}>
            ×
          </button>
        </div>

        <label className="tm-field">
          <span className="tm-field__label">{t('tasks.fieldTitle')}</span>
          <input
            className="tm-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save() } }}
            placeholder={t('tasks.addPlaceholder')}
            autoFocus
          />
        </label>

        <label className="tm-field">
          <span className="tm-field__label">{t('tasks.fieldNotes')}</span>
          <textarea
            className="tm-input tm-textarea"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('tasks.notesPlaceholder')}
            rows={2}
          />
        </label>

        <label className="tm-field">
          <span className="tm-field__label">{t('tasks.fieldProject')}</span>
          <div className="tm-chips">
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`tm-chip ${p.id === projectId ? 'tm-chip--active' : ''}`}
                onClick={() => setProjectId(p.id)}
                style={{ '--tm-chip-color': p.color } as React.CSSProperties}
              >
                <span className="tm-chip__dot" style={{ background: p.color }} />
                {p.icon ? `${p.icon} ${p.name}` : p.name}
              </button>
            ))}
          </div>
        </label>

        <label className="tm-field">
          <span className="tm-field__label">{t('tasks.fieldQuadrant')}</span>
          <div className="tm-quadrants">
            {QUADRANTS.map((q) => (
              <button
                key={q}
                type="button"
                className={`tm-quadrant ${q === quadrant ? 'tm-quadrant--active' : ''}`}
                onClick={() => setQuadrant(q)}
                style={{ '--tm-q-color': QUADRANT_META[q].color } as React.CSSProperties}
              >
                <span className="tm-quadrant__label">{t(`matrix.q${q}.label`)}</span>
                <span className="tm-quadrant__sub">{t(`matrix.q${q}.sublabel`)}</span>
              </button>
            ))}
          </div>
        </label>

        <label className="tm-field">
          <span className="tm-field__label">{t('tasks.fieldDueDate')}</span>
          <div className="tm-due">
            <input
              className="tm-input tm-input--date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
            {dueDate && (
              <button type="button" className="tm-due__clear" onClick={() => setDueDate('')}>
                {t('common.clear')}
              </button>
            )}
          </div>
        </label>

        <div className="tm-field">
          <span className="tm-field__label">{t('tasks.fieldSubtasks')}</span>
          <div className="tm-subtasks">
            {subtasks.map((s) => (
              <div key={s.id} className={`tm-subtask ${s.done ? 'tm-subtask--done' : ''}`}>
                <input
                  type="checkbox"
                  checked={s.done}
                  onChange={() =>
                    setSubtasks((prev) =>
                      prev.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)),
                    )
                  }
                />
                <span className="tm-subtask__title">{s.title}</span>
                <button
                  type="button"
                  className="tm-subtask__delete"
                  onClick={() => setSubtasks((prev) => prev.filter((x) => x.id !== s.id))}
                  aria-label={t('common.delete')}
                >
                  ×
                </button>
              </div>
            ))}
            <div className="tm-subtask-add">
              <input
                className="tm-input"
                value={subtaskDraft}
                onChange={(e) => setSubtaskDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSubtask() } }}
                placeholder={t('tasks.subtaskPlaceholder')}
              />
              <button
                type="button"
                className="tm-subtask-add__btn"
                onClick={addSubtask}
                disabled={!subtaskDraft.trim()}
              >
                +
              </button>
            </div>
          </div>
        </div>

        <div className="tm-actions">
          {onDelete && (
            <button type="button" className="tm-actions__delete" onClick={onDelete}>
              {t('common.delete')}
            </button>
          )}
          <div className="tm-actions__right">
            <button type="button" className="tm-actions__cancel" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="tm-actions__save"
              onClick={save}
              disabled={!title.trim()}
            >
              {t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
