import type { TargetPeriod } from './types'

/** Maximum atteignable : 24 h par jour de la période. */
export const MAX_MINUTES: Record<TargetPeriod, number> = {
  day: 1440,
  week: 10080,
  month: 44640,
}

export function isValidTarget(period: TargetPeriod, minutes: number): boolean {
  return Number.isInteger(minutes) && minutes >= 1 && minutes <= MAX_MINUTES[period]
}

/** Somme des deux champs de saisie ; une saisie vide ou illisible vaut zéro. */
export function parseTargetMinutes(hours: string, mins: string): number {
  return (parseInt(hours, 10) || 0) * 60 + (parseInt(mins, 10) || 0)
}
