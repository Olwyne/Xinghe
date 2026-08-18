import { useState, useEffect, useRef, useCallback } from 'react'
import {
  type TimerState,
  type TimerSettings,
  type SessionType,
  createIdleState,
  startTimer as engineStart,
  pauseTimer as enginePause,
  endTimer as engineEnd,
  nextSession,
  isExpired,
  remainingSeconds,
  computeProgress,
  computeElapsedMs,
  durationMs,
} from '@/features/timer/timerEngine'
import {
  acquireWakeLock,
  releaseWakeLock,
  reacquireWakeLockIfNeeded,
  sendNotification,
  playSessionEndSound,
} from '@/lib/platform'

interface UseTimerReturn {
  state: TimerState
  remaining: number
  progress: number
  start: () => void
  pause: () => void
  stop: () => void
  skip: () => void
  continueToNext: () => void
  setType: (type: SessionType) => void
}

export function useTimer(
  settings: TimerSettings,
  onFocusComplete?: (durationMs: number) => void,
): UseTimerReturn {
  const onFocusCompleteRef = useRef(onFocusComplete)
  onFocusCompleteRef.current = onFocusComplete
  const [state, setState] = useState<TimerState>(
    () => createIdleState('focus', settings, 1),
  )
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const [now, setNow] = useState(Date.now)

  const clearTick = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const startTick = useCallback(() => {
    clearTick()
    intervalRef.current = setInterval(() => setNow(Date.now()), 1000)
  }, [clearTick])

  const checkExpiry = useCallback((currentState: TimerState, currentNow: number) => {
    if (currentState.status === 'running' && isExpired(currentState, currentNow)) {
      clearTick()
      setState(engineEnd(currentState))
      if (currentState.type === 'focus') {
        onFocusCompleteRef.current?.(currentState.duration)
      }
      playSessionEndSound()

      if (document.visibilityState === 'hidden' || !document.hasFocus()) {
        const label = currentState.type === 'focus' ? 'Session terminée' : 'Pause terminée'
        sendNotification('Xinghe — ' + label, {
          body: currentState.type === 'focus'
            ? 'Un point de plus sur le fleuve.'
            : 'Prêt·e à reprendre le courant ?',
          tag: 'xinghe-timer-end',
        })
      }

      releaseWakeLock()
      return true
    }
    return false
  }, [clearTick])

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        const currentNow = Date.now()
        setNow(currentNow)
        setState((prev) => {
          if (prev.status === 'running') {
            if (!checkExpiry(prev, currentNow)) {
              startTick()
              reacquireWakeLockIfNeeded()
            }
          }
          return prev
        })
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [checkExpiry, startTick])

  useEffect(() => {
    if (state.status === 'running') {
      const currentNow = Date.now()
      if (!checkExpiry(state, currentNow)) {
        startTick()
      }
    }
    return clearTick
  }, [state.status, state.startedAt])

  const start = useCallback(() => {
    const currentNow = Date.now()
    setState((prev) => engineStart(prev, currentNow))
    setTimeout(() => { acquireWakeLock().catch(() => {}) }, 0)
  }, [])

  const pause = useCallback(() => {
    const currentNow = Date.now()
    clearTick()
    setState((prev) => enginePause(prev, currentNow))
    releaseWakeLock()
  }, [clearTick])

  const stop = useCallback(() => {
    clearTick()
    setState((prev) => createIdleState(prev.type, settingsRef.current, prev.cycle))
    releaseWakeLock()
  }, [clearTick])

  const skip = useCallback(() => {
    clearTick()
    setState((prev) => {
      if (prev.type === 'focus' && (prev.status === 'running' || prev.status === 'paused')) {
        const elapsed = computeElapsedMs(prev, Date.now())
        if (elapsed >= 60_000) onFocusCompleteRef.current?.(elapsed)
      }
      return engineEnd(prev)
    })
    playSessionEndSound()
    releaseWakeLock()
  }, [clearTick])

  const continueToNext = useCallback(() => {
    setState((prev) => {
      const { type: nextType, cycle: nextCycle } = nextSession(prev, settingsRef.current)
      return createIdleState(nextType, settingsRef.current, nextCycle)
    })
  }, [])

  const setType = useCallback((type: SessionType) => {
    clearTick()
    setState((prev) => {
      if (prev.status !== 'idle') return prev
      return createIdleState(type, settingsRef.current, prev.cycle)
    })
    releaseWakeLock()
  }, [clearTick])

  useEffect(() => {
    if (state.status === 'idle') {
      setState((prev) => ({
        ...prev,
        duration: durationMs(prev.type, settings),
      }))
    }
  }, [settings.focusMinutes, settings.shortMinutes, settings.longMinutes])

  const remaining = remainingSeconds(state, now)
  const progress = computeProgress(state, now)

  return { state, remaining, progress, start, pause, stop, skip, continueToNext, setType }
}
