import { describe, it, expect } from 'vitest'
import type { PeriodRange } from '@/lib/time'
import { snapToStep, dragToStart, clampStartToRange, resolveTimeOfDayInRange, SNAP_STEP_MS } from './blockDrag'

// Le test DST plus bas a besoin d'un fuseau qui observe l'heure d'été pour
// être significatif ; on le fixe explicitement plutôt que de dépendre du
// fuseau ambiant du runner (pas de @types/node dans ce projet, donc process
// se lit via globalThis).
;(globalThis as { process?: { env: Record<string, string | undefined> } }).process!.env.TZ =
  'Europe/Paris'

const HOUR = 3_600_000
const MINUTE = 60_000
const DAY_START = new Date(2026, 2, 10, 4).getTime() // 10 mars 2026, 4h locales
const RANGE: PeriodRange = { start: DAY_START, end: DAY_START + 24 * HOUR }
/** 48 px/heure, la hauteur de la grille. */
const PX_PER_MS = 48 / HOUR

/** Construit un timestamp local, sans dépendre du fuseau du runner. */
function at(y: number, m: number, d: number, h = 0, min = 0): number {
  return new Date(y, m - 1, d, h, min, 0, 0).getTime()
}

describe('snapToStep', () => {
  it("arrondit au pas le plus proche vers le bas", () => {
    expect(snapToStep(7 * MINUTE, SNAP_STEP_MS)).toBe(0)
  })

  it("arrondit au pas le plus proche vers le haut", () => {
    expect(snapToStep(8 * MINUTE, SNAP_STEP_MS)).toBe(15 * MINUTE)
  })

  it("laisse une valeur déjà sur un pas intacte", () => {
    expect(snapToStep(30 * MINUTE, SNAP_STEP_MS)).toBe(30 * MINUTE)
  })

  it("arrondit aussi les valeurs négatives", () => {
    expect(snapToStep(-8 * MINUTE, SNAP_STEP_MS)).toBe(-15 * MINUTE)
  })
})

describe('dragToStart', () => {
  const base = { pxPerMs: PX_PER_MS, range: RANGE, stepMs: SNAP_STEP_MS }

  it("rend le début inchangé quand rien n'a bougé", () => {
    const originalStart = DAY_START + 6 * HOUR
    expect(dragToStart({ ...base, originalStart, deltaPx: 0 })).toBe(originalStart)
  })

  it("descend d'une demi-heure pour 24 px", () => {
    const originalStart = DAY_START + 6 * HOUR
    const result = dragToStart({ ...base, originalStart, deltaPx: 24 })
    expect(result).toBe(originalStart + 30 * MINUTE)
  })

  it("remonte d'une heure pour -48 px", () => {
    const originalStart = DAY_START + 6 * HOUR
    const result = dragToStart({ ...base, originalStart, deltaPx: -48 })
    expect(result).toBe(originalStart - HOUR)
  })

  it("accroche un déplacement intermédiaire au quart d'heure", () => {
    const originalStart = DAY_START + 6 * HOUR
    // 10 px ≈ 12,5 min : le pas le plus proche est 15 min.
    const result = dragToStart({ ...base, originalStart, deltaPx: 10 })
    expect(result).toBe(originalStart + 15 * MINUTE)
  })

  it("accroche sur la grille de la fenêtre, pas sur l'époque", () => {
    // Le début de la fenêtre est volontairement décalé de 5 min par rapport à
    // l'époque (DAY_START, un multiple de 900 000 ms) : avec une fenêtre
    // alignée sur l'époque, un accrochage relatif à l'époque et un
    // accrochage relatif à la fenêtre tombent sur la même grille et le test
    // ne distinguerait pas les deux implémentations. Décalée, seule la
    // version qui accroche depuis `range.start` retombe sur la grille de la
    // fenêtre.
    const offGridRange: PeriodRange = {
      start: DAY_START + 5 * MINUTE,
      end: DAY_START + 5 * MINUTE + 24 * HOUR,
    }
    const originalStart = offGridRange.start + 6 * HOUR + 7 * MINUTE
    const result = dragToStart({ ...base, range: offGridRange, originalStart, deltaPx: 0 })
    expect((result - offGridRange.start) % SNAP_STEP_MS).toBe(0)
  })

  it("borne le début au début de la fenêtre", () => {
    const originalStart = DAY_START + 30 * MINUTE
    const result = dragToStart({ ...base, originalStart, deltaPx: -1000 })
    expect(result).toBe(RANGE.start)
  })

  it("ne borne jamais la fin : un bloc long garde sa durée près du bord", () => {
    // Tiré tout en bas, le début se pose sur le dernier pas de la fenêtre.
    // La durée n'entre pas dans le calcul — le débordement est dessiné
    // comme une troncature, pas corrigé en douce.
    const originalStart = DAY_START + 20 * HOUR
    const result = dragToStart({ ...base, originalStart, deltaPx: 10_000 })
    expect(result).toBe(RANGE.end - SNAP_STEP_MS)
  })

  it("reste dans une fenêtre de 25 heures", () => {
    const longRange: PeriodRange = { start: DAY_START, end: DAY_START + 25 * HOUR }
    const result = dragToStart({
      ...base,
      range: longRange,
      originalStart: DAY_START + 20 * HOUR,
      deltaPx: 10_000,
    })
    expect(result).toBe(longRange.end - SNAP_STEP_MS)
  })

  it("rend le début inchangé si l'échelle est nulle", () => {
    // Une grille de hauteur nulle (mesure faite avant la mise en page) ferait
    // diverger la division : mieux vaut ne pas bouger que sauter à l'infini.
    const originalStart = DAY_START + 6 * HOUR
    expect(dragToStart({ ...base, originalStart, deltaPx: 30, pxPerMs: 0 })).toBe(
      originalStart,
    )
  })
})

