import { periodRange, type TargetPeriod } from '@/lib/time'
import type { Project } from '@/features/tasks/types'
import type { Session } from './types'

const DIVISORS: Record<TargetPeriod, number> = { day: 1, week: 7, month: 30 }

/** Ramène une cible de période à un équivalent quotidien, pour comparaison. */
export function normalizeToDaily(period: TargetPeriod, targetMinutes: number): number {
  return targetMinutes / DIVISORS[period]
}

export interface Allocation {
  totalTargetPerDay: number
  globalPerDay: number
  isOverAllocated: boolean
}

/**
 * Compare la somme des cibles projets à l'objectif quotidien global.
 * Purement informatif : rien n'est bloqué en cas de sur-allocation.
 */
export function computeAllocation(projects: Project[], globalPerDay: number): Allocation {
  const total = projects.reduce((sum, p) => {
    if (!p.timeTarget) return sum
    return sum + normalizeToDaily(p.timeTarget.period, p.timeTarget.targetMinutes)
  }, 0)
  const totalTargetPerDay = Math.round(total)
  return {
    totalTargetPerDay,
    globalPerDay,
    isOverAllocated: globalPerDay > 0 && totalTargetPerDay > globalPerDay,
  }
}

export interface ProjectProgress {
  periodStart: number
  periodEnd: number
  spentMinutes: number
  targetMinutes: number
  /** Borné à 1, pour la largeur de barre. */
  ratio: number
  /** Non borné, pour détecter un dépassement. */
  rawRatio: number
}

/**
 * Temps cumulé par projet sur sa propre fenêtre de période.
 * Les sessions dont le projet n'existe plus sont ignorées.
 */
export function aggregateByProject(
  projects: Project[],
  sessions: Session[],
  dayStartHour: number,
  now: number,
): Record<string, ProjectProgress> {
  const result: Record<string, ProjectProgress> = {}

  for (const p of projects) {
    if (!p.timeTarget) continue
    const { start, end } = periodRange(p.timeTarget.period, dayStartHour, now)
    const spentMs = sessions.reduce((sum, s) => {
      if (s.projectId !== p.id) return sum
      if (s.startedAt < start || s.startedAt >= end) return sum
      return sum + s.durationMs
    }, 0)
    const spentMinutes = Math.floor(spentMs / 60_000)
    const targetMinutes = p.timeTarget.targetMinutes
    const rawRatio = targetMinutes > 0 ? spentMinutes / targetMinutes : 0
    result[p.id] = {
      periodStart: start,
      periodEnd: end,
      spentMinutes,
      targetMinutes,
      ratio: Math.min(1, rawRatio),
      rawRatio,
    }
  }

  return result
}

/**
 * Début de la fenêtre la plus large parmi les cadences réellement utilisées.
 * Sert à ne charger que les sessions nécessaires. null = aucune cible définie.
 */
export function widestRangeStart(
  projects: Project[],
  dayStartHour: number,
  now: number,
): number | null {
  let earliest: number | null = null
  for (const p of projects) {
    if (!p.timeTarget) continue
    const { start } = periodRange(p.timeTarget.period, dayStartHour, now)
    if (earliest === null || start < earliest) earliest = start
  }
  return earliest
}
