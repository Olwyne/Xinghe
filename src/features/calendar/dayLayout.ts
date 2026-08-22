import type { Session } from '@/features/goals/types'
import type { PeriodRange } from '@/lib/time'

/** Le minimum pour être placé sur la grille : un identifiant et un intervalle. */
export interface Span {
  id: string
  startedAt: number
  durationMs: number
}

export interface Positioned<T> {
  item: T
  /** Fraction de la fenêtre : 0 = début de la grille, 1 = fin. */
  top: number
  height: number
  /** Colonne occupée dans son groupe de chevauchement. */
  column: number
  /** Nombre de colonnes du groupe, donc largeur = 1 / columnCount. */
  columnCount: number
  clippedEnd: boolean
}

export interface PositionedSession {
  session: Session
  top: number
  height: number
  column: number
  columnCount: number
  clippedEnd: boolean
}

interface Bounded<T> {
  item: T
  start: number
  end: number
  clippedEnd: boolean
  column: number
}

/**
 * Dispose des intervalles sur une fenêtre.
 *
 * Générique parce que la grille tient deux couloirs — les sessions mesurées
 * et les blocs planifiés — disposés par deux appels séparés : deux objets de
 * couloirs différents ne doivent jamais se partager une colonne.
 */
export function layoutSpans<T extends Span>(
  items: T[],
  range: PeriodRange,
): Positioned<T>[] {
  const span = range.end - range.start
  if (span <= 0) return []

  const bounded: Bounded<T>[] = []
  for (const item of items) {
    const rawStart = item.startedAt
    const rawEnd = item.startedAt + item.durationMs
    // Un objet appartient à la fenêtre qui contient son début : jamais dessiné ailleurs.
    if (rawStart < range.start || rawStart >= range.end) continue
    bounded.push({
      item,
      start: rawStart,
      end: Math.min(rawEnd, range.end),
      clippedEnd: rawEnd > range.end,
      column: 0,
    })
  }

  // Tri par début, départagé par id pour que deux appels donnent le même ordre.
  bounded.sort((a, b) => a.start - b.start || a.item.id.localeCompare(b.item.id))

  const result: Positioned<T>[] = []
  let group: Bounded<T>[] = []
  /** Fin du dernier objet placé dans chaque colonne du groupe courant. */
  let columnEnds: number[] = []

  function flushGroup() {
    const columnCount = columnEnds.length
    for (const b of group) {
      result.push({
        item: b.item,
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
    let groupEnd = -Infinity
    for (const end of columnEnds) {
      if (end > groupEnd) groupEnd = end
    }
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

/** Enveloppe historique : même disposition, l'objet placé s'appelle `session`. */
export function layoutDaySessions(
  sessions: Session[],
  range: PeriodRange,
): PositionedSession[] {
  return layoutSpans(sessions, range).map(({ item, ...rest }) => ({
    session: item,
    ...rest,
  }))
}
