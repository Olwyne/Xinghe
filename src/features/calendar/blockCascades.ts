import type { PlannedBlock } from './types'

/**
 * Une tâche supprimée emporte ses blocs : « faire quelque chose de 9h à 11h »
 * sans savoir quoi n'est ni corrigeable ni utile.
 */
export function removeBlocksOfTask(blocks: PlannedBlock[], taskId: string): PlannedBlock[] {
  return blocks.filter((b) => b.taskId !== taskId)
}

/**
 * Une tâche qui change de projet emmène ses blocs : sinon le prévu resterait
 * compté dans les objectifs de son ancien projet, alors que le réel a suivi.
 */
export function reassignBlocksOfTask(
  blocks: PlannedBlock[],
  taskId: string,
  newProjectId: string,
): PlannedBlock[] {
  return blocks.map((b) => (b.taskId === taskId ? { ...b, projectId: newProjectId } : b))
}

/**
 * Un projet supprimé emmène ses blocs vers l'inbox, comme ses tâches et ses
 * sessions : sinon leur projectId pointerait sur un projet mort et le bloc
 * perdrait sa couleur.
 */
export function reassignBlocksOfProject(
  blocks: PlannedBlock[],
  projectId: string,
  newProjectId: string,
): PlannedBlock[] {
  return blocks.map((b) => (b.projectId === projectId ? { ...b, projectId: newProjectId } : b))
}
