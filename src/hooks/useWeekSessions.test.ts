import { describe, it, expect } from 'vitest'
import { bucketSessionsByDay } from './useWeekSessions'
import { periodRange, getDayBoundary } from '@/lib/time'
import type { Session } from '@/features/goals/types'

function at(y: number, m: number, d: number, h = 0, min = 0): number {
  return new Date(y, m - 1, d, h, min, 0, 0).getTime()
}

function session(startedAt: number, minutes: number): Session {
  return {
    id: `s-${startedAt}`,
    projectId: 'p',
    taskId: null,
    startedAt,
    durationMs: minutes * 60_000,
    type: 'focus',
  }
}

describe('bucketSessionsByDay', () => {
  const dayStart = 4
  // 2026-03-10 is a Tuesday; the week window (Monday-start, dayStart=4) begins
  // on 2026-03-09 at 04:00.
  const range = periodRange('week', dayStart, at(2026, 3, 10, 10))

  it('places a 03:00 session in the previous day bucket', () => {
    // Tuesday March 10, 03:00 is before the 04:00 boundary, so it still
    // belongs to Monday March 9's window.
    const s = session(at(2026, 3, 10, 3, 0), 25)
    const buckets = bucketSessionsByDay([s], range.start, dayStart)
    const monday = buckets.find((b) => b.date === getDayBoundary(at(2026, 3, 9, 10), dayStart))
    const tuesday = buckets.find((b) => b.date === getDayBoundary(at(2026, 3, 10, 10), dayStart))
    expect(monday?.minutes).toBe(25)
    expect(tuesday?.minutes).toBe(0)
  })

  it('places a 05:00 session in the current day bucket', () => {
    // Tuesday March 10, 05:00 is after the 04:00 boundary, so it belongs to
    // Tuesday's window.
    const s = session(at(2026, 3, 10, 5, 0), 30)
    const buckets = bucketSessionsByDay([s], range.start, dayStart)
    const tuesday = buckets.find((b) => b.date === getDayBoundary(at(2026, 3, 10, 10), dayStart))
    expect(tuesday?.minutes).toBe(30)
  })

  it('does not lose an early-morning session on the last day of the window', () => {
    // Sunday March 15, 03:00 still belongs to Saturday's window and must land
    // in one of the seven buckets, not fall through unmatched.
    const s = session(at(2026, 3, 15, 3, 0), 40)
    const buckets = bucketSessionsByDay([s], range.start, dayStart)
    const total = buckets.reduce((sum, b) => sum + b.minutes, 0)
    expect(total).toBe(40)
  })
})
