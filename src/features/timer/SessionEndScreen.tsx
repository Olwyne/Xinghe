import { useTranslation } from 'react-i18next'
import type { SessionType } from './timerEngine'
import './SessionEndScreen.css'

interface SessionEndScreenProps {
  type: SessionType
  accentColor: string
  taskTitle?: string | null
  onContinue: () => void
  onStartBreak?: () => void
  onCompleteTask?: () => void
}

export function SessionEndScreen({
  type,
  accentColor,
  taskTitle,
  onContinue,
  onStartBreak,
  onCompleteTask,
}: SessionEndScreenProps) {
  const { t } = useTranslation()
  const isFocus = type === 'focus'
  const handleClick = isFocus && onStartBreak ? onStartBreak : onContinue

  return (
    <div className="session-end">
      <div className="session-end__star">✦</div>
      <div className="session-end__title">
        {isFocus ? t('timer.sessionEnded') : t('timer.breakEnded')}
      </div>
      <div className="session-end__message">
        {isFocus ? t('timer.sessionEndMessage') : t('timer.breakEndMessage')}
      </div>
      {isFocus && taskTitle && onCompleteTask && (
        <button
          className="session-end__complete-task"
          onClick={onCompleteTask}
        >
          {t('timer.completeTask', { title: taskTitle })}
        </button>
      )}
      <button
        className="session-end__button"
        style={{ background: accentColor }}
        onClick={handleClick}
      >
        {isFocus ? t('timer.startBreak') : t('timer.resumeFocus')}
      </button>
    </div>
  )
}
