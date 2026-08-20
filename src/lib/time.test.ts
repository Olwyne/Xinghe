import { describe, it, expect } from 'vitest'
import { periodRange } from './time'

const HOUR = 3_600_000

/** Construit un timestamp local, sans dépendre du fuseau du runner. */
function at(y: number, m: number, d: number, h = 0, min = 0): number {
  return new Date(y, m - 1, d, h, min, 0, 0).getTime()
}

describe('periodRange', () => {
  it(`day: 2h du matin appartient à la journée précédente avec dayStart=4`, () => {
    const r = periodRange('day', 4, at(2026, 3, 10, 2, 30))
    expect(r.start).toBe(at(2026, 3, 9, 4))
    expect(r.end).toBe(at(2026, 3, 10, 4))
  })

  it(`day: 10h du matin appartient à la journée courante avec dayStart=4`, () => {
    const r = periodRange('day', 4, at(2026, 3, 10, 10, 0))
    expect(r.start).toBe(at(2026, 3, 10, 4))
    expect(r.end).toBe(at(2026, 3, 11, 4))
  })

  it('day: dayStart=0 revient à minuit', () => {
    const r = periodRange('day', 0, at(2026, 3, 10, 2, 30))
    expect(r.start).toBe(at(2026, 3, 10, 0))
    expect(r.end).toBe(at(2026, 3, 11, 0))
  })

  it('week: commence le lundi', () => {
    // 2026-03-10 est un mardi
    const r = periodRange('week', 4, at(2026, 3, 10, 10))
    expect(r.start).toBe(at(2026, 3, 9, 4))
    expect(r.end).toBe(at(2026, 3, 16, 4))
  })

  it(`week: dimanche appartient à la semaine qui a commencé le lundi précédent`, () => {
    // 2026-03-15 est un dimanche
    const r = periodRange('week', 4, at(2026, 3, 15, 22))
    expect(r.start).toBe(at(2026, 3, 9, 4))
    expect(r.end).toBe(at(2026, 3, 16, 4))
  })

  it(`week: dimanche 2h du matin appartient encore à la semaine précédente`, () => {
    const r = periodRange('week', 4, at(2026, 3, 16, 2))
    expect(r.start).toBe(at(2026, 3, 9, 4))
    expect(r.end).toBe(at(2026, 3, 16, 4))
  })

  it('month: février 2026 (28 jours)', () => {
    const r = periodRange('month', 4, at(2026, 2, 15, 12))
    expect(r.start).toBe(at(2026, 2, 1, 4))
    expect(r.end).toBe(at(2026, 3, 1, 4))
  })

  it('month: janvier (31 jours)', () => {
    const r = periodRange('month', 4, at(2026, 1, 31, 23))
    expect(r.start).toBe(at(2026, 1, 1, 4))
    expect(r.end).toBe(at(2026, 2, 1, 4))
  })

  it(`month: le 1er à 2h du matin appartient au mois précédent`, () => {
    const r = periodRange('month', 4, at(2026, 4, 1, 2))
    expect(r.start).toBe(at(2026, 3, 1, 4))
    expect(r.end).toBe(at(2026, 4, 1, 4))
  })

  it(`week: une semaine traversant un changement d'heure fait 7 jours à une heure près`, () => {
    // Dernier dimanche de mars : passage à l'heure d'été dans la plupart des fuseaux européens
    const r = periodRange('week', 4, at(2026, 3, 30, 12))
    const hours = (r.end - r.start) / HOUR
    expect(hours).toBeGreaterThanOrEqual(167)
    expect(hours).toBeLessThanOrEqual(169)
  })
})
