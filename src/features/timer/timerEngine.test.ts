import { describe, it, expect } from 'vitest'
import {
  type TimerState,
  DEFAULT_SETTINGS,
  durationMs,
  computeElapsedMs,
  computeRemainingMs,
  computeProgress,
  isExpired,
  createIdleState,
  startTimer,
  pauseTimer,
  endTimer,
  nextSession,
  accentColor,
  remainingSeconds,
} from './timerEngine'

const S = DEFAULT_SETTINGS
const T0 = 1_700_000_000_000

function running(type: 'focus' | 'short' | 'long' = 'focus', startedAt = T0): TimerState {
  return { ...createIdleState(type, S, 1), startedAt, status: 'running' }
}

describe('durationMs', () => {
  it('converts focus minutes to ms', () => {
    expect(durationMs('focus', S)).toBe(25 * 60_000)
  })
  it('converts short minutes to ms', () => {
    expect(durationMs('short', S)).toBe(5 * 60_000)
  })
  it('converts long minutes to ms', () => {
    expect(durationMs('long', S)).toBe(15 * 60_000)
  })
  it('uses custom settings', () => {
    expect(durationMs('focus', { ...S, focusMinutes: 50 })).toBe(50 * 60_000)
  })
})

describe('computeElapsedMs', () => {
  it('returns 0 when not started', () => {
    const idle = createIdleState('focus', S, 1)
    expect(computeElapsedMs(idle, T0 + 999_999)).toBe(0)
  })

  it('computes elapsed for running timer', () => {
    const state = running('focus', T0)
    expect(computeElapsedMs(state, T0 + 10_000)).toBe(10_000)
  })

  it('excludes current pause duration', () => {
    const state: TimerState = {
      ...running('focus', T0),
      pausedAt: T0 + 5_000,
      status: 'paused',
    }
    // now = T0+20_000, elapsed = 20_000 - 0(totalPaused) - 15_000(currentPause) = 5_000
    expect(computeElapsedMs(state, T0 + 20_000)).toBe(5_000)
  })

  it('accounts for totalPausedMs from previous pauses', () => {
    const state: TimerState = {
      ...running('focus', T0),
      totalPausedMs: 3_000,
    }
    // elapsed = 10_000 - 3_000 = 7_000
    expect(computeElapsedMs(state, T0 + 10_000)).toBe(7_000)
  })

  it('handles multiple pauses correctly', () => {
    let state = running('focus', T0)
    // Pause at +5s
    state = pauseTimer(state, T0 + 5_000)
    // Resume at +8s (3s paused)
    state = startTimer(state, T0 + 8_000)
    // Pause again at +12s
    state = pauseTimer(state, T0 + 12_000)
    // Resume at +15s (3s paused again, total 6s)
    state = startTimer(state, T0 + 15_000)
    // Check at +20s: 20s total - 6s paused = 14s elapsed
    expect(computeElapsedMs(state, T0 + 20_000)).toBe(14_000)
  })
})

describe('computeRemainingMs', () => {
  it('returns full duration for idle timer', () => {
    const idle = createIdleState('focus', S, 1)
    expect(computeRemainingMs(idle, T0)).toBe(25 * 60_000)
  })

  it('decreases as time passes', () => {
    const state = running('focus', T0)
    expect(computeRemainingMs(state, T0 + 60_000)).toBe(24 * 60_000)
  })

  it('never goes below 0', () => {
    const state = running('focus', T0)
    expect(computeRemainingMs(state, T0 + 99 * 60_000)).toBe(0)
  })

  it('freezes while paused', () => {
    let state = running('focus', T0)
    state = pauseTimer(state, T0 + 60_000)
    const remaining1 = computeRemainingMs(state, T0 + 60_000)
    const remaining2 = computeRemainingMs(state, T0 + 120_000)
    expect(remaining1).toBe(remaining2)
  })
})

