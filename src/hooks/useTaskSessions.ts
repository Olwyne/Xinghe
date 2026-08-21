import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from 'firebase/firestore'
import { db, isFirebaseConfigured } from '@/config/firebase'
import { getStore, setStore } from '@/lib/localStore'
import type { Session } from '@/features/goals/types'
import {
  draftToStartedAt,
  totalMinutes as sumMinutes,
  type TimeEntryDraft,
} from '@/features/tasks/timeEntry'

const LS_KEY = 'xinghe-sessions'

function byNewestFirst(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => b.startedAt - a.startedAt)
}

function loadLocal(taskId: string): Session[] {
  const all = getStore<Session[]>(LS_KEY, [])
  return byNewestFirst(all.filter((s) => s.taskId === taskId))
}

/** Les entrées de temps d'une tâche : lecture temps réel et écritures. */
export function useTaskSessions(uid: string | null, taskId: string | null) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!taskId) {
      setSessions([])
      setLoading(false)
      return
    }

    if (!isFirebaseConfigured) {
      setSessions(loadLocal(taskId))
      setLoading(false)
      return
    }

    if (!uid || !db) {
      // Firebase is configured but auth hasn't resolved yet: stay in the
      // loading state rather than falling back to localStorage, which would
      // show an empty state (nothing is stored there in a Firebase
      // deployment) and could route a stray write to the wrong store.
      setSessions([])
      setLoading(true)
      return
    }

    setLoading(true)
    let cancelled = false
    const unsubscribe = onSnapshot(
      query(collection(db, 'users', uid, 'sessions'), where('taskId', '==', taskId)),
      (snap) => {
        if (cancelled) return
        setSessions(byNewestFirst(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Session)))
        setLoading(false)
      },
      () => {
        // Permission refusée, réseau coupé : on sort de l'état de chargement
        // plutôt que de laisser la section sur des squelettes indéfiniment.
        if (!cancelled) setLoading(false)
      },
    )
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [uid, taskId])

  const addEntry = useCallback(
    async (draft: TimeEntryDraft, projectId: string) => {
      if (!taskId) return
      const startedAt = draftToStartedAt(draft)
      const durationMs = draft.durationMinutes * 60_000
      const entry: Omit<Session, 'id'> = {
        projectId,
        taskId,
        startedAt,
        durationMs,
        endedAt: startedAt + durationMs,
        type: 'focus',
        origin: 'manual',
      }
      if (isFirebaseConfigured) {
        if (!uid || !db) throw new Error('auth not ready')
        await addDoc(collection(db, 'users', uid, 'sessions'), entry)
      } else {
        const all = getStore<Session[]>(LS_KEY, [])
        const created: Session = { ...entry, id: crypto.randomUUID() }
        setStore(LS_KEY, [...all, created])
        setSessions((prev) => byNewestFirst([...prev, created]))
      }
    },
    [uid, taskId],
  )

  const updateEntry = useCallback(
    async (id: string, draft: TimeEntryDraft) => {
      // origin n'est pas touché : une session mesurée puis corrigée reste
      // marquée 'timer', editedAt dit qu'elle a été retouchée.
      const startedAt = draftToStartedAt(draft)
      const durationMs = draft.durationMinutes * 60_000
      const updates = {
        startedAt,
        durationMs,
        endedAt: startedAt + durationMs,
        editedAt: Date.now(),
      }
      if (isFirebaseConfigured) {
        if (!uid || !db) throw new Error('auth not ready')
        await updateDoc(doc(db, 'users', uid, 'sessions', id), updates)
      } else {
        const all = getStore<Session[]>(LS_KEY, [])
        const next = all.map((s) => (s.id === id ? { ...s, ...updates } : s))
        setStore(LS_KEY, next)
        setSessions((prev) => byNewestFirst(prev.map((s) => (s.id === id ? { ...s, ...updates } : s))))
      }
    },
    [uid],
  )

  const deleteEntry = useCallback(
    async (id: string) => {
      if (isFirebaseConfigured) {
        if (!uid || !db) throw new Error('auth not ready')
        await deleteDoc(doc(db, 'users', uid, 'sessions', id))
      } else {
        const all = getStore<Session[]>(LS_KEY, [])
        setStore(LS_KEY, all.filter((s) => s.id !== id))
        setSessions((prev) => prev.filter((s) => s.id !== id))
      }
    },
    [uid],
  )

  const total = useMemo(() => sumMinutes(sessions), [sessions])

  return { sessions, totalMinutes: total, loading, addEntry, updateEntry, deleteEntry }
}
