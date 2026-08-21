import type { Session } from '@/features/goals/types'
import type { PeriodRange } from '@/lib/time'

export interface PositionedSession {
  session: Session
  /** Fraction de la fenêtre : 0 = début de la grille, 1 = fin. */
  top: number
  height: number
  /** Colonne occupée dans son groupe de chevauchement. */
  column: number
  /** Nombre de colonnes du groupe, donc largeur = 1 / columnCount. */
  columnCount: number
  clippedEnd: boolean
}

interface Bounded {
  session: Session
  start: number
  end: number
  clippedEnd: boolean
  column: number
}

export function layoutDaySessions(
  sessions: Session[],
  range: PeriodRange,
): PositionedSession[] {
  const span = range.end - range.start
  if (span <= 0) return []

  const bounded: Bounded[] = []
  for (const session of sessions) {
    const rawStart = session.startedAt
    const rawEnd = session.startedAt + session.durationMs
    // Une session appartient à la fenêtre qui contient son début : jamais dessinée ailleurs.
    if (rawStart < range.start || rawStart >= range.end) continue
    bounded.push({
      session,
      start: rawStart,
      end: Math.min(rawEnd, range.end),
      clippedEnd: rawEnd > range.end,
      column: 0,
    })
  }

  // Tri par début, départagé par id pour que deux appels donnent le même ordre.
  bounded.sort((a, b) => a.start - b.start || a.session.id.localeCompare(b.session.id))

  const result: PositionedSession[] = []
  let group: Bounded[] = []
  /** Fin de la dernière session placée dans chaque colonne du groupe courant. */
  let columnEnds: number[] = []

  function flushGroup() {
    const columnCount = columnEnds.length
    for (const b of group) {
      result.push({
        session: b.session,
        top: (b.start - range.start) / span,
        height: (b.end - b.start) / span,
        column: b.column,
        columnCount,
        clippedEnd: b.clippedEnd,
      })
    }
    group = []
    columnEnds = []
  }

  for (const b of bounded) {
    // Un groupe se ferme quand plus aucune de ses colonnes n'est encore occupée.
    const groupEnd = columnEnds.length ? Math.max(...columnEnds) : -Infinity
    if (b.start >= groupEnd) flushGroup()

    let column = columnEnds.findIndex((end) => end <= b.start)
    if (column === -1) {
      column = columnEnds.length
      columnEnds.push(b.end)
    } else {
      columnEnds[column] = b.end
    }

    b.column = column
    group.push(b)
  }
  flushGroup()

  return result
}
