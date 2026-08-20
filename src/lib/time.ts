export function getDayBoundary(timestamp: number, dayStartHour: number): string {
  const adjusted = new Date(timestamp - dayStartHour * 60 * 60 * 1000)
  const year = adjusted.getFullYear()
  const month = String(adjusted.getMonth() + 1).padStart(2, '0')
  const day = String(adjusted.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function formatMinutesToHours(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m}`
}

export function todayDayKey(): string {
  const keys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  return keys[new Date().getDay()]
}

export function msToMinutes(ms: number): number {
  return Math.round(ms / 60000)
}

export type TargetPeriod = 'day' | 'week' | 'month'

export interface PeriodRange {
  /** Inclusif. */
  start: number
  /** Exclusif. */
  end: number
}

/**
 * Fenêtre de la période courante, calée sur la frontière de journée configurable.
 * Une session à 2h du matin avec dayStartHour=4 appartient à la journée de la veille.
 */
export function periodRange(
  period: TargetPeriod,
  dayStartHour: number,
  now: number,
): PeriodRange {
  const offset = dayStartHour * 3_600_000
  const shifted = new Date(now - offset)
  const y = shifted.getFullYear()
  const m = shifted.getMonth()
  const d = shifted.getDate()

  let startDate: Date
  let endDate: Date

  if (period === 'day') {
    startDate = new Date(y, m, d)
    endDate = new Date(y, m, d + 1)
  } else if (period === 'week') {
    const mondayIndex = (shifted.getDay() + 6) % 7
    startDate = new Date(y, m, d - mondayIndex)
    endDate = new Date(y, m, d - mondayIndex + 7)
  } else {
    startDate = new Date(y, m, 1)
    endDate = new Date(y, m + 1, 1)
  }

  return {
    start: startDate.getTime() + offset,
    end: endDate.getTime() + offset,
  }
}
