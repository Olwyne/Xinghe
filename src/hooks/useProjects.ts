import { useState, useEffect, useCallback, useRef } from 'react'
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  writeBatch,
  getDocs,
  where,
} from 'firebase/firestore'
import { db, isFirebaseConfigured } from '@/config/firebase'
import { getStore, setStore } from '@/lib/localStore'
import { INBOX_DEFAULTS } from '@/features/tasks/constants'
import type { Project } from '@/features/tasks/types'

const LS_KEY = 'xinghe-projects'

function colRef(uid: string) {
  return collection(db!, `users/${uid}/projects`)
}

function docRef(uid: string, id: string) {
  return doc(db!, `users/${uid}/projects`, id)
}

async function seedInbox(uid: string): Promise<void> {
  await addDoc(colRef(uid), {
    ...INBOX_DEFAULTS,
    createdAt: Date.now(),
    order: 0,
  })
}

function makeLocalInbox(): Project {
  return {
    id: 'inbox',
    ...INBOX_DEFAULTS,
    createdAt: Date.now(),
    order: 0,
  }
}

export function useProjects(uid: string | null) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const seededRef = useRef(false)

  useEffect(() => {
    if (!isFirebaseConfigured || !uid || !db) {
      let stored = getStore<Project[]>(LS_KEY, [])
      if (stored.length === 0) {
        stored = [makeLocalInbox()]
        setStore(LS_KEY, stored)
      }
      setProjects(stored)
      setLoading(false)
      return
    }

    return onSnapshot(
      query(colRef(uid), orderBy('order')),
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Project)
        if (data.length === 0 && !seededRef.current) {
          seededRef.current = true
          seedInbox(uid)
          return
        }
        setProjects(data)
        setLoading(false)
      },
    )
  }, [uid])

  const persist = useCallback((updated: Project[]) => {
    if (!isFirebaseConfigured) {
      setProjects(updated)
      setStore(LS_KEY, updated)
    }
  }, [])

  const addProject = useCallback(
    async (name: string, color: string, icon: string) => {
      const order = projects.length
      if (isFirebaseConfigured && uid && db) {
        await addDoc(colRef(uid), {
          name,
          color,
          icon,
          createdAt: Date.now(),
          order,
          isInbox: false,
        })
      } else {
        const p: Project = {
          id: crypto.randomUUID(),
          name,
          color,
          icon,
          createdAt: Date.now(),
          order,
          isInbox: false,
        }
        persist([...projects, p])
      }
    },
    [uid, projects, persist],
  )

  const updateProject = useCallback(
    async (id: string, updates: Partial<Pick<Project, 'name' | 'color' | 'icon'>>) => {
      if (isFirebaseConfigured && uid && db) {
        await updateDoc(docRef(uid, id), updates)
      } else {
        persist(projects.map((p) => (p.id === id ? { ...p, ...updates } : p)))
      }
    },
    [uid, projects, persist],
  )

  const deleteProject = useCallback(
    async (id: string) => {
      const target = projects.find((p) => p.id === id)
      if (!target || target.isInbox) return

      const inbox = projects.find((p) => p.isInbox)
      if (!inbox) return

      if (isFirebaseConfigured && uid && db) {
        const tasksSnap = await getDocs(
          query(collection(db, `users/${uid}/tasks`), where('projectId', '==', id)),
        )
        const batch = writeBatch(db)
        tasksSnap.docs.forEach((d) => batch.update(d.ref, { projectId: inbox.id }))
        batch.delete(docRef(uid, id))
        await batch.commit()
      } else {
        const tasks = getStore<Array<{ id: string; projectId: string }>>('xinghe-tasks', [])
        setStore(
          'xinghe-tasks',
          tasks.map((t) => (t.projectId === id ? { ...t, projectId: inbox.id } : t)),
        )
        persist(projects.filter((p) => p.id !== id))
      }
    },
    [uid, projects, persist],
  )

  return { projects, loading, addProject, updateProject, deleteProject }
}
