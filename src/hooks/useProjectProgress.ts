import { useState, useEffect, useMemo } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db, isFirebaseConfigured } from '@/config/firebase'
import { getStore } from '@/lib/localStore'
import { useProjects } from '@/hooks/useProjects'
import { useDailyGoal } from '@/hooks/useDailyGoal'
import { useTimerSettings } from '@/hooks/useTimerSettings'
import {
  aggregateByProject,
  computeAllocation,
  widestRangeStart,
  type ProjectProgress,
  type Allocation,
} from '@/features/goals/progress'
import type { Session } from '@/features/goals/types'

const LS_KEY = 'xinghe-sessions'

export function useProjectProgress(uid: string | null): {
  byProject: Record<string, ProjectProgress>
  allocation: Allocation
  loading: boolean
} {
  const { projects, loading: projectsLoading } = useProjects(uid)
  const { targetMinutes } = useDailyGoal(uid)
  const { settings } = useTimerSettings()
  const dayStart = settings.dayStart

  const [sessions, setSessions] = useState<Session[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)

  // Début de la fenêtre la plus large : on ne charge jamais un mois
  // de sessions si aucun projet n'a de cible mensuelle.
  const rangeStart = useMemo(
    () => widestRangeStart(projects, dayStart, Date.now()),
    [projects, dayStart],
  )

  useEffect(() => {
    // Tant que useProjects n'a pas résolu, on ne sait pas encore si un
    // projet a une cible : rangeStart === null serait indiscernable du cas
    // « aucune cible ». On ne touche pas sessionsLoading dans ce cas, pour
    // ne pas afficher un « 0 / 6 h » transitoire avant que les projets
    // n'arrivent.
    if (projectsLoading) {
      return
    }

    if (rangeStart === null) {
      setSessions([])
      setSessionsLoading(false)
      return
    }

    if (!isFirebaseConfigured || !uid || !db) {
      const all = getStore<Session[]>(LS_KEY, [])
      setSessions(all.filter((s) => s.startedAt >= rangeStart && s.type === 'focus'))
      setSessionsLoading(false)
      return
    }

    setSessionsLoading(true)
    const q = query(
      collection(db, 'users', uid, 'sessions'),
      where('startedAt', '>=', rangeStart),
      where('type', '==', 'focus'),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        setSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Session))
        setSessionsLoading(false)
      },
      () => setSessionsLoading(false),
    )
    return unsub
  }, [uid, rangeStart, projectsLoading])

  const byProject = useMemo(
    () => aggregateByProject(projects, sessions, dayStart, Date.now()),
    [projects, sessions, dayStart],
  )

  const allocation = useMemo(
    () => computeAllocation(projects, targetMinutes),
    [projects, targetMinutes],
  )

  return { byProject, allocation, loading: projectsLoading || sessionsLoading }
}
