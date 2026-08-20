import { describe, it, expect } from 'vitest'
import type { Project } from '@/features/tasks/types'
import type { Session } from './types'
import {
  normalizeToDaily,
  computeAllocation,
  aggregateByProject,
  widestRangeStart,
  buildTargetRows,
} from './progress'

function at(y: number, m: number, d: number, h = 0): number {
  return new Date(y, m - 1, d, h, 0, 0, 0).getTime()
}

const NOW = at(2026, 3, 10, 12) // mardi 10 mars 2026, 12h

function project(id: string, target: Project['timeTarget']): Project {
  return {
    id,
    name: id,
    color: '#fff',
    icon: '*',
    createdAt: 0,
    order: 0,
    isInbox: false,
    timeTarget: target,
  }
}

function session(projectId: string, startedAt: number, minutes: number): Session {
  return {
    id: `${projectId}-${startedAt}`,
    projectId,
    taskId: null,
    startedAt,
    durationMs: minutes * 60_000,
    type: 'focus',
  }
}

describe('normalizeToDaily', () => {
  it('laisse une cible quotidienne inchangée', () => {
    expect(normalizeToDaily('day', 90)).toBe(90)
  })

  it('divise une cible hebdomadaire par 7', () => {
    expect(normalizeToDaily('week', 420)).toBe(60)
  })

  it('divise une cible mensuelle par 30', () => {
    expect(normalizeToDaily('month', 1800)).toBe(60)
  })
})

describe('computeAllocation', () => {
  it('somme les cibles normalisées', () => {
    const a = computeAllocation(
      [project('a', { period: 'day', targetMinutes: 60 }), project('b', { period: 'week', targetMinutes: 420 })],
      180,
    )
    expect(a.totalTargetPerDay).toBe(120)
    expect(a.isOverAllocated).toBe(false)
  })

  it('signale la sur-allocation', () => {
    const a = computeAllocation(
      [project('a', { period: 'day', targetMinutes: 200 })],
      180,
    )
    expect(a.isOverAllocated).toBe(true)
  })

  it('ne signale rien quand le total égale exactement l’objectif global', () => {
    const a = computeAllocation([project('a', { period: 'day', targetMinutes: 180 })], 180)
    expect(a.isOverAllocated).toBe(false)
  })

  it('ne signale rien quand l’objectif global vaut 0', () => {
    const a = computeAllocation([project('a', { period: 'day', targetMinutes: 600 })], 0)
    expect(a.isOverAllocated).toBe(false)
  })

  it('signale un dépassement inférieur à la minute', () => {
    // 1263 min/semaine = 180,43 min/jour, juste au-dessus d'un objectif de 180
    const a = computeAllocation(
      [project('a', { period: 'week', targetMinutes: 1263 })],
      180,
    )
    expect(a.totalTargetPerDay).toBe(180)
    expect(a.isOverAllocated).toBe(true)
  })

  it('ignore les projets sans cible', () => {
    const a = computeAllocation([project('a', null), project('b', undefined)], 180)
    expect(a.totalTargetPerDay).toBe(0)
    expect(a.isOverAllocated).toBe(false)
  })
})

describe('aggregateByProject', () => {
  const projects = [
    project('thesis', { period: 'week', targetMinutes: 360 }),
    project('sport', { period: 'day', targetMinutes: 30 }),
    project('noTarget', null),
  ]

  it('cumule les sessions de la fenêtre par projet', () => {
    const sessions = [
      session('thesis', at(2026, 3, 9, 10), 60),  // lundi, dans la semaine
      session('thesis', at(2026, 3, 10, 9), 70),  // mardi, dans la semaine
      session('sport', at(2026, 3, 10, 8), 20),   // mardi, dans la journée
    ]
    const result = aggregateByProject(projects, sessions, 4, NOW)
    expect(result.thesis.spentMinutes).toBe(130)
    expect(result.thesis.targetMinutes).toBe(360)
    expect(result.sport.spentMinutes).toBe(20)
  })

  it('exclut les sessions hors fenêtre', () => {
    const sessions = [
      session('sport', at(2026, 3, 9, 8), 45),   // la veille
      session('sport', at(2026, 3, 10, 2), 15),  // 2h du matin => veille avec dayStart=4
      session('sport', at(2026, 3, 10, 8), 20),
    ]
    const result = aggregateByProject(projects, sessions, 4, NOW)
    expect(result.sport.spentMinutes).toBe(20)
  })

  it('ignore les sessions orphelines dont le projet n’existe plus', () => {
    const sessions = [session('deleted', at(2026, 3, 10, 9), 50)]
    const result = aggregateByProject(projects, sessions, 4, NOW)
    expect(result.deleted).toBeUndefined()
    expect(Object.keys(result).sort()).toEqual(['sport', 'thesis'])
  })

  it('n’inclut pas les projets sans cible', () => {
    const result = aggregateByProject(projects, [], 4, NOW)
    expect(result.noTarget).toBeUndefined()
  })

  it('borne ratio à 1 et expose rawRatio au-delà', () => {
    const sessions = [session('sport', at(2026, 3, 10, 8), 60)] // cible 30
    const result = aggregateByProject(projects, sessions, 4, NOW)
    expect(result.sport.ratio).toBe(1)
    expect(result.sport.rawRatio).toBe(2)
  })

  it('donne un ratio de 0 sans session', () => {
    const result = aggregateByProject(projects, [], 4, NOW)
    expect(result.sport.spentMinutes).toBe(0)
    expect(result.sport.ratio).toBe(0)
  })
})

