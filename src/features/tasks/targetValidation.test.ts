import { describe, it, expect } from 'vitest'
import { MAX_MINUTES, isValidTarget, parseTargetMinutes } from './targetValidation'

describe('MAX_MINUTES', () => {
  it('vaut 24h par jour de la période', () => {
    expect(MAX_MINUTES.day).toBe(1440)
    expect(MAX_MINUTES.week).toBe(10080)
    expect(MAX_MINUTES.month).toBe(44640)
  })
})

describe('isValidTarget', () => {
  it("accepte le minimum d'une minute", () => {
    expect(isValidTarget('day', 1)).toBe(true)
  })

  it('refuse zéro', () => {
    expect(isValidTarget('day', 0)).toBe(false)
  })

  it('refuse une valeur négative', () => {
    expect(isValidTarget('day', -30)).toBe(false)
  })

  it('accepte exactement le maximum de chaque cadence', () => {
    expect(isValidTarget('day', 1440)).toBe(true)
    expect(isValidTarget('week', 10080)).toBe(true)
    expect(isValidTarget('month', 44640)).toBe(true)
  })

  it('refuse une minute au-dessus du maximum de chaque cadence', () => {
    expect(isValidTarget('day', 1441)).toBe(false)
    expect(isValidTarget('week', 10081)).toBe(false)
    expect(isValidTarget('month', 44641)).toBe(false)
  })

  it('refuse une valeur non entière', () => {
    expect(isValidTarget('day', 30.5)).toBe(false)
  })

  it('refuse NaN', () => {
    expect(isValidTarget('day', NaN)).toBe(false)
  })

  it('borne chaque cadence indépendamment', () => {
    // 2000 min dépasse le maximum quotidien mais reste valide sur une semaine
    expect(isValidTarget('day', 2000)).toBe(false)
    expect(isValidTarget('week', 2000)).toBe(true)
  })
})

describe('parseTargetMinutes', () => {
  it('combine heures et minutes', () => {
    expect(parseTargetMinutes('6', '30')).toBe(390)
  })

  it('traite les champs vides comme zéro', () => {
    expect(parseTargetMinutes('', '')).toBe(0)
  })

  it('traite une saisie non numérique comme zéro', () => {
    expect(parseTargetMinutes('abc', '30')).toBe(30)
  })

  it('accepte des minutes au-delà de 59', () => {
    expect(parseTargetMinutes('1', '90')).toBe(150)
  })
})
