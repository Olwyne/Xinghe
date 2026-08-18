import { useTranslation } from 'react-i18next'
import './GoalBar.css'

interface GoalBarProps {
  totalMinutes: number
  targetMinutes: number
  accentColor: string
}

export function GoalBar({ totalMinutes, targetMinutes, accentColor }: GoalBarProps) {
  const { t } = useTranslation()
  const progress = Math.min(1, totalMinutes / targetMinutes)
  const reached = totalMinutes >= targetMinutes
  const remaining = Math.max(0, targetMinutes - totalMinutes)

  return (
    <div className="goal-bar">
      <div className="goal-bar__track">
        <div
          className={`goal-bar__fill ${reached ? 'goal-bar__fill--reached' : ''}`}
          style={{ width: `${progress * 100}%`, background: accentColor }}
        />
      </div>
      <div className="goal-bar__label">
        {reached
          ? t('timer.goalsReached')
          : t('timer.remainingToday', { minutes: remaining })}
      </div>
    </div>
  )
}
