import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Project, TargetPeriod } from './types'
import { PROJECT_COLORS } from './constants'
import { isValidTarget, parseTargetMinutes, MAX_MINUTES } from './targetValidation'
import { formatMinutesToHours } from '@/lib/time'
import './ProjectModal.css'

interface ProjectModalProps {
  projects: Project[]
  onAdd: (name: string, color: string, icon: string) => void
  onUpdate: (
    id: string,
    updates: Partial<Pick<Project, 'name' | 'color' | 'icon' | 'timeTarget'>>,
  ) => void
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
  const [period, setPeriod] = useState<TargetPeriod>(project.timeTarget?.period ?? 'week')
  const [hours, setHours] = useState(String(Math.floor((project.timeTarget?.targetMinutes ?? 0) / 60)))
  const [mins, setMins] = useState(String((project.timeTarget?.targetMinutes ?? 0) % 60))

  const totalMinutes = parseTargetMinutes(hours, mins)
  const targetValid = totalMinutes === 0 || isValidTarget(period, totalMinutes)
  // totalMinutes is 0 only in the silent "no target" case, handled above; when
  // !targetValid it is never 0, so exactly one of these branches ever fires.
  const targetTooSmall = !targetValid && totalMinutes < 1
  const errorId = `pm-target-error-${project.id}`

  function save() {
    const trimmed = name.trim()
    if (!trimmed || !targetValid) return
    onUpdate(project.id, {
      name: trimmed,
      color,
      timeTarget: totalMinutes > 0 ? { period, targetMinutes: totalMinutes } : null,
    })
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
        <div className="pm-row__target">
          <span className="pm-row__target-label">{t('goals.setTarget')}</span>
          <div className="pm-row__target-inputs">
            <input
              className="pm-row__target-num"
              type="number"
              min="0"
              max="999"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              aria-label={t('goals.targetHours')}
              aria-describedby={!targetValid ? errorId : undefined}
              aria-invalid={!targetValid}
            />
            <span>{t('goals.targetHours')}</span>
            <input
              className="pm-row__target-num"
              type="number"
              min="0"
              max="59"
              value={mins}
              onChange={(e) => setMins(e.target.value)}
              aria-label={t('goals.targetMinutes')}
              aria-describedby={!targetValid ? errorId : undefined}
              aria-invalid={!targetValid}
            />
            <span>{t('goals.targetMinutes')}</span>
          </div>
          <div className="pm-row__periods">
            {(['day', 'week', 'month'] as TargetPeriod[]).map((p) => (
              <button
                key={p}
                className={`pm-row__period ${p === period ? 'pm-row__period--active' : ''}`}
                onClick={() => setPeriod(p)}
              >
                {t(`goals.period.${p}`)}
              </button>
            ))}
          </div>
          {!targetValid && (
            <p className="pm-row__target-error" id={errorId}>
              {targetTooSmall
                ? t('goals.targetTooSmall')
                : t('goals.targetTooLarge', { max: formatMinutesToHours(MAX_MINUTES[period]) })}
            </p>
          )}
          <button
            className="pm-row__target-clear"
            onClick={() => { setHours('0'); setMins('0') }}
          >
            {t('goals.noTarget')}
          </button>
        </div>
        <div className="pm-row__actions">
          <button className="pm-row__save" onClick={save} disabled={!targetValid}>
            {t('common.save')}
          </button>
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
