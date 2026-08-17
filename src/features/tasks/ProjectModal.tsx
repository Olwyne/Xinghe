import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Project } from './types'
import { PROJECT_COLORS } from './constants'
import './ProjectModal.css'

interface ProjectModalProps {
  projects: Project[]
  onAdd: (name: string, color: string, icon: string) => void
  onUpdate: (id: string, updates: Partial<Pick<Project, 'name' | 'color' | 'icon'>>) => void
  onDelete: (id: string) => void
  onClose: () => void
}

function ProjectRow({
  project,
  onUpdate,
  onDelete,
}: {
  project: Project
  onUpdate: ProjectModalProps['onUpdate']
  onDelete: ProjectModalProps['onDelete']
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(project.name)
  const [color, setColor] = useState(project.color)

  function save() {
    const trimmed = name.trim()
    if (!trimmed) return
    onUpdate(project.id, { name: trimmed, color })
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="pm-row pm-row--editing">
        <input
          className="pm-row__input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          autoFocus
        />
        <div className="pm-row__colors">
          {PROJECT_COLORS.map((c) => (
            <button
              key={c}
              className={`pm-row__swatch ${c === color ? 'pm-row__swatch--active' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={c}
            />
          ))}
        </div>
        <div className="pm-row__actions">
          <button className="pm-row__save" onClick={save}>{t('common.save')}</button>
          <button className="pm-row__cancel" onClick={() => setEditing(false)}>{t('common.cancel')}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="pm-row">
      <span className="pm-row__dot" style={{ background: project.color }} />
      <span className="pm-row__icon">{project.icon}</span>
      <span className="pm-row__name">{project.name}</span>
      <button className="pm-row__edit" onClick={() => setEditing(true)}>
        {t('common.edit')}
      </button>
      {!project.isInbox && (
        <button className="pm-row__del" onClick={() => onDelete(project.id)}>
          {t('common.delete')}
        </button>
      )}
    </div>
  )
}

export function ProjectModal({ projects, onAdd, onUpdate, onDelete, onClose }: ProjectModalProps) {
  const { t } = useTranslation()
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState<string>(PROJECT_COLORS[0])

  function handleAdd() {
    const trimmed = newName.trim()
    if (!trimmed) return
    onAdd(trimmed, newColor, '')
    setNewName('')
    setNewColor(PROJECT_COLORS[0])
  }

  return (
    <div className="pm-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pm-card">
        <div className="pm-card__header">
          <h2 className="pm-card__title">{t('projects.manage')}</h2>
          <button className="pm-card__close" onClick={onClose} aria-label={t('common.close')}>×</button>
        </div>

        <div className="pm-card__list">
          {projects.map((p) => (
            <ProjectRow key={p.id} project={p} onUpdate={onUpdate} onDelete={onDelete} />
          ))}
        </div>

        <div className="pm-card__new">
          <input
            className="pm-card__new-input"
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder={t('projects.newPlaceholder')}
          />
          <div className="pm-row__colors">
            {PROJECT_COLORS.map((c) => (
              <button
                key={c}
                className={`pm-row__swatch ${c === newColor ? 'pm-row__swatch--active' : ''}`}
                style={{ background: c }}
                onClick={() => setNewColor(c)}
                aria-label={c}
              />
            ))}
          </div>
          <button
            className="pm-card__add-btn"
            onClick={handleAdd}
            disabled={!newName.trim()}
          >
            {t('projects.create')}
          </button>
        </div>
      </div>
    </div>
  )
}
