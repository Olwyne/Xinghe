import { describe, it, expect } from 'vitest'
import type { PlannedBlock } from './types'
import { removeBlocksOfTask, reassignBlocksOfTask, reassignBlocksOfProject } from './blockCascades'

function block(id: string, taskId: string, projectId: string): PlannedBlock {
  return { id, taskId, projectId, startedAt: 0, durationMs: 3_600_000, createdAt: 0 }
}

describe('removeBlocksOfTask', () => {
  it('retire les blocs de la tâche supprimée', () => {
    const blocks = [block('a', 't1', 'p1'), block('b', 't2', 'p1'), block('c', 't1', 'p1')]
    expect(removeBlocksOfTask(blocks, 't1').map((b) => b.id)).toEqual(['b'])
  })

  it('rend une liste intacte quand aucun bloc ne correspond', () => {
    const blocks = [block('a', 't2', 'p1')]
    expect(removeBlocksOfTask(blocks, 't1')).toEqual(blocks)
  })
})

describe('reassignBlocksOfTask', () => {
  it('fait suivre les blocs quand la tâche change de projet', () => {
    const blocks = [block('a', 't1', 'p1'), block('b', 't2', 'p1')]
    const next = reassignBlocksOfTask(blocks, 't1', 'p2')
    expect(next.map((b) => b.projectId)).toEqual(['p2', 'p1'])
  })

  it('ne touche pas aux blocs des autres tâches', () => {
    const blocks = [block('a', 't2', 'p1')]
    expect(reassignBlocksOfTask(blocks, 't1', 'p2')).toEqual(blocks)
  })
})

describe('reassignBlocksOfProject', () => {
  it('déplace les blocs du projet supprimé vers le projet cible', () => {
    const blocks = [block('a', 't1', 'p1'), block('b', 't2', 'p2')]
    const next = reassignBlocksOfProject(blocks, 'p1', 'inbox')
    expect(next.map((b) => b.projectId)).toEqual(['inbox', 'p2'])
  })

  it('ne touche pas aux blocs des autres projets', () => {
    const blocks = [block('a', 't1', 'p2')]
    expect(reassignBlocksOfProject(blocks, 'p1', 'inbox')).toEqual(blocks)
  })
})
