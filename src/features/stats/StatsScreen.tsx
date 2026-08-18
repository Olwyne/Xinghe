import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import { useWeekSessions } from '@/hooks/useWeekSessions'
import { useHabits } from '@/hooks/useHabits'
import { useHabitEntries } from '@/hooks/useHabitEntries'
import { useDailyGoal } from '@/hooks/useDailyGoal'
import { WeekChart } from './WeekChart'
import './StatsScreen.css'

function fmt(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function StatsScreen() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const uid = user?.uid ?? null

  const { totalMinutes, byDay } = useWeekSessions(uid)
  const { targetMinutes } = useDailyGoal(uid)
  const { habits } = useHabits(uid)
  const { isCompletedToday, streakFor } = useHabitEntries(uid)

  const weekTarget = targetMinutes * 5
  const weekProgress = Math.min(1, totalMinutes / weekTarget)
  const accentColor = 'var(--xh-focus)'

  return (
    <div className="stats-screen">
      <h1 className="stats-screen__title">{t('nav.stats')}</h1>

      <section className="stats-card">
        <div className="stats-card__header">
          <span className="stats-card__label">{t('stats.weekFocus')}</span>
          <span className="stats-card__value">{fmt(totalMinutes)}</span>
        </div>

        <div className="stats-card__track">
          <div
            className="stats-card__fill"
            style={{ width: `${weekProgress * 100}%`, background: accentColor }}
          />
        </div>
        <div className="stats-card__sub">
          {t('stats.weekTarget', { target: fmt(weekTarget) })}
        </div>

        <WeekChart days={byDay} accentColor={accentColor} />
      </section>

      <section className="stats-card">
        <div className="stats-card__header">
          <span className="stats-card__label">{t('stats.todayHabits')}</span>
          <span className="stats-card__value">
            {habits.filter((h) => isCompletedToday(h.id)).length}/{habits.length}
          </span>
        </div>

        {habits.length === 0 ? (
          <p className="stats-card__empty">{t('stats.noHabits')}</p>
        ) : (
          <ul className="stats-habits">
            {habits.map((h) => {
              const done = isCompletedToday(h.id)
              const streak = streakFor(h.id)
              return (
                <li key={h.id} className={`stats-habit ${done ? 'stats-habit--done' : ''}`}>
                  <span className="stats-habit__icon">{h.icon}</span>
                  <span className="stats-habit__name">{h.name}</span>
                  {streak > 0 && (
                    <span className="stats-habit__streak">🔥 {streak}</span>
                  )}
                  <span className="stats-habit__check">{done ? '✓' : '○'}</span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
