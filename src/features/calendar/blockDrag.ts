import type { PeriodRange } from '@/lib/time'

/** Le quart d'heure : le pas d'accrochage de la grille. */
export const SNAP_STEP_MS = 900_000

/** Arrondit au pas le plus proche. */
export function snapToStep(ms: number, stepMs: number): number {
  return Math.round(ms / stepMs) * stepMs
}

/**
 * Borne un début déjà accroché dans la fenêtre `[range.start, range.end)`.
 *
 * Le point haut de la fenêtre n'est jamais un début valide : un début pile
 * sur `range.end` (ou au-delà) tombe hors du filtre de useDayBlocks et le
 * bloc atterrit silencieusement sur le jour suivant. Partagée entre le tiré
 * (dragToStart) et le clic (DayGrid) : les deux doivent s'accorder sur où
 * finit le dernier créneau du jour, jamais le redériver chacun de son côté.
 */
export function clampStartToRange(snapped: number, range: PeriodRange, stepMs: number): number {
  if (snapped < range.start) return range.start
  const lastStep = range.end - stepMs
  if (snapped > lastStep) return lastStep
  return snapped
}

/**
 * Résout une heure du jour (minutes depuis minuit) dans l'occurrence de
 * cette heure qui tombe réellement dans la fenêtre affichée.
 *
 * La fenêtre d'un jour ne commence pas à minuit mais à `dayStartHour` (le
 * réglage utilisateur, souvent 4h) et court jusqu'à la même heure le
 * lendemain calendaire : elle enjambe minuit. Une heure tapée par
 * l'utilisateur ne porte que l'heure du jour (« 01:30 »), pas la date — il
 * faut donc décider si elle appartient à la date de début de la fenêtre ou
 * au lendemain. La règle : à ou après la frontière (l'heure locale de
 * `range.start`), c'est la date de début ; avant, c'est le lendemain, la
 * partie de la fenêtre qui a passé minuit.
 *
 * Construit via les composants calendaires (année/mois/jour/heure/minute)
 * plutôt qu'en ajoutant des millisecondes à un minuit local : une addition
 * en millisecondes se déraille dès qu'un changement d'heure d'été raccourcit
 * ou allonge la journée locale de l'offset attendu.
 */
export function resolveTimeOfDayInRange(startMinutes: number, range: PeriodRange): number {
  const base = new Date(range.start)
  const boundaryMinutes = base.getHours() * 60 + base.getMinutes()
  const dayOffset = startMinutes >= boundaryMinutes ? 0 : 1
  const hours = Math.floor(startMinutes / 60)
  const minutes = startMinutes % 60
  return new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate() + dayOffset,
    hours,
    minutes,
  ).getTime()
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
  return clampStartToRange(snapped, range, stepMs)
}
