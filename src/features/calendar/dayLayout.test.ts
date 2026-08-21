import { describe, it, expect } from 'vitest'
import type { Session } from '@/features/goals/types'
import type { PeriodRange } from '@/lib/time'
import { layoutDaySessions } from './dayLayout'

const HOUR = 3_600_000
const DAY_START = new Date(2026, 2, 10, 4).getTime() // 10 mars 2026, 4h locales
const RANGE: PeriodRange = { start: DAY_START, end: DAY_START + 24 * HOUR }

/** Session démarrant `fromHour` heures après le début de la fenêtre. */
function at(id: string, fromHour: number, durationHours: number): Session {
  return {
    id,
    projectId: 'p1',
    taskId: 't1',
    startedAt: DAY_START + fromHour * HOUR,
    durationMs: durationHours * HOUR,
    type: 'focus',
  }
}

describe('layoutDaySessions — positions', () => {
  it("place une session d'une heure sur 1/24 de la hauteur", () => {
    const [block] = layoutDaySessions([at('a', 6, 1)], RANGE)
    expect(block.top).toBeCloseTo(6 / 24)
    expect(block.height).toBeCloseTo(1 / 24)
  })

  it("place une session commençant au début de la fenêtre à top 0", () => {
    const [block] = layoutDaySessions([at('a', 0, 2)], RANGE)
    expect(block.top).toBe(0)
  })

  it("reste proportionnel sur une fenêtre de 23 heures", () => {
    const shortRange: PeriodRange = { start: DAY_START, end: DAY_START + 23 * HOUR }
    const [block] = layoutDaySessions([at('a', 0, 23)], shortRange)
    expect(block.height).toBeCloseTo(1)
  })

  it("n'applique aucun plancher de hauteur — 30 secondes reste 30 secondes", () => {
    const tiny = { ...at('a', 6, 0), durationMs: 30_000 }
    const [block] = layoutDaySessions([tiny], RANGE)
    expect(block.height).toBeCloseTo(30_000 / (24 * HOUR))
  })
})

describe('layoutDaySessions — troncature', () => {
  it("exclut une session dont le début précède la fenêtre, même si elle déborde dedans", () => {
    const before = { ...at('a', 0, 2), startedAt: DAY_START - HOUR }
    expect(layoutDaySessions([before], RANGE)).toEqual([])
  })

  it("tronque une session qui déborde après la fenêtre", () => {
    const [block] = layoutDaySessions([at('a', 23, 3)], RANGE)
    expect(block.clippedEnd).toBe(true)
    expect(block.top + block.height).toBeCloseTo(1)
  })

  it("ne signale aucune troncature pour une session entièrement dedans", () => {
    const [block] = layoutDaySessions([at('a', 6, 1)], RANGE)
    expect(block.clippedEnd).toBe(false)
  })

  it("exclut une session entièrement antérieure à la fenêtre", () => {
    const outside = { ...at('a', 0, 1), startedAt: DAY_START - 5 * HOUR }
    expect(layoutDaySessions([outside], RANGE)).toEqual([])
  })

  it("exclut une session entièrement postérieure à la fenêtre", () => {
    const outside = { ...at('a', 0, 1), startedAt: DAY_START + 30 * HOUR }
    expect(layoutDaySessions([outside], RANGE)).toEqual([])
  })

  it("borne top et height à l'intervalle [0, 1]", () => {
    const huge = { ...at('a', 0, 0), durationMs: 50 * HOUR }
    const [block] = layoutDaySessions([huge], RANGE)
    expect(block.top).toBeGreaterThanOrEqual(0)
    expect(block.height).toBeLessThanOrEqual(1)
  })

  it("exclut une session commençant une milliseconde avant le début de la fenêtre", () => {
    const justBefore = { ...at('a', 0, 1), startedAt: DAY_START - 1 }
    expect(layoutDaySessions([justBefore], RANGE)).toEqual([])
  })

  it("inclut une session commençant exactement au début de la fenêtre", () => {
    const [block] = layoutDaySessions([at('a', 0, 1)], RANGE)
    expect(block.top).toBe(0)
  })
})

