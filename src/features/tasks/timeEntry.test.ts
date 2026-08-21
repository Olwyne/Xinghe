import { describe, it, expect } from 'vitest'
import type { Session } from '@/features/goals/types'
import {
  validateEntry,
  draftToStartedAt,
  sessionToDraft,
  totalMinutes,
  reassignSessions,
  type TimeEntryDraft,
} from './timeEntry'

/** Minuit local d'un jour donné, sans dépendre du fuseau du runner. */
function day(y: number, m: number, d: number): number {
  return new Date(y, m - 1, d).getTime()
}

function draft(over: Partial<TimeEntryDraft> = {}): TimeEntryDraft {
  return { day: day(2026, 3, 10), startMinutes: 9 * 60, durationMinutes: 30, ...over }
}

function session(over: Partial<Session> = {}): Session {
  return {
    id: 's1',
    projectId: 'p1',
    taskId: 't1',
    startedAt: day(2026, 3, 10) + 9 * 60 * 60_000,
    durationMs: 30 * 60_000,
    type: 'focus',
    ...over,
  }
}

const NOW = day(2026, 3, 10) + 12 * 60 * 60_000 // 10 mars 2026, midi

describe('validateEntry', () => {
  it('accepte une entrée nominale', () => {
    expect(validateEntry(draft(), NOW)).toBeNull()
  })

  it("accepte une durée d'exactement une minute", () => {
    expect(validateEntry(draft({ durationMinutes: 1 }), NOW)).toBeNull()
  })

  it('refuse une durée nulle', () => {
    expect(validateEntry(draft({ durationMinutes: 0 }), NOW)).toBe('duration-too-short')
  })

  it('refuse une durée négative', () => {
    expect(validateEntry(draft({ durationMinutes: -30 }), NOW)).toBe('duration-too-short')
  })

  it("accepte un début à l'instant présent",  () => {
    expect(validateEntry(draft({ startMinutes: 12 * 60 }), NOW)).toBeNull()
  })

  it('refuse un début dans le futur', () => {
    expect(validateEntry(draft({ startMinutes: 12 * 60 + 1 }), NOW)).toBe('starts-in-future')
  })

  it('refuse un jour futur même à une heure passée', () => {
    expect(validateEntry(draft({ day: day(2026, 3, 11) }), NOW)).toBe('starts-in-future')
  })

  it('accepte une entrée ancienne', () => {
    expect(validateEntry(draft({ day: day(2020, 1, 5) }), NOW)).toBeNull()
  })

  it('signale la durée avant le futur quand les deux sont invalides', () => {
    const d = draft({ day: day(2026, 3, 11), durationMinutes: 0 })
    expect(validateEntry(d, NOW)).toBe('duration-too-short')
  })

  it('refuse une durée fractionnaire', () => {
    expect(validateEntry(draft({ durationMinutes: 1.5 }), NOW)).toBe('duration-too-short')
  })

  it('refuse un jour vidé (NaN, depuis un <input type="date"> vidé)', () => {
    expect(validateEntry(draft({ day: NaN }), NOW)).toBe('invalid-time')
  })

  it('refuse une heure de début vidée (NaN, depuis un <input type="time"> vidé)', () => {
    expect(validateEntry(draft({ startMinutes: NaN }), NOW)).toBe('invalid-time')
  })

  it('refuse un jour non entier', () => {
    expect(validateEntry(draft({ day: day(2026, 3, 10) + 0.5 }), NOW)).toBe('invalid-time')
  })

  it("refuse une heure de début non entière", () => {
    expect(validateEntry(draft({ startMinutes: 90.5 }), NOW)).toBe('invalid-time')
  })

  it('refuse une heure de début négative', () => {
    expect(validateEntry(draft({ startMinutes: -1 }), NOW)).toBe('invalid-time')
  })

  it('refuse une heure de début à 1440 (hors journée)', () => {
    expect(validateEntry(draft({ startMinutes: 1440 }), NOW)).toBe('invalid-time')
  })

  it('accepte la borne basse : minuit (0)', () => {
    expect(validateEntry(draft({ startMinutes: 0 }), NOW)).toBeNull()
  })

  it('accepte la borne haute : 23h59 (1439)', () => {
    const d = draft({ day: day(2020, 1, 5), startMinutes: 1439 })
    expect(validateEntry(d, NOW)).toBeNull()
  })
})

describe('draftToStartedAt', () => {
  it("combine le jour et l'heure",  () => {
    expect(draftToStartedAt(draft())).toBe(day(2026, 3, 10) + 9 * 60 * 60_000)
  })

  it('gère minuit', () => {
    expect(draftToStartedAt(draft({ startMinutes: 0 }))).toBe(day(2026, 3, 10))
  })

  it('gère 23h59', () => {
    expect(draftToStartedAt(draft({ startMinutes: 23 * 60 + 59 })))
      .toBe(day(2026, 3, 10) + (23 * 60 + 59) * 60_000)
  })
})