describe('clampStartToRange', () => {
  it('laisse intact un début pile sur range.start', () => {
    expect(clampStartToRange(RANGE.start, RANGE, SNAP_STEP_MS)).toBe(RANGE.start)
  })

  it('laisse intact un début pile sur le dernier pas (range.end - stepMs)', () => {
    const lastStep = RANGE.end - SNAP_STEP_MS
    expect(clampStartToRange(lastStep, RANGE, SNAP_STEP_MS)).toBe(lastStep)
  })

  it('ramène un début pile sur range.end au dernier pas', () => {
    expect(clampStartToRange(RANGE.end, RANGE, SNAP_STEP_MS)).toBe(RANGE.end - SNAP_STEP_MS)
  })

  it('ramène un début avant la fenêtre à range.start', () => {
    expect(clampStartToRange(RANGE.start - HOUR, RANGE, SNAP_STEP_MS)).toBe(RANGE.start)
  })
})

describe('resolveTimeOfDayInRange', () => {
  // Fenêtre de référence : 10 mars 2026, 4h locales -> 11 mars 2026, 4h.
  const range = RANGE

  it('une heure à ou après la frontière du jour résout dans la date de début de la fenêtre', () => {
    const result = resolveTimeOfDayInRange(8 * 60, range) // 08:00
    expect(result).toBe(at(2026, 3, 10, 8, 0))
  })

  it('une heure avant la frontière résout le lendemain calendaire, dans la fenêtre', () => {
    const result = resolveTimeOfDayInRange(1 * 60 + 30, range) // 01:30
    expect(result).toBe(at(2026, 3, 11, 1, 30))
    expect(result).toBeGreaterThanOrEqual(range.start)
    expect(result).toBeLessThan(range.end)
  })

  it('les deux bornes de la fenêtre résolvent à l’intérieur', () => {
    // La borne basse : exactement l'heure de frontière (04:00) -> range.start.
    expect(resolveTimeOfDayInRange(4 * 60, range)).toBe(range.start)
    // Juste avant la frontière (03:59) -> le dernier instant représentable
    // avant range.end, sur la date suivante.
    const justBefore = resolveTimeOfDayInRange(3 * 60 + 59, range)
    expect(justBefore).toBeLessThan(range.end)
    expect(justBefore).toBeGreaterThanOrEqual(range.start)
  })

  it('fenêtre de 23 heures (passage à l’heure d’été, 29 mars 2026) : les deux moitiés résolvent dans la fenêtre', () => {
    const dstRange: PeriodRange = { start: at(2026, 3, 28, 4), end: at(2026, 3, 29, 4) }
    expect((dstRange.end - dstRange.start) / HOUR).toBe(23)

    const evening = resolveTimeOfDayInRange(20 * 60, dstRange) // 20:00, avant minuit
    expect(evening).toBe(at(2026, 3, 28, 20, 0))

    const postMidnight = resolveTimeOfDayInRange(1 * 60, dstRange) // 01:00, après minuit
    expect(postMidnight).toBe(at(2026, 3, 29, 1, 0))
    expect(postMidnight).toBeLessThan(dstRange.end)
  })

  it('fenêtre de 25 heures (retour à l’heure d’hiver, 25 octobre 2026) : les deux moitiés résolvent dans la fenêtre', () => {
    // Le passage à l'heure d'hiver a lieu à 3h le 25 octobre 2026 (3h -> 2h) :
    // la fenêtre qui se termine à 4h ce jour-là contient donc le changement
    // et dure 25 heures, pas 24.
    const dstRange: PeriodRange = { start: at(2026, 10, 24, 4), end: at(2026, 10, 25, 4) }
    expect((dstRange.end - dstRange.start) / HOUR).toBe(25)

    const evening = resolveTimeOfDayInRange(20 * 60, dstRange) // 20:00, avant minuit
    expect(evening).toBe(at(2026, 10, 24, 20, 0))

    const postMidnight = resolveTimeOfDayInRange(1 * 60, dstRange) // 01:00, après minuit
    expect(postMidnight).toBe(at(2026, 10, 25, 1, 0))
    expect(postMidnight).toBeLessThan(dstRange.end)
  })
})
