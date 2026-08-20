import { describe, it, expect } from 'vitest'
import { bucketSessionsByDay } from './useWeekSessions'
import { periodRange, getDayBoundary } from '@/lib/time'
import type { Session } from '@/features/goals/types'

// This test needs a timezone that observes DST to be meaningful; pin it
// explicitly rather than relying on the runner's ambient timezone.
// (No @types/node in this project, so process is reached via globalThis.)
;(globalThis as { process?: { env: Record<string, string | undefined> } }).process!.env.TZ =
  'Europe/Paris'

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
    // Monday March 16, 02:00 is inside the window (before 04:00 boundary) but has
    // raw calendar date 2026-03-16, which matches no bucket label under buggy
    // grouping. With correct implementation, getDayBoundary maps it to 2026-03-15.
    const s = session(at(2026, 3, 16, 2, 0), 40)
    const buckets = bucketSessionsByDay([s], range.start, dayStart)
    const sundayBucket = buckets.find((b) => b.date === getDayBoundary(at(2026, 3, 15, 10), dayStart))
    expect(sundayBucket?.minutes).toBe(40)
  })

  it('produces seven distinct consecutive dates across a spring-forward DST week', () => {
    // 2026-03-29 is the last Sunday of March: clocks spring forward one hour
    // (02:00 -> 03:00) in most European timezones. The week Mon 2026-03-23 ..
    // Sun 2026-03-29 (dayStart=4) ends on that transition day. This is a
    // regression guard for calendar-correct bucketing across the transition.
    //
    // Note: with this project's getDayBoundary (which itself does fixed-ms
    // hour arithmetic on an absolute timestamp before formatting to local
    // calendar date), the old `rangeStart + i * 86_400_000` bucketing was
    // verified — by temporarily restoring it — to still pass this exact
    // assertion for every dayStart hour across a full year of weeks: the two
    // absolute-time computations happen to cancel out through getDayBoundary's
    // own conversion back to local time. The bug described for this fix is
    // real in principle (day-granularity drift via repeated fixed-ms addition
    // is not equivalent to calendar arithmetic in general), and calendar
    // arithmetic is the correct, non-coincidental way to build these
    // timestamps — matching periodRange's own style — but this particular
    // test does not currently discriminate between the two implementations.
    // Kept as a named regression check rather than removed outright.
    const dstRange = periodRange('week', dayStart, at(2026, 3, 23, 10))
    const buckets = bucketSessionsByDay([], dstRange.start, dayStart)
    const dates = buckets.map((b) => b.date)
    const uniqueDates = new Set(dates)

    expect(dates).toHaveLength(7)
    expect(uniqueDates.size).toBe(7)

    const expected = [
      '2026-03-23',
      '2026-03-24',
      '2026-03-25',
      '2026-03-26',
      '2026-03-27',
      '2026-03-28',
      '2026-03-29',
    ]
    expect(dates).toEqual(expected)
  })
})
