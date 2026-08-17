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
