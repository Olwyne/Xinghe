import type { PeriodRange } from '@/lib/time'

/** Le quart d'heure : le pas d'accrochage de la grille. */
export const SNAP_STEP_MS = 900_000

/** Arrondit au pas le plus proche. */
export function snapToStep(ms: number, stepMs: number): number {
  return Math.round(ms / stepMs) * stepMs
}

/**
 * Nouveau début d'un bloc tiré de `deltaPx` pixels.
 *
 * Deux règles :
 * - l'accrochage se compte depuis le début de la fenêtre, pas depuis l'époque,
 *   pour que les blocs se posent sur les traits dessinés même les jours de 23
 *   ou 25 heures ;
 * - on borne le début, jamais la fin. Un bloc de deux heures tiré près du bord
 *   garde sa durée et ressort tronqué à droite — le raccourcir serait une
 *   écriture que le geste n'a pas demandée.
 */
export function dragToStart(args: {
  originalStart: number
  deltaPx: number
  pxPerMs: number
  range: PeriodRange
  stepMs: number
}): number {
  const { originalStart, deltaPx, pxPerMs, range, stepMs } = args
  if (!Number.isFinite(pxPerMs) || pxPerMs <= 0) return originalStart

  const raw = originalStart + deltaPx / pxPerMs
  const snapped = range.start + snapToStep(raw - range.start, stepMs)

  if (snapped < range.start) return range.start
  const lastStep = range.end - stepMs
  if (snapped > lastStep) return lastStep
  return snapped
}
