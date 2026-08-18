import { useCallback, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import { useTimer } from '@/hooks/useTimer'
import { useTimerSettings } from '@/hooks/useTimerSettings'
import { useDailyGoal } from '@/hooks/useDailyGoal'
import { useTodaySessions } from '@/hooks/useTodaySessions'
import { accentColor } from './timerEngine'
import { TimerRing } from './TimerRing'
import { TimerControls } from './TimerControls'
import { SessionEndScreen } from './SessionEndScreen'
import { BreakRitualScreen } from './BreakRitualScreen'
import { GoalBar } from './GoalBar'
import { pickRitual } from './breakRituals'
import './TimerScreen.css'

interface TimerScreenProps {
  isDesktop?: boolean
}

export function TimerScreen({ isDesktop }: TimerScreenProps) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const uid = user?.uid ?? null
  const { settings } = useTimerSettings()
  const { targetMinutes } = useDailyGoal(uid)
  const { recordSession, totalFocusMinutes } = useTodaySessions(uid)

  const onFocusComplete = useCallback(
    (ms: number) => { recordSession('inbox', ms) },
    [recordSession],
  )

  const { state, remaining, progress, start, pause, stop, skip, continueToNext } =
    useTimer(settings, onFocusComplete)

  const [showRitual, setShowRitual] = useState(false)
  const ritualRef = useRef(pickRitual('short'))

  const handleStartBreak = useCallback(() => {
    const breakType = state.type === 'focus'
      ? (state.cycle % settings.cyclesBeforeLong === 0 ? 'long' : 'short')
      : 'short'
    ritualRef.current = pickRitual(breakType as 'short' | 'long')
    continueToNext()
    setTimeout(() => start(), 0)
    setShowRitual(true)
  }, [continueToNext, start, state.cycle, state.type, settings.cyclesBeforeLong])

  const handleSkipRitual = useCallback(() => {
    setShowRitual(false)
  }, [])

  const handleContinueFromBreak = useCallback(() => {
    setShowRitual(false)
    continueToNext()
  }, [continueToNext])

  const color = accentColor(state.type)
  const modeLabel =
    state.type === 'focus'
      ? t('timer.focus')
      : state.type === 'short'
        ? t('timer.shortBreak')
        : t('timer.longBreak')

  const cyclePosition = ((state.cycle - 1) % settings.cyclesBeforeLong) + 1

  if (state.status === 'ended') {
    return (
      <SessionEndScreen
        type={state.type}
        accentColor={color}
        onContinue={handleContinueFromBreak}
        onStartBreak={state.type === 'focus' ? handleStartBreak : undefined}
      />
    )
  }

  if (showRitual && state.type !== 'focus') {
    return (
      <BreakRitualScreen
        type={state.type}
        accentColor={color}
        ritual={ritualRef.current}
        remaining={remaining}
        progress={progress}
        onSkip={handleSkipRitual}
      />
    )
  }

  const ringSize = isDesktop ? 150 : 260

  return (
    <div className="timer-screen">
      <div className="timer-screen__header">
        <div className="timer-screen__logo">Xinghe</div>
      </div>

      <div className="timer-screen__body">
        <div className="timer-screen__mode" style={{ color }}>
          {modeLabel}
        </div>

        <TimerRing
          remaining={remaining}
          progress={progress}
          accentColor={color}
          size={ringSize}
        />

        <div className="timer-screen__cycle">
          {t('timer.pomodoroCount', {
            current: cyclePosition,
            total: settings.cyclesBeforeLong,
          })}
        </div>

        <TimerControls
          isRunning={state.status === 'running'}
          isIdle={state.status === 'idle'}
          accentColor={color}
          onStart={start}
          onPause={pause}
          onStop={stop}
          onSkip={skip}
        />

        <GoalBar
          totalMinutes={totalFocusMinutes}
          targetMinutes={targetMinutes}
          accentColor={color}
        />
      </div>
    </div>
  )
}
