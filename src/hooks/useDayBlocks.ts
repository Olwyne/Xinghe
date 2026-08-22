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
import { periodRange, type PeriodRange } from '@/lib/time'
import { useTimerSettings } from '@/hooks/useTimerSettings'
import type { PlannedBlock } from '@/features/calendar/types'
import type { Task } from '@/features/tasks/types'

const LS_KEY = 'xinghe-blocks'

/** Les blocs planifiés d'une journée, la journée étant celle que définit dayStart. */
export function useDayBlocks(uid: string | null, reference: number) {
  const { settings } = useTimerSettings()
  const dayStart = settings.dayStart

  const range: PeriodRange = useMemo(
    () => periodRange('day', dayStart, reference),
    [dayStart, reference],
  )

  const [blocks, setBlocks] = useState<PlannedBlock[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isFirebaseConfigured) {
      // Lecture ponctuelle, pas un abonnement : même trait de famille que
      // useDaySessions, documenté là-bas.
      const all = getStore<PlannedBlock[]>(LS_KEY, [])
      setBlocks(all.filter((b) => b.startedAt >= range.start && b.startedAt < range.end))
      setLoading(false)
      return
    }

    // Firebase configuré mais uid pas encore connu : rester en chargement
    // plutôt que d'afficher une journée vide qui serait un mensonge.
    if (!uid || !db) {
      setBlocks([])
      setLoading(true)
      return
    }

    setLoading(true)
    let cancelled = false
    const unsubscribe = onSnapshot(
      query(
        collection(db, 'users', uid, 'blocks'),
        where('startedAt', '>=', range.start),
        where('startedAt', '<', range.end),
      ),
      (snap) => {
        if (cancelled) return
        setBlocks(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PlannedBlock))
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

  const addBlock = useCallback(
    async (task: Task, startedAt: number, durationMs: number) => {
      // taskId et projectId ensemble, dès la création : le temps d'une tâche
      // est compté dans le projet de cette tâche.
      const entry: Omit<PlannedBlock, 'id'> = {
        taskId: task.id,
        projectId: task.projectId,
        startedAt,
        durationMs,
        createdAt: Date.now(),
      }
      if (isFirebaseConfigured) {
        // Ne pas retomber en localStorage si Firebase est configuré mais que
        // uid/db ne sont pas prêts : ce serait écrire dans un magasin que ce
        // déploiement ne lit jamais.
        if (!uid || !db) throw new Error('auth not ready')
        await addDoc(collection(db, 'users', uid, 'blocks'), entry)
      } else {
        const all = getStore<PlannedBlock[]>(LS_KEY, [])
        const created: PlannedBlock = { ...entry, id: crypto.randomUUID() }
        setStore(LS_KEY, [...all, created])
        setBlocks((prev) => [...prev, created])
      }
    },
    [uid],
  )

  const writeLocal = useCallback(
    (id: string, updates: Partial<PlannedBlock>) => {
      const all = getStore<PlannedBlock[]>(LS_KEY, [])
      setStore(LS_KEY, all.map((b) => (b.id === id ? { ...b, ...updates } : b)))
      setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...updates } : b)))
    },
    [],
  )

  const moveBlock = useCallback(
    async (id: string, startedAt: number) => {
      if (isFirebaseConfigured) {
        if (!uid || !db) throw new Error('auth not ready')
        await updateDoc(doc(db, 'users', uid, 'blocks', id), { startedAt })
      } else {
        writeLocal(id, { startedAt })
      }
    },
    [uid, writeLocal],
  )

  const updateBlock = useCallback(
    async (id: string, startedAt: number, durationMs: number) => {
      if (isFirebaseConfigured) {
        if (!uid || !db) throw new Error('auth not ready')
        await updateDoc(doc(db, 'users', uid, 'blocks', id), { startedAt, durationMs })
      } else {
        writeLocal(id, { startedAt, durationMs })
      }
    },
    [uid, writeLocal],
  )

  const removeBlock = useCallback(
    async (id: string) => {
      if (isFirebaseConfigured) {
        if (!uid || !db) throw new Error('auth not ready')
        await deleteDoc(doc(db, 'users', uid, 'blocks', id))
      } else {
        const all = getStore<PlannedBlock[]>(LS_KEY, [])
        setStore(LS_KEY, all.filter((b) => b.id !== id))
        setBlocks((prev) => prev.filter((b) => b.id !== id))
      }
    },
    [uid],
  )

  return { blocks, loading, addBlock, moveBlock, updateBlock, removeBlock }
}
