import { useState, useEffect, useCallback } from 'react'
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db, isFirebaseConfigured } from '@/config/firebase'
import { getStore, setStore } from '@/lib/localStore'
import type { Task, Quadrant } from '@/features/tasks/types'
import type { Session } from '@/features/goals/types'
import { reassignSessions } from '@/features/tasks/timeEntry'

const LS_KEY = 'xinghe-tasks'

function colRef(uid: string) {
  return collection(db!, `users/${uid}/tasks`)
}

function docRef(uid: string, id: string) {
  return doc(db!, `users/${uid}/tasks`, id)
}

export function useTasks(uid: string | null, projectId: string) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isFirebaseConfigured || !uid || !db) {
      const all = getStore<Task[]>(LS_KEY, [])
      setTasks(projectId === 'all' ? all : all.filter((t) => t.projectId === projectId))
      setLoading(false)
      return
    }

    // Subscribe to every task and filter locally: a `where` + `orderBy`
    // query would need a composite index, and its failure is silent.
    return onSnapshot(
      query(colRef(uid), orderBy('order')),
      (snapshot) => {
        const all = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Task)
        setTasks(projectId === 'all' ? all : all.filter((t) => t.projectId === projectId))
        setLoading(false)
      },
      (error) => {
        console.error('[useTasks] snapshot failed', error)
        setLoading(false)
      },
    )
  }, [uid, projectId])

  const persist = useCallback((updater: (all: Task[]) => Task[]) => {
    const all = getStore<Task[]>(LS_KEY, [])
    const updated = updater(all)
    setStore(LS_KEY, updated)
    setTasks(projectId === 'all' ? updated : updated.filter((t) => t.projectId === projectId))
  }, [projectId])

  const addTask = useCallback(
    async (
      title: string,
      targetProjectId?: string,
      quadrant: Quadrant = 2,
      dueDate?: number | null,
      subtasks?: Task['subtasks'],
    ) => {
      const pid = targetProjectId ?? projectId
      const now = Date.now()
      const order = tasks.length
      const base = {
        title,
        projectId: pid,
        quadrant,
        completed: false,
        completedAt: null,
        createdAt: now,
        order,
        notes: '',
        dueDate: dueDate ?? null,
        subtasks: subtasks ?? [],
        spentMs: 0,
      }

      if (isFirebaseConfigured && uid && db) {
        await addDoc(colRef(uid), base)
      } else {
        const t: Task = { id: crypto.randomUUID(), ...base }
        persist((all) => [...all, t])
      }
    },
    [uid, projectId, tasks.length, persist],
  )

  const updateTask = useCallback(
    async (id: string, updates: Partial<Omit<Task, 'id'>>) => {
      const current = tasks.find((t) => t.id === id)
      const movesProject =
        updates.projectId !== undefined &&
        current !== undefined &&
        updates.projectId !== current.projectId

      if (isFirebaseConfigured && uid && db) {
        await updateDoc(docRef(uid, id), updates)
        if (movesProject) {
          // Le temps déjà enregistré suit la tâche, sinon il resterait
          // compté dans les objectifs de son ancien projet.
          const snap = await getDocs(
            query(collection(db, `users/${uid}/sessions`), where('taskId', '==', id)),
          )
          if (!snap.empty) {
            const batch = writeBatch(db)
            snap.docs.forEach((d) => batch.update(d.ref, { projectId: updates.projectId }))
            await batch.commit()
          }
        }
      } else {
        persist((all) => all.map((t) => (t.id === id ? { ...t, ...updates } : t)))
        if (movesProject) {
          const sessions = getStore<Session[]>('xinghe-sessions', [])
          setStore('xinghe-sessions', reassignSessions(sessions, id, updates.projectId!))
        }
      }
    },
    [uid, tasks, persist],
  )

  const toggleComplete = useCallback(
    async (id: string) => {
      const task = tasks.find((t) => t.id === id)
      if (!task) return
      const completed = !task.completed
      const completedAt = completed ? Date.now() : null
      if (isFirebaseConfigured && uid && db) {
        await updateDoc(docRef(uid, id), { completed, completedAt })
      } else {
        persist((all) =>
          all.map((t) => (t.id === id ? { ...t, completed, completedAt } : t)),
        )
      }
    },
    [uid, tasks, persist],
  )

  const deleteTask = useCallback(
    async (id: string) => {
      if (isFirebaseConfigured && uid && db) {
        await deleteDoc(docRef(uid, id))
      } else {
        persist((all) => all.filter((t) => t.id !== id))
      }
    },
    [uid, persist],
  )

  return { tasks, loading, addTask, updateTask, toggleComplete, deleteTask }
}
