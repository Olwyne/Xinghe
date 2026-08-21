import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import { useTasks } from '@/hooks/useTasks'
import { useProjects } from '@/hooks/useProjects'
import { useDaySessions } from '@/hooks/useDaySessions'
import { TaskPicker } from '@/features/timer/TaskPicker'
import { layoutDaySessions } from './dayLayout'
import type { Task } from '@/features/tasks/types'
import './DayGrid.css'

const HOUR = 3_600_000

interface DayGridProps {
  /** Ouvre le modal d'une tâche : toute l'édition d'une session y vit déjà. */
  onOpenTask: (task: Task) => void
}

export function DayGrid({ onOpenTask }: DayGridProps) {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const uid = user?.uid ?? null

  const [reference, setReference] = useState(() => Date.now())
  const { sessions, range, loading, attachToTask } = useDaySessions(uid, reference)
  const { tasks } = useTasks(uid, 'all')
  const { projects } = useProjects(uid)

  const [attaching, setAttaching] = useState<string | null>(null)
  const [attachFailed, setAttachFailed] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const projectColors = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p.color])),
    [projects],
  )
  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks])
  const blocks = useMemo(() => layoutDaySessions(sessions, range), [sessions, range])

  const hourCount = Math.round((range.end - range.start) / HOUR)
  const hours = Array.from({ length: hourCount }, (_, i) => range.start + i * HOUR)

  const dayLabel = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(range.start))

  const hourFormat = new Intl.DateTimeFormat(i18n.language, {
    hour: '2-digit',
    minute: '2-digit',
  })

  const showNowLine = now >= range.start && now < range.end
  const nowTop = ((now - range.start) / (range.end - range.start)) * 100

  // Ne tourne que si le jour affiché est aujourd'hui : la ligne "now" n'est
  // rendue que dans ce cas, donc un intervalle sur un autre jour serait pur
  // gaspillage. Se coupe au changement de jour et au démontage.
  useEffect(() => {
    if (!showNowLine) return
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [showNowLine, range.start, range.end])

  function navigate(next: number) {
    // Repartir sans panneau ni message d'échec : ils pointent sur une session
    // qui n'est plus à l'écran une fois qu'on a changé de jour.
    setAttaching(null)
    setAttachFailed(false)
    setReference(next)
  }

  function openAttach(sessionId: string) {
    // Repartir sans message d'échec : celui d'une tentative précédente ne doit
    // pas s'accrocher à une session différente, ni à une réouverture du panneau.
    setAttachFailed(false)
    setAttaching(sessionId)
  }

  async function handleSelect(sessionId: string, taskId: string | null) {
    const task = taskId ? tasksById.get(taskId) : null
    if (!task) {
      setAttaching(null)
      setAttachFailed(false)
      return
    }
    try {
      await attachToTask(sessionId, task)
      setAttaching(null)
      setAttachFailed(false)
    } catch {
      setAttachFailed(true)
    }
  }

  return (
    <section className="daygrid">
      <div className="daygrid__nav">
        <button
          type="button"
          className="daygrid__navbtn"
          aria-label={t('calendar.previousDay')}
          onClick={() => navigate(reference - 24 * HOUR)}
        >
          ‹
        </button>
        <span className="daygrid__date">{dayLabel}</span>
        <button
          type="button"
          className="daygrid__navbtn"
          aria-label={t('calendar.nextDay')}
          onClick={() => navigate(reference + 24 * HOUR)}
        >
          ›
        </button>
        <button
          type="button"
          className="daygrid__today"
          onClick={() => navigate(Date.now())}
        >
          {t('calendar.today')}
        </button>
      </div>

      {attachFailed && <p className="daygrid__error">{t('calendar.attachFailed')}</p>}

      <div className="daygrid__body">
        <div className="daygrid__ruler">
          {hours.map((ts) => (
            <div key={ts} className="daygrid__hour">
              <span className="daygrid__hourlabel">{hourFormat.format(new Date(ts))}</span>
            </div>
          ))}
        </div>

        <div className="daygrid__canvas">
          {hours.map((ts) => (
            <div key={ts} className="daygrid__line" />
          ))}

          {showNowLine && (
            <div className="daygrid__now" style={{ top: `${nowTop}%` }} />
          )}

          {loading ? (
            <>
              <div className="daygrid__skeleton" style={{ top: '20%', height: '8%' }} />
              <div className="daygrid__skeleton" style={{ top: '45%', height: '12%' }} />
            </>
          ) : blocks.length === 0 ? (
            <p className="daygrid__empty">{t('calendar.emptyDay')}</p>
          ) : (
            blocks.map((block) => {
              const task = block.session.taskId ? tasksById.get(block.session.taskId) : undefined
              const color = projectColors[block.session.projectId] ?? 'var(--xh-text-faint)'
              const width = 100 / block.columnCount
              return (
                <button
                  type="button"
                  key={block.session.id}
                  className={`daygrid__block ${task ? '' : 'daygrid__block--orphan'} ${
                    block.clippedEnd ? 'daygrid__block--clipend' : ''
                  }`}
                  style={{
                    top: `${block.top * 100}%`,
                    height: `${block.height * 100}%`,
                    left: `${block.column * width}%`,
                    width: `${width}%`,
                    borderColor: color,
                    background: task ? color : 'transparent',
                  }}
                  title={[
                    task ? task.title : t('calendar.noTask'),
                    block.clippedEnd ? t('calendar.continuesAfter') : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  onClick={() => {
                    if (task) onOpenTask(task)
                    else openAttach(block.session.id)
                  }}
                >
                  <span className="daygrid__blocktitle">
                    {task ? task.title : t('calendar.noTask')}
                  </span>
                  {block.session.origin !== 'manual' && (
                    <span className="daygrid__blockicon">⏱</span>
                  )}
                </button>
              )
            })
          )}
        </div>
      </div>

      {attaching && (
        <div className="daygrid__attach">
          <span className="daygrid__attachlabel">{t('calendar.attachToTask')}</span>
          <TaskPicker
            tasks={tasks.filter((task) => !task.completed)}
            projectColors={projectColors}
            selectedId={null}
            onSelect={(taskId) => handleSelect(attaching, taskId)}
          />
        </div>
      )}
    </section>
  )
}
