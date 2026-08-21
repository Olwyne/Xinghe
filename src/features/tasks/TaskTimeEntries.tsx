import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import { useTaskSessions } from '@/hooks/useTaskSessions'
import { formatMinutesToHours } from '@/lib/time'
import type { Task } from './types'
import type { Session } from '@/features/goals/types'
import {
  validateEntry,
  sessionToDraft,
  type TimeEntryDraft,
  type TimeEntryError,
} from './timeEntry'
import './TaskTimeEntries.css'

const ERROR_KEYS: Record<TimeEntryError, string> = {
  'duration-too-short': 'tasks.errorDurationTooShort',
  'starts-in-future': 'tasks.errorStartsInFuture',
}

function todayMidnight(): number {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function emptyDraft(): TimeEntryDraft {
  return { day: todayMidnight(), startMinutes: 9 * 60, durationMinutes: 25 }
}

/** `2026-03-10` pour un <input type="date">, en heure locale. */
function toDateInput(day: number): string {
  const d = new Date(day)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const date = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${date}`
}

function fromDateInput(value: string): number {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

/** `09:15` pour un <input type="time">. */
function toTimeInput(startMinutes: number): string {
  const h = String(Math.floor(startMinutes / 60)).padStart(2, '0')
  const m = String(startMinutes % 60).padStart(2, '0')
  return `${h}:${m}`
}

function fromTimeInput(value: string): number {
  const [h, m] = value.split(':').map(Number)
  return h * 60 + m
}

function formatDay(startedAt: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(startedAt))
}

function formatRange(session: Session, locale: string): string {
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' })
  const end = new Date(session.startedAt + session.durationMs)
  return `${time.format(new Date(session.startedAt))} → ${time.format(end)}`
}

export function TaskTimeEntries({ task }: { task: Task }) {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const uid = user?.uid ?? null
  const { sessions, totalMinutes, loading, addEntry, updateEntry, deleteEntry } =
    useTaskSessions(uid, task.id)

  /** null = aucun formulaire ouvert ; 'new' = ajout ; sinon l'id modifié. */
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<TimeEntryDraft>(emptyDraft)
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)
  const [saveFailed, setSaveFailed] = useState(false)

  const error = validateEntry(draft, Date.now())

  function openNew() {
    setDraft(emptyDraft())
    setSaveFailed(false)
    setConfirmingDelete(null)
    setEditing('new')
  }

  function openEdit(session: Session) {
    setDraft(sessionToDraft(session))
    setSaveFailed(false)
    setConfirmingDelete(null)
    setEditing(session.id)
  }

  async function save() {
    if (error) return
    try {
      if (editing === 'new') await addEntry(draft, task.projectId)
      else if (editing) await updateEntry(editing, draft)
      setEditing(null)
      setSaveFailed(false)
    } catch {
      // Le formulaire reste ouvert avec la saisie intacte.
      setSaveFailed(true)
    }
  }

  async function remove(id: string) {
    setSaveFailed(false)
    try {
      await deleteEntry(id)
      setConfirmingDelete(null)
    } catch {
      setSaveFailed(true)
    }
  }

  const form = (
    <div className="tte-form">
      <label className="tte-form__field">
        <span>{t('tasks.entryDate')}</span>
        <input
          type="date"
          value={toDateInput(draft.day)}
          onChange={(e) => setDraft({ ...draft, day: fromDateInput(e.target.value) })}
        />
      </label>
      <label className="tte-form__field">
        <span>{t('tasks.entryStart')}</span>
        <input
          type="time"
          value={toTimeInput(draft.startMinutes)}
          onChange={(e) => setDraft({ ...draft, startMinutes: fromTimeInput(e.target.value) })}
        />
      </label>
      <label className="tte-form__field">
        <span>{t('tasks.entryDuration')}</span>
        <span className="tte-form__duration">
          <input
            type="number"
            min="0"
            max="99"
            value={Math.floor(draft.durationMinutes / 60)}
            onChange={(e) =>
              setDraft({
                ...draft,
                durationMinutes: (parseInt(e.target.value, 10) || 0) * 60 + (draft.durationMinutes % 60),
              })
            }
          />
          <span>{t('tasks.entryHours')}</span>
          <input
            type="number"
            min="0"
            max="59"
            value={draft.durationMinutes % 60}
            onChange={(e) =>
              setDraft({
                ...draft,
                durationMinutes:
                  Math.floor(draft.durationMinutes / 60) * 60 + (parseInt(e.target.value, 10) || 0),
              })
            }
          />
          <span>{t('tasks.entryMinutes')}</span>
        </span>
      </label>

      {error && <p className="tte-form__error">{t(ERROR_KEYS[error])}</p>}
      {saveFailed && <p className="tte-form__error">{t('tasks.entrySaveFailed')}</p>}

      <div className="tte-form__actions">
        <button type="button" onClick={save} disabled={!!error}>{t('common.save')}</button>
        <button type="button" onClick={() => setEditing(null)}>{t('common.cancel')}</button>
      </div>
    </div>
  )

  return (
    <section className="tte">
      <div className="tte__header">
        <span className="tte__title">{t('tasks.timeEntries')}</span>
        <span className="tte__total">{formatMinutesToHours(totalMinutes)}</span>
        <button type="button" className="tte__add" onClick={openNew}>
          {t('tasks.addEntry')}
        </button>
      </div>

      {editing === 'new' && form}

      {loading ? (
        <div className="tte__skeletons">
          <div className="tte__skeleton" />
          <div className="tte__skeleton" />
        </div>
      ) : sessions.length === 0 ? (
        <p className="tte__empty">{t('tasks.noEntries')}</p>
      ) : (
        <ul className="tte__list">
          {sessions.map((s) =>
            editing === s.id ? (
              <li key={s.id}>{form}</li>
            ) : (
              <li key={s.id} className="tte__row">
                <span className="tte__day">{formatDay(s.startedAt, i18n.language)}</span>
                <span className="tte__range">{formatRange(s, i18n.language)}</span>
                <span className="tte__duration">
                  {formatMinutesToHours(Math.floor(s.durationMs / 60_000))}
                </span>
                <span className="tte__origin">
                  {s.origin !== 'manual' && <span title={t('tasks.fromTimer')}>⏱</span>}
                  {s.editedAt && <span title={t('tasks.edited')}>✎</span>}
                </span>
                {confirmingDelete === s.id ? (
                  <>
                    <button type="button" className="tte__confirm" onClick={() => remove(s.id)}>
                      {t('tasks.confirmDeleteEntry')}
                    </button>
                    <button
                      type="button"
                      className="tte__cancel"
                      onClick={() => {
                        setConfirmingDelete(null)
                        setSaveFailed(false)
                      }}
                    >
                      {t('common.cancel')}
                    </button>
                    {saveFailed && <p className="tte-form__error">{t('tasks.entrySaveFailed')}</p>}
                  </>
                ) : (
                  <>
                    <button type="button" className="tte__edit" onClick={() => openEdit(s)}>
                      {t('common.edit')}
                    </button>
                    <button
                      type="button"
                      className="tte__delete"
                      onClick={() => {
                        setConfirmingDelete(s.id)
                        setSaveFailed(false)
                      }}
                    >
                      ✕
                    </button>
                  </>
                )}
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  )
}
