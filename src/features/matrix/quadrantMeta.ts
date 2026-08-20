import type { Quadrant } from '@/features/tasks/types'

export const QUADRANT_META: Record<Quadrant, { color: string }> = {
  1: { color: 'var(--xh-focus)' },
  2: { color: 'var(--xh-short)' },
  3: { color: 'var(--xh-long)' },
  4: { color: 'var(--xh-text-faint)' },
}