describe('computeProgress', () => {
  it('returns 0 for idle', () => {
    expect(computeProgress(createIdleState('focus', S, 1), T0)).toBe(0)
  })

  it('returns 0.5 at midpoint', () => {
    const state = running('focus', T0)
    const halfDuration = (25 * 60_000) / 2
    expect(computeProgress(state, T0 + halfDuration)).toBeCloseTo(0.5)
  })

  it('caps at 1', () => {
    const state = running('focus', T0)
    expect(computeProgress(state, T0 + 99 * 60_000)).toBe(1)
  })

  it('returns 0 for zero-duration', () => {
    const state: TimerState = { ...running(), duration: 0 }
    expect(computeProgress(state, T0 + 1000)).toBe(0)
  })
})

describe('isExpired', () => {
  it('false when not started', () => {
    expect(isExpired(createIdleState('focus', S, 1), T0)).toBe(false)
  })

  it('false when time remains', () => {
    expect(isExpired(running('focus', T0), T0 + 60_000)).toBe(false)
  })

  it('true when duration exceeded', () => {
    expect(isExpired(running('focus', T0), T0 + 26 * 60_000)).toBe(true)
  })

  it('true at exact boundary', () => {
    expect(isExpired(running('focus', T0), T0 + 25 * 60_000)).toBe(true)
  })

  it('detects expiry after tab was hidden for long time', () => {
    const state = running('focus', T0)
    // Tab hidden for 2 hours
    expect(isExpired(state, T0 + 2 * 3600_000)).toBe(true)
  })

  it('not expired when paused past duration', () => {
    let state = running('focus', T0)
    state = pauseTimer(state, T0 + 60_000) // paused after 1 min
    // 30 min later, still paused — should NOT be expired
    expect(isExpired(state, T0 + 30 * 60_000)).toBe(false)
  })
})

describe('createIdleState', () => {
  it('creates idle state with correct duration', () => {
    const state = createIdleState('focus', S, 1)
    expect(state.status).toBe('idle')
    expect(state.type).toBe('focus')
    expect(state.duration).toBe(25 * 60_000)
    expect(state.startedAt).toBeNull()
    expect(state.pausedAt).toBeNull()
    expect(state.totalPausedMs).toBe(0)
    expect(state.cycle).toBe(1)
  })

  it('preserves cycle number', () => {
    expect(createIdleState('short', S, 3).cycle).toBe(3)
  })
})

describe('startTimer', () => {
  it('starts from idle', () => {
    const idle = createIdleState('focus', S, 1)
    const started = startTimer(idle, T0)
    expect(started.status).toBe('running')
    expect(started.startedAt).toBe(T0)
    expect(started.totalPausedMs).toBe(0)
  })

  it('resumes from paused, accumulating pause duration', () => {
    let state = running('focus', T0)
    state = pauseTimer(state, T0 + 5_000)
    const resumed = startTimer(state, T0 + 8_000)
    expect(resumed.status).toBe('running')
    expect(resumed.pausedAt).toBeNull()
    expect(resumed.totalPausedMs).toBe(3_000)
  })

  it('no-ops if already running', () => {
    const state = running('focus', T0)
    expect(startTimer(state, T0 + 1000)).toBe(state)
  })
})

describe('pauseTimer', () => {
  it('pauses running timer', () => {
    const state = running('focus', T0)
    const paused = pauseTimer(state, T0 + 5_000)
    expect(paused.status).toBe('paused')
    expect(paused.pausedAt).toBe(T0 + 5_000)
  })

  it('no-ops if not running', () => {
    const idle = createIdleState('focus', S, 1)
    expect(pauseTimer(idle, T0)).toBe(idle)
  })
})

describe('endTimer', () => {
  it('sets status to ended', () => {
    const state = running('focus', T0)
    expect(endTimer(state).status).toBe('ended')
  })

  it('preserves all other fields', () => {
    const state = running('focus', T0)
    const ended = endTimer(state)
    expect(ended.type).toBe(state.type)
    expect(ended.startedAt).toBe(state.startedAt)
    expect(ended.cycle).toBe(state.cycle)
  })
})