describe('sessionToDraft', () => {
  it("décompose une session en jour, heure et durée", () => {
    const d = sessionToDraft(session())
    expect(d.day).toBe(day(2026, 3, 10))
    expect(d.startMinutes).toBe(9 * 60)
    expect(d.durationMinutes).toBe(30)
  })

  it('fait un aller-retour sans perte pour une durée en minutes entières', () => {
    const original = draft({ startMinutes: 14 * 60 + 35, durationMinutes: 95 })
    const s = session({
      startedAt: draftToStartedAt(original),
      durationMs: original.durationMinutes * 60_000,
    })
    expect(sessionToDraft(s)).toEqual(original)
  })

  it("tronque les secondes d'une session mesurée",  () => {
    const s = session({ durationMs: 25 * 60_000 + 47_000 })
    expect(sessionToDraft(s).durationMinutes).toBe(25)
  })

  it("reste sur le bon jour local après un changement d'heure", () => {
    // Dernier dimanche de mars : passage à l'heure d'été dans la plupart des
    // fuseaux européens. On fixe le fuseau du runner pour ne pas dépendre de
    // la machine qui exécute les tests (une CI tourne souvent en UTC, où le
    // cas serait vide de sens : sans décalage, aucune implémentation ne peut
    // se tromper).
    //
    // 00h30 est choisi tout près de minuit : une décomposition naïve du jour
    // par troncature de l'horodatage epoch (`startedAt - startedAt %
    // 86_400_000`) ignore le fuseau local et retombe sur un jour différent
    // dès que le décalage horaire local n'est pas nul — ce que la
    // décomposition calendaire correcte (année/mois/jour locaux) évite.
    // (No @types/node in this project, so process is reached via globalThis.)
    const proc = (globalThis as { process?: { env: Record<string, string | undefined> } })
      .process!
    const originalTZ = proc.env.TZ
    proc.env.TZ = 'Europe/Paris'
    try {
      const s = session({ startedAt: day(2026, 3, 29) + 30 * 60_000 })
      const d = sessionToDraft(s)
      expect(d.day).toBe(day(2026, 3, 29))
      expect(d.startMinutes).toBe(30)
    } finally {
      proc.env.TZ = originalTZ
    }
  })
})

describe('totalMinutes', () => {
  it('vaut zéro sans session', () => {
    expect(totalMinutes([])).toBe(0)
  })

  it('somme plusieurs sessions', () => {
    expect(totalMinutes([session(), session({ id: 's2', durationMs: 45 * 60_000 })])).toBe(75)
  })

  it('tronque le total à la minute inférieure', () => {
    const a = session({ durationMs: 30_000 })
    const b = session({ id: 's2', durationMs: 45_000 })
    // 75 s au total : une minute pleine, pas deux
    expect(totalMinutes([a, b])).toBe(1)
  })
})

describe('reassignSessions', () => {
  it('change le projet des sessions de la tâche', () => {
    const result = reassignSessions([session(), session({ id: 's2' })], 't1', 'p2')
    expect(result.map((s) => s.projectId)).toEqual(['p2', 'p2'])
  })

  it('laisse les sessions des autres tâches intactes', () => {
    const other = session({ id: 's2', taskId: 't2', projectId: 'p9' })
    const result = reassignSessions([session(), other], 't1', 'p2')
    expect(result.find((s) => s.id === 's2')?.projectId).toBe('p9')
  })

  it('ignore les sessions sans tâche', () => {
    const orphan = session({ id: 's3', taskId: null, projectId: 'p9' })
    const result = reassignSessions([orphan], 't1', 'p2')
    expect(result[0].projectId).toBe('p9')
  })

  it('préserve les autres champs et ne mute ni le tableau ni ses sessions', () => {
    const untouched = session({ id: 's2', taskId: 't2', projectId: 'p9' })
    const target = session()
    const input = [target, untouched]
    const inputSnapshot = input.map((s) => ({ ...s }))

    const result = reassignSessions(input, 't1', 'p2')

    // La session non concernée garde tous ses champs, pas seulement projectId.
    const resultUntouched = result.find((s) => s.id === 's2')
    expect(resultUntouched).toEqual(untouched)

    // Ni le tableau d'entrée ni ses objets ne sont mutés en place.
    expect(input).toEqual(inputSnapshot)
    expect(input[0]).toBe(target)
    expect(input[1]).toBe(untouched)
    expect(result).not.toBe(input)
    expect(result[0]).not.toBe(target)
  })
})
