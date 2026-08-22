import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TaskPicker } from '@/features/timer/TaskPicker'
import { validateEntry, draftToStartedAt, type TimeEntryDraft } from '@/features/tasks/timeEntry'
import type { PeriodRange } from '@/lib/time'
import type { Task } from '@/features/tasks/types'
import type { PlannedBlock } from './types'
import './BlockPanel.css'

export type BlockPanelMode =
  | { kind: 'create'; startedAt: number }
  | { kind: 'edit'; block: PlannedBlock }

interface BlockPanelProps {
  mode: BlockPanelMode
  /** Fenêtre du jour affiché : sert à refuser une écriture hors champ (Task 7 review). */
  range: PeriodRange
  tasks: Task[]
  projectColors: Record<string, string>
  defaultDurationMinutes: number
  onCreate: (task: Task, startedAt: number, durationMs: number) => Promise<void>
  onUpdate: (id: string, startedAt: number, durationMs: number) => Promise<void>
  onRemove: (id: string) => Promise<void>
  onStartTimer: (taskId: string) => void
  onClose: () => void
}

/** Décompose un timestamp en jour local + minutes, la forme que valide timeEntry. */
function toDraft(startedAt: number, durationMinutes: number): TimeEntryDraft {
  const start = new Date(startedAt)
  const day = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime()
  return {
    day,
    startMinutes: Math.round((startedAt - day) / 60_000),
    durationMinutes,
  }
}

function toTimeInput(draft: TimeEntryDraft): string {
  if (!Number.isInteger(draft.startMinutes)) return ''
  const h = String(Math.floor(draft.startMinutes / 60)).padStart(2, '0')
  const m = String(draft.startMinutes % 60).padStart(2, '0')
  return `${h}:${m}`
}

function fromTimeInput(value: string): number {
  // Un champ vidé donne '' : NaN plutôt que 0, pour que validateEntry le
  // refuse au lieu d'écrire un créneau à minuit que personne n'a demandé.
  const [h, m] = value.split(':')
  const hours = Number(h)
  const minutes = Number(m)
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return NaN
  return hours * 60 + minutes
}

export function BlockPanel({
  mode,
  range,
  tasks,
  projectColors,
  defaultDurationMinutes,
  onCreate,
  onUpdate,
  onRemove,
  onStartTimer,
  onClose,
}: BlockPanelProps) {
  const { t } = useTranslation()

  const [draft, setDraft] = useState<TimeEntryDraft>(() =>
    mode.kind === 'create'
      ? toDraft(mode.startedAt, defaultDurationMinutes)
      : toDraft(mode.block.startedAt, Math.round(mode.block.durationMs / 60_000)),
  )
  const [failed, setFailed] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // allowFuture : un bloc planifié est dans le futur par nature. Les autres
  // gardes tiennent, dont celle contre un champ vidé qui produirait NaN.
  const error = validateEntry(draft, Date.now(), { allowFuture: true })

  // `toDraft` ancre `day` sur minuit local, alors que la fenêtre du jour
  // affiché peut démarrer plus tard (réglage dayStart, 04:00 par défaut).
  // Un utilisateur qui tape une heure antérieure à ce décalage désigne donc
  // sans le savoir un instant qui appartient à la fenêtre précédente ; useDayBlocks
  // filtrerait ce bloc hors du jour affiché et il disparaîtrait sans un mot.
  // On refuse l'écriture plutôt que de recadrer la valeur tapée en douce.
  const startedAt = draftToStartedAt(draft)
  const outOfRange = startedAt < range.start || startedAt >= range.end

  const editedTask =
    mode.kind === 'edit' ? tasks.find((task) => task.id === mode.block.taskId) : undefined

  async function handlePick(taskId: string | null) {
    const task = taskId ? tasks.find((candidate) => candidate.id === taskId) : null
    if (!task || error || outOfRange) return
    setFailed(false)
    try {
      await onCreate(task, startedAt, draft.durationMinutes * 60_000)
      onClose()
    } catch {
      setFailed(true)
    }
  }

  async function handleSave() {
    if (mode.kind !== 'edit' || error || outOfRange) return
    setFailed(false)
    try {
      await onUpdate(mode.block.id, startedAt, draft.durationMinutes * 60_000)
      onClose()
    } catch {
      setFailed(true)
    }
  }

  async function handleRemove() {
    if (mode.kind !== 'edit') return
    setFailed(false)
    try {
      await onRemove(mode.block.id)
      onClose()
    } catch {
      setFailed(true)
      setConfirmingDelete(false)
    }
  }

  return (
    <div className="blockpanel">
      <div className="blockpanel__head">
        <span className="blockpanel__title">
          {mode.kind === 'create' ? t('calendar.newBlock') : t('calendar.editBlock')}
        </span>
        <button
          type="button"
          className="blockpanel__close"
          aria-label={t('common.close')}
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      {mode.kind === 'edit' && (
        <p className="blockpanel__task">{editedTask?.title ?? t('calendar.noTask')}</p>
      )}

      <div className="blockpanel__fields">
        <label className="blockpanel__field">
          <span>{t('calendar.blockStart')}</span>
          <input
            type="time"
            value={toTimeInput(draft)}
            onChange={(e) => setDraft({ ...draft, startMinutes: fromTimeInput(e.target.value) })}
          />
        </label>
        <label className="blockpanel__field">
          <span>{t('calendar.blockDuration')}</span>
          <input
            type="number"
            min={1}
            value={Number.isInteger(draft.durationMinutes) ? draft.durationMinutes : ''}
            onChange={(e) =>
              setDraft({
                ...draft,
                durationMinutes: e.target.value === '' ? NaN : Number(e.target.value),
              })
            }
          />
        </label>
      </div>

      {outOfRange && <p className="blockpanel__error">{t('calendar.blockOutOfRange')}</p>}
      {failed && <p className="blockpanel__error">{t('calendar.blockFailed')}</p>}

      {mode.kind === 'create' ? (
        <TaskPicker
          tasks={tasks.filter((task) => !task.completed)}
          projectColors={projectColors}
          selectedId={null}
          onSelect={handlePick}
        />
      ) : (
        <div className="blockpanel__actions">
          <button type="button" disabled={error !== null || outOfRange} onClick={handleSave}>
            {t('common.save')}
          </button>
          <button type="button" onClick={() => onStartTimer(mode.block.taskId)}>
            {t('calendar.startTimer')}
          </button>
          {confirmingDelete ? (
            // Annuler occupe la place de l'ancien bouton Supprimer (même
            // margin-left: auto) : un double-clic qui arme puis retape aux
            // mêmes coordonnées tombe sur Annuler, pas sur la confirmation,
            // qui est décalée à droite. Pattern repris de TaskTimeEntries.
            <>
              <button
                type="button"
                className="blockpanel__cancel"
                onClick={() => setConfirmingDelete(false)}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="blockpanel__danger blockpanel__confirm"
                onClick={handleRemove}
              >
                {t('calendar.confirmDelete')}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="blockpanel__danger"
              onClick={() => setConfirmingDelete(true)}
            >
              {t('common.delete')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
