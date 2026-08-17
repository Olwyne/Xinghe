import { useTranslation } from 'react-i18next'
import type { SessionType } from './timerEngine'
import './SessionEndScreen.css'

interface SessionEndScreenProps {
  type: SessionType
  accentColor: string
  onContinue: () => void
}

export function SessionEndScreen({ type, accentColor, onContinue }: SessionEndScreenProps) {
  const { t } = useTranslation()
  const isFocus = type === 'focus'

  return (
    <div className="session-end">
      <div className="session-end__star">✦</div>
      <div className="session-end__title">
        {isFocus ? t('timer.sessionEnded') : t('timer.breakEnded')}
      </div>
      <div className="session-end__message">
        {isFocus ? t('timer.sessionEndMessage') : t('timer.breakEndMessage')}
      </div>
      <button
        className="session-end__button"
        style={{ background: accentColor }}
        onClick={onContinue}
      >
        {isFocus ? t('timer.startBreak') : t('timer.resumeFocus')}
      </button>
    </div>
  )
}
