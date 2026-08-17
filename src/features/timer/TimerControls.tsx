import './TimerControls.css'

interface TimerControlsProps {
  isRunning: boolean
  isIdle: boolean
  accentColor: string
  onStart: () => void
  onPause: () => void
  onStop: () => void
  onSkip: () => void
}

export function TimerControls({
  isRunning,
  isIdle,
  accentColor,
  onStart,
  onPause,
  onStop,
  onSkip,
}: TimerControlsProps) {
  return (
    <div className="timer-controls">
      <button
        className="timer-controls__btn timer-controls__btn--secondary"
        onClick={onStop}
        disabled={isIdle}
        aria-label="Stop"
      >
        ■
      </button>
      <button
        className="timer-controls__btn timer-controls__btn--primary"
        style={{
          background: accentColor,
          boxShadow: `0 0 30px ${accentColor}66`,
        }}
        onClick={isRunning ? onPause : onStart}
        aria-label={isRunning ? 'Pause' : 'Start'}
      >
        {isRunning ? '❙❙' : '▶'}
      </button>
      <button
        className="timer-controls__btn timer-controls__btn--secondary"
        onClick={onSkip}
        disabled={isIdle}
        aria-label="Skip"
      >
        ⏭
      </button>
    </div>
  )
}
