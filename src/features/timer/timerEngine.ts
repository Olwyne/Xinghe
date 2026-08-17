export type SessionType = 'focus' | 'short' | 'long'

export interface TimerState {
  type: SessionType
  duration: number
  startedAt: number | null
  pausedAt: number | null
  totalPausedMs: number
  cycle: number
  status: 'idle' | 'running' | 'paused' | 'ended'
}

export interface TimerSettings {
  focusMinutes: number
  shortMinutes: number
  longMinutes: number
  cyclesBeforeLong: number
  autoChain: boolean
}

export const DEFAULT_SETTINGS: TimerSettings = {
  focusMinutes: 25,
  shortMinutes: 5,
  longMinutes: 15,
  cyclesBeforeLong: 4,
  autoChain: true,
}

export function durationMs(type: SessionType, settings: TimerSettings): number {
  switch (type) {
    case 'focus': return settings.focusMinutes * 60_000
    case 'short': return settings.shortMinutes * 60_000
    case 'long': return settings.longMinutes * 60_000
  }
}

export function computeElapsedMs(state: TimerState, now: number): number {
  if (state.startedAt === null) return 0
  const currentPauseMs = state.pausedAt !== null ? now - state.pausedAt : 0
  return now - state.startedAt - state.totalPausedMs - currentPauseMs
}

export function computeRemainingMs(state: TimerState, now: number): number {
  return Math.max(0, state.duration - computeElapsedMs(state, now))
}

export function computeProgress(state: TimerState, now: number): number {
  if (state.duration === 0) return 0
  return Math.min(1, computeElapsedMs(state, now) / state.duration)
}

export function isExpired(state: TimerState, now: number): boolean {
  return state.startedAt !== null && computeRemainingMs(state, now) <= 0
}

export function createIdleState(type: SessionType, settings: TimerSettings, cycle: number): TimerState {
  return {
    type,
    duration: durationMs(type, settings),
    startedAt: null,
    pausedAt: null,
    totalPausedMs: 0,
    cycle,
    status: 'idle',
  }
}

export function startTimer(state: TimerState, now: number): TimerState {
  if (state.status === 'running') return state
  if (state.status === 'paused' && state.pausedAt !== null) {
    return {
      ...state,
      totalPausedMs: state.totalPausedMs + (now - state.pausedAt),
      pausedAt: null,
      status: 'running',
    }
  }
  return {
    ...state,
    startedAt: now,
    pausedAt: null,
    totalPausedMs: 0,
    status: 'running',
  }
}

export function pauseTimer(state: TimerState, now: number): TimerState {
  if (state.status !== 'running') return state
  return { ...state, pausedAt: now, status: 'paused' }
}

export function endTimer(state: TimerState): TimerState {
  return { ...state, status: 'ended' }
}

export function nextSession(state: TimerState, settings: TimerSettings): { type: SessionType; cycle: number } {
  if (state.type === 'focus') {
    const isLong = state.cycle % settings.cyclesBeforeLong === 0
    return { type: isLong ? 'long' : 'short', cycle: state.cycle }
  }
  const nextCycle = state.type === 'long' ? 1 : state.cycle + 1
  return { type: 'focus', cycle: nextCycle }
}

export function accentColor(type: SessionType): string {
  switch (type) {
    case 'focus': return 'var(--xh-focus)'
    case 'short': return 'var(--xh-short)'
    case 'long': return 'var(--xh-long)'
  }
}

export function remainingSeconds(state: TimerState, now: number): number {
  return Math.ceil(computeRemainingMs(state, now) / 1000)
}