describe('widestRangeStart', () => {
  it('retourne le début de la fenêtre la plus large utilisée', () => {
    const start = widestRangeStart(
      [project('a', { period: 'day', targetMinutes: 30 }), project('b', { period: 'week', targetMinutes: 60 })],
      4,
      NOW,
    )
    expect(start).toBe(at(2026, 3, 9, 4)) // lundi 4h, plus large que la journée
  })

  it('retourne null quand aucun projet n’a de cible', () => {
    expect(widestRangeStart([project('a', null)], 4, NOW)).toBeNull()
  })
})

describe('buildTargetRows', () => {
  const projects = [
    project('thesis', { period: 'week', targetMinutes: 360 }),
    project('sport', { period: 'day', targetMinutes: 30 }),
    project('noTarget', null),
  ]

  it('ne retourne que les projets ayant une cible', () => {
    const byProject = aggregateByProject(projects, [], 4, NOW)
    const rows = buildTargetRows(projects, byProject)
    expect(rows.map((r) => r.projectId).sort()).toEqual(['sport', 'thesis'])
  })

  it('traduit la cadence en clé de libellé de fenêtre', () => {
    const byProject = aggregateByProject(projects, [], 4, NOW)
    const rows = buildTargetRows(projects, byProject)
    expect(rows.find((r) => r.projectId === 'thesis')?.periodKey).toBe('thisWeek')
    expect(rows.find((r) => r.projectId === 'sport')?.periodKey).toBe('thisDay')
  })

  it('marque le dépassement de cible', () => {
    const sessions = [session('sport', at(2026, 3, 10, 8), 45)] // cible 30
    const byProject = aggregateByProject(projects, sessions, 4, NOW)
    const rows = buildTargetRows(projects, byProject)
    const sportRow = rows.find((r) => r.projectId === 'sport')
    expect(sportRow?.isExceeded).toBe(true)
    expect(sportRow?.ratio).toBe(1)
    expect(sportRow?.spentMinutes).toBe(45)
  })

  it('ne marque pas de dépassement quand la cible est juste atteinte', () => {
    const sessions = [session('sport', at(2026, 3, 10, 8), 30)]
    const byProject = aggregateByProject(projects, sessions, 4, NOW)
    const rows = buildTargetRows(projects, byProject)
    expect(rows.find((r) => r.projectId === 'sport')?.isExceeded).toBe(false)
  })

  it('préserve l’ordre des projets', () => {
    const byProject = aggregateByProject(projects, [], 4, NOW)
    expect(buildTargetRows(projects, byProject).map((r) => r.projectId)).toEqual([
      'thesis',
      'sport',
    ])
  })

  it('traduit la cadence mensuelle en clé de libellé de fenêtre', () => {
    const monthlyProjects = [project('reading', { period: 'month', targetMinutes: 600 })]
    const byProject = aggregateByProject(monthlyProjects, [], 4, NOW)
    const rows = buildTargetRows(monthlyProjects, byProject)
    expect(rows[0]?.periodKey).toBe('thisMonth')
  })

  it('expose rawRatio non borné sur la ligne, distinct de ratio borné à 1', () => {
    const sessions = [session('sport', at(2026, 3, 10, 8), 60)] // cible 30, donc 200%
    const byProject = aggregateByProject(projects, sessions, 4, NOW)
    const rows = buildTargetRows(projects, byProject)
    const sportRow = rows.find((r) => r.projectId === 'sport')
    expect(sportRow?.ratio).toBe(1)
    expect(sportRow?.rawRatio).toBe(2)
  })
})
