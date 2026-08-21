import { useState, useEffect, useCallback, useMemo } from 'react'
import { collection, query, where, onSnapshot, updateDoc, doc } from 'firebase/firestore'
import { db, isFirebaseConfigured } from '@/config/firebase'
import { getStore, setStore } from '@/lib/localStore'
import { periodRange, type PeriodRange } from '@/lib/time'
import { useTimerSettings } from '@/hooks/useTimerSettings'
import type { Session } from '@/features/goals/types'
import type { Task } from '@/features/tasks/types'

const LS_KEY = 'xinghe-sessions'

/** Les sessions d'une journée, la journée étant celle que définit dayStart. */
export function useDaySessions(uid: string | null, reference: number) {
  const { settings } = useTimerSettings()
  const dayStart = settings.dayStart

  const range: PeriodRange = useMemo(
    () => periodRange('day', dayStart, reference),
    [dayStart, reference],
  )

  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isFirebaseConfigured) {
      const all = getStore<Session[]>(LS_KEY, [])
      setSessions(
        all.filter(
          (s) => s.type === 'focus' && s.startedAt >= range.start && s.startedAt < range.end,
        ),
      )
      setLoading(false)
      return
    }

    // Firebase configuré mais uid pas encore connu : on reste en chargement
    // plutôt que d'afficher une journée vide qui serait un mensonge.
    if (!uid || !db) {
      setSessions([])
      setLoading(true)
      return
    }

    setLoading(true)
    let cancelled = false
    const unsubscribe = onSnapshot(
      query(
        collection(db, 'users', uid, 'sessions'),
        where('type', '==', 'focus'),
        where('startedAt', '>=', range.start),
        where('startedAt', '<', range.end),
      ),
      (snap) => {
        if (cancelled) return
        setSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Session))
        setLoading(false)
      },
      () => {
        if (!cancelled) setLoading(false)
      },
    )
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [uid, range.start, range.end])

  const attachToTask = useCallback(
    async (sessionId: string, task: Task) => {
      // taskId et projectId ensemble : le temps d'une tâche est compté dans
      // le projet de cette tâche, l'invariant posé par le sous-projet B.
      const updates = { taskId: task.id, projectId: task.projectId }
      if (isFirebaseConfigured && uid && db) {
        await updateDoc(doc(db, 'users', uid, 'sessions', sessionId), updates)
      } else {
        const all = getStore<Session[]>(LS_KEY, [])
        setStore(LS_KEY, all.map((s) => (s.id === sessionId ? { ...s, ...updates } : s)))
        setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, ...updates } : s)))
      }
    },
    [uid],
  )

  return { sessions, range, loading, attachToTask }
}
