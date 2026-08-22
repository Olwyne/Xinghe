import { describe, it, expect } from 'vitest'
import type { PeriodRange } from '@/lib/time'
import { snapToStep, dragToStart, SNAP_STEP_MS } from './blockDrag'

const HOUR = 3_600_000
const MINUTE = 60_000
const DAY_START = new Date(2026, 2, 10, 4).getTime() // 10 mars 2026, 4h locales
const RANGE: PeriodRange = { start: DAY_START, end: DAY_START + 24 * HOUR }
/** 48 px/heure, la hauteur de la grille. */
const PX_PER_MS = 48 / HOUR

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
    // Un début décalé de 7 min doit retomber sur un quart d'heure compté
    // depuis le début de la fenêtre, quelle que soit l'heure de celui-ci.
    const originalStart = DAY_START + 6 * HOUR + 7 * MINUTE
    const result = dragToStart({ ...base, originalStart, deltaPx: 0 })
    expect((result - RANGE.start) % SNAP_STEP_MS).toBe(0)
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
