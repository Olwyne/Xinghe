import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import { useProjects } from '@/hooks/useProjects'
import { useProjectProgress } from '@/hooks/useProjectProgress'
import { buildTargetRows } from './progress'
import { formatMinutesToHours } from '@/lib/time'
import './TimeTargetsSection.css'

export function TimeTargetsSection() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const uid = user?.uid ?? null
  const { projects } = useProjects(uid)
  const { byProject, allocation, loading } = useProjectProgress(uid)

  const rows = buildTargetRows(projects, byProject)

  return (
    <section className="tts">
      <h2 className="tts__title">{t('goals.timeTargets')}</h2>

      {allocation.isOverAllocated && (
        <p className="tts__warning">
          {t('goals.overAllocated', {
            total: formatMinutesToHours(allocation.totalTargetPerDay),
            global: formatMinutesToHours(allocation.globalPerDay),
          })}
        </p>
      )}

      {loading ? (
        <div className="tts__skeletons">
          <div className="tts__skeleton" />
          <div className="tts__skeleton" />
        </div>
      ) : rows.length === 0 ? (
        <p className="tts__empty">{t('goals.empty')}</p>
      ) : (
        <ul className="tts__list">
          {rows.map((row) => (
            <li key={row.projectId} className="tts__row">
              <span className="tts__icon" style={{ color: row.color }}>{row.icon}</span>
              <div className="tts__body">
                <div className="tts__header">
                  <span className="tts__name">{row.name}</span>
                  <span className={`tts__value ${row.isExceeded ? 'tts__value--exceeded' : ''}`}>
                    {formatMinutesToHours(row.spentMinutes)} / {formatMinutesToHours(row.targetMinutes)}
                  </span>
                </div>
                <div className="tts__track">
                  <div
                    className="tts__fill"
                    style={{ width: `${row.ratio * 100}%`, background: row.color }}
                  />
                </div>
                <span className="tts__period">{t(`goals.${row.periodKey}`)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