describe('nextSession', () => {
  it('focus cycle 1 → short break', () => {
    const state = { ...createIdleState('focus', S, 1), status: 'ended' as const }
    expect(nextSession(state, S)).toEqual({ type: 'short', cycle: 1 })
  })

  it('focus cycle 4 → long break (cyclesBeforeLong=4)', () => {
    const state = { ...createIdleState('focus', S, 4), status: 'ended' as const }
    expect(nextSession(state, S)).toEqual({ type: 'long', cycle: 4 })
  })

  it('short break → focus, cycle increments', () => {
    const state = { ...createIdleState('short', S, 2), status: 'ended' as const }
    expect(nextSession(state, S)).toEqual({ type: 'focus', cycle: 3 })
  })

  it('long break → focus, cycle resets to 1', () => {
    const state = { ...createIdleState('long', S, 4), status: 'ended' as const }
    expect(nextSession(state, S)).toEqual({ type: 'focus', cycle: 1 })
  })

  it('full cycle: 4 focus + 3 short + 1 long', () => {
    const transitions: string[] = []
    let type: 'focus' | 'short' | 'long' = 'focus'
    let cycle = 1

    for (let i = 0; i < 9; i++) {
      transitions.push(`${type}@${cycle}`)
      const state = { ...createIdleState(type, S, cycle), status: 'ended' as const }
      const next = nextSession(state, S)
      type = next.type
      cycle = next.cycle
    }

    expect(transitions).toEqual([
      'focus@1', 'short@1',
      'focus@2', 'short@2',
      'focus@3', 'short@3',
      'focus@4', 'long@4',
      'focus@1',
    ])
  })
})

describe('remainingSeconds', () => {
  it('returns ceiling of remaining ms / 1000', () => {
    const state = running('focus', T0)
    // 24 min 59.001s remaining → should ceil to 24*60 + 60 = 1500
    expect(remainingSeconds(state, T0 + 999)).toBe(25 * 60)
  })

  it('returns 0 when expired', () => {
    expect(remainingSeconds(running('focus', T0), T0 + 30 * 60_000)).toBe(0)
  })
})

describe('accentColor', () => {
  it('focus → pink', () => expect(accentColor('focus')).toBe('var(--xh-focus)'))
  it('short → teal', () => expect(accentColor('short')).toBe('var(--xh-short)'))
  it('long → gold', () => expect(accentColor('long')).toBe('var(--xh-long)'))
})

describe('timezone / absence scenarios', () => {
  it('timer expires correctly after device sleep (large gap)', () => {
    const state = running('focus', T0)
    // Device sleeps for 2 hours
    const wakeTime = T0 + 2 * 3600_000
    expect(isExpired(state, wakeTime)).toBe(true)
    expect(computeRemainingMs(state, wakeTime)).toBe(0)
  })

  it('paused timer unaffected by device sleep', () => {
    let state = running('focus', T0)
    state = pauseTimer(state, T0 + 60_000) // paused after 1 min
    // Device sleeps 8 hours
    const wakeTime = T0 + 8 * 3600_000
    expect(isExpired(state, wakeTime)).toBe(false)
    // Only 1 min elapsed (the running part before pause)
    expect(computeElapsedMs(state, wakeTime)).toBe(60_000)
  })

  it('remaining is accurate after timezone change (timestamp-based)', () => {
    const state = running('focus', T0)
    // Timestamps are absolute — timezone doesn't affect Date.now()
    // 10 minutes later, regardless of timezone display
    expect(computeRemainingMs(state, T0 + 10 * 60_000)).toBe(15 * 60_000)
  })

  it('multiple pause/resume across long gaps', () => {
    let state = running('focus', T0)
    // Work 5 min, pause, sleep 8h, resume, work 5 min, pause, sleep 8h, resume
    state = pauseTimer(state, T0 + 5 * 60_000)
    state = startTimer(state, T0 + 8 * 3600_000)
    state = pauseTimer(state, T0 + 8 * 3600_000 + 5 * 60_000)
    state = startTimer(state, T0 + 16 * 3600_000)
    // Total worked: 10 min. Remaining: 15 min
    expect(computeElapsedMs(state, T0 + 16 * 3600_000)).toBe(10 * 60_000)
    expect(computeRemainingMs(state, T0 + 16 * 3600_000)).toBe(15 * 60_000)
  })
})