describe('layoutDaySessions — colonnes', () => {
  it("donne toute la largeur à une session seule", () => {
    const [block] = layoutDaySessions([at('a', 6, 1)], RANGE)
    expect(block.column).toBe(0)
    expect(block.columnCount).toBe(1)
  })

  it("donne toute la largeur à deux sessions disjointes", () => {
    const blocks = layoutDaySessions([at('a', 6, 1), at('b', 8, 1)], RANGE)
    expect(blocks.map((b) => b.columnCount)).toEqual([1, 1])
    expect(blocks.map((b) => b.column)).toEqual([0, 0])
  })

  it("partage la largeur entre deux sessions qui se recouvrent", () => {
    const blocks = layoutDaySessions([at('a', 6, 2), at('b', 7, 2)], RANGE)
    expect(blocks.map((b) => b.columnCount)).toEqual([2, 2])
    expect(blocks.map((b) => b.column)).toEqual([0, 1])
  })

  it("traite une chaîne A–B–C comme un seul groupe de deux colonnes", () => {
    // A 6h→8h, B 7h→9h, C 8h30→10h : A et C sont disjointes, mais B les relie.
    const a = at('a', 6, 2)
    const b = at('b', 7, 2)
    const c = { ...at('c', 8, 1.5), startedAt: DAY_START + 8.5 * HOUR }
    const blocks = layoutDaySessions([a, b, c], RANGE)
    expect(blocks.every((x) => x.columnCount === 2)).toBe(true)
    // C réutilise la colonne libérée par A
    expect(blocks.find((x) => x.session.id === 'c')?.column).toBe(0)
  })

  it("sépare deux groupes distincts sans les compter ensemble", () => {
    const blocks = layoutDaySessions(
      [at('a', 6, 2), at('b', 7, 2), at('c', 14, 1)],
      RANGE,
    )
    expect(blocks.find((x) => x.session.id === 'c')?.columnCount).toBe(1)
    expect(blocks.find((x) => x.session.id === 'a')?.columnCount).toBe(2)
  })

  it("place une session incluse dans une autre en deuxième colonne", () => {
    const outer = at('a', 6, 4)
    const inner = at('b', 7, 1)
    const blocks = layoutDaySessions([outer, inner], RANGE)
    expect(blocks.find((x) => x.session.id === 'b')?.column).toBe(1)
    expect(blocks.every((x) => x.columnCount === 2)).toBe(true)
  })

  it("ne compte pas comme chevauchement deux sessions bout à bout", () => {
    const blocks = layoutDaySessions([at('a', 6, 1), at('b', 7, 1)], RANGE)
    expect(blocks.every((x) => x.columnCount === 1)).toBe(true)
  })

  it("monte à trois colonnes quand trois sessions se recouvrent", () => {
    const blocks = layoutDaySessions([at('a', 6, 3), at('b', 6.5, 3), at('c', 7, 3)], RANGE)
    expect(blocks.every((x) => x.columnCount === 3)).toBe(true)
    expect(blocks.map((x) => x.column).sort()).toEqual([0, 1, 2])
  })
})

describe('layoutDaySessions — ordre', () => {
  it("trie par début croissant quel que soit l'ordre d'entrée", () => {
    const blocks = layoutDaySessions([at('c', 14, 1), at('a', 6, 1), at('b', 9, 1)], RANGE)
    expect(blocks.map((x) => x.session.id)).toEqual(['a', 'b', 'c'])
  })

  it("départage deux débuts identiques de façon déterministe", () => {
    const first = layoutDaySessions([at('b', 6, 1), at('a', 6, 1)], RANGE)
    const second = layoutDaySessions([at('a', 6, 1), at('b', 6, 1)], RANGE)
    expect(first.map((x) => x.session.id)).toEqual(second.map((x) => x.session.id))
  })
})
