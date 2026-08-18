import { useTranslation } from 'react-i18next'
import type { SessionType } from './timerEngine'
import './BreakRitualScreen.css'

interface BreakRitualScreenProps {
  type: SessionType
  accentColor: string
  ritual: { icon: string; text: string }
  remaining: number
  progress: number
  onSkip: () => void
}

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function BreakRitualScreen({
  type,
  accentColor,
  ritual,
  remaining,
  progress,
  onSkip,
}: BreakRitualScreenProps) {
  const { t } = useTranslation()
  const breakLabel = type === 'long' ? t('timer.longBreak') : t('timer.shortBreak')

  return (
    <div className="break-ritual">
      <div className="break-ritual__label" style={{ color: accentColor }}>
        {breakLabel}
      </div>

      <div className="break-ritual__icon">{ritual.icon}</div>
      <p className="break-ritual__text">{ritual.text}</p>

      <div className="break-ritual__timer">
        <svg className="break-ritual__ring" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="34" fill="none" stroke="var(--xh-card-border)" strokeWidth="3" />
          <circle
            cx="40" cy="40" r="34"
            fill="none"
            stroke={accentColor}
            strokeWidth="3"
            strokeDasharray={`${2 * Math.PI * 34}`}
            strokeDashoffset={`${2 * Math.PI * 34 * (1 - progress)}`}
            strokeLinecap="round"
            transform="rotate(-90 40 40)"
            style={{ transition: 'stroke-dashoffset 1s linear' }}
          />
        </svg>
        <span className="break-ritual__time">{fmt(remaining)}</span>
      </div>

      <button className="break-ritual__skip" onClick={onSkip}>
        {t('ritual.skip')}
      </button>
    </div>
  )
}
