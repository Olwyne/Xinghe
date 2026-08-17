import { useState, useEffect, useCallback } from 'react'
import {
  collection,
  query,
  orderBy,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from 'firebase/firestore'
import { db, isFirebaseConfigured } from '@/config/firebase'
import { getStore, setStore } from '@/lib/localStore'
import type { Task, Quadrant } from '@/features/tasks/types'

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

    const constraints = projectId === 'all'
      ? [orderBy('order')]
      : [where('projectId', '==', projectId), orderBy('order')]

    return onSnapshot(
      query(colRef(uid), ...constraints),
      (snapshot) => {
        setTasks(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Task))
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
    async (title: string, targetProjectId?: string) => {
      const pid = targetProjectId ?? projectId
      const now = Date.now()
      const order = tasks.length

      if (isFirebaseConfigured && uid && db) {
        await addDoc(colRef(uid), {
          title,
          projectId: pid,
          quadrant: 2 as Quadrant,
          completed: false,
          completedAt: null,
          createdAt: now,
          order,
          notes: '',
        })
      } else {
        const t: Task = {
          id: crypto.randomUUID(),
          title,
          projectId: pid,
          quadrant: 2,
          completed: false,
          completedAt: null,
          createdAt: now,
          order,
          notes: '',
        }
        persist((all) => [...all, t])
      }
    },
    [uid, projectId, tasks.length, persist],
  )

  const updateTask = useCallback(
    async (id: string, updates: Partial<Omit<Task, 'id'>>) => {
      if (isFirebaseConfigured && uid && db) {
        await updateDoc(docRef(uid, id), updates)
      } else {
        persist((all) => all.map((t) => (t.id === id ? { ...t, ...updates } : t)))
      }
    },
    [uid, persist],
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
