import { useState, useEffect, useCallback } from 'react'
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  getDoc,
  getDocs,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db, isFirebaseConfigured } from '@/config/firebase'
import { getStore, setStore } from '@/lib/localStore'
import type { Task, Quadrant } from '@/features/tasks/types'
import type { Session } from '@/features/goals/types'
import { reassignSessions } from '@/features/tasks/timeEntry'
import { removeBlocksOfTask, reassignBlocksOfTask } from '@/features/calendar/blockCascades'
import type { PlannedBlock } from '@/features/calendar/types'

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

      if (isFirebaseConfigured && uid && db) {
        // `tasks` est filtré par projet (useTasks(uid, selectedId)) : une
        // tâche ouverte depuis la grille du jour (qui lit `useTasks(uid,
        // 'all')`) peut appartenir à un autre projet que celui sélectionné
        // et donc être absente d'ici. "absente" ne veut pas dire "ne bouge
        // pas de projet" : on va lire son projectId réel avant de conclure.
        let currentProjectId = current?.projectId
        if (currentProjectId === undefined && updates.projectId !== undefined) {
          const snap = await getDoc(docRef(uid, id))
          currentProjectId = snap.exists() ? (snap.data() as Task).projectId : undefined
        }
        const movesProject =
          updates.projectId !== undefined &&
          currentProjectId !== undefined &&
          updates.projectId !== currentProjectId

        // Réaffecter les sessions AVANT d'écrire la tâche : si ce deuxième
        // write échoue en premier, la tâche garde son ancien projectId et
        // `movesProject` reste vrai au prochain essai, donc l'utilisateur
        // peut simplement refaire le déplacement. Dans l'autre ordre, une
        // fois la tâche mise à jour, `movesProject` serait faux et la
        // reprise ne ferait plus rien : les sessions resteraient orphelines
        // sur l'ancien projet.
        if (movesProject) {
          // Le temps déjà enregistré suit la tâche, sinon il resterait
          // compté dans les objectifs de son ancien projet. Les blocs
          // planifiés portent le même projectId et suivent pour la même
          // raison : le prévu et le réel doivent pointer le même projet.
          const [sessionsSnap, blocksSnap] = await Promise.all([
            getDocs(query(collection(db, `users/${uid}/sessions`), where('taskId', '==', id))),
            getDocs(query(collection(db, `users/${uid}/blocks`), where('taskId', '==', id))),
          ])
          if (!sessionsSnap.empty || !blocksSnap.empty) {
            const batch = writeBatch(db)
            sessionsSnap.docs.forEach((d) => batch.update(d.ref, { projectId: updates.projectId }))
            blocksSnap.docs.forEach((d) => batch.update(d.ref, { projectId: updates.projectId }))
            await batch.commit()
          }
        }
        await updateDoc(docRef(uid, id), updates)
      } else {
        // Même raisonnement qu'en Firestore : `tasks` (filtré par projet)
        // peut ne pas contenir la tâche alors qu'elle existe bien dans le
        // stockage local complet. On y cherche son projectId réel avant de
        // décider si elle change de projet.
        let currentProjectId = current?.projectId
        if (currentProjectId === undefined && updates.projectId !== undefined) {
          const all = getStore<Task[]>(LS_KEY, [])
          currentProjectId = all.find((t) => t.id === id)?.projectId
        }
        const movesProject =
          updates.projectId !== undefined &&
          currentProjectId !== undefined &&
          updates.projectId !== currentProjectId

        // Même ordre et même raison qu'en Firestore : réaffecter les
        // sessions d'abord pour qu'un échec de la mise à jour de la tâche
        // laisse `movesProject` vrai au prochain essai, plutôt que de
        // strander silencieusement les sessions sur l'ancien projet.
        if (movesProject) {
          const sessions = getStore<Session[]>('xinghe-sessions', [])
          setStore('xinghe-sessions', reassignSessions(sessions, id, updates.projectId!))
          const blocks = getStore<PlannedBlock[]>('xinghe-blocks', [])
          setStore('xinghe-blocks', reassignBlocksOfTask(blocks, id, updates.projectId!))
        }
        persist((all) => all.map((t) => (t.id === id ? { ...t, ...updates } : t)))
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
        // Les blocs partent avec la tâche, dans le même batch : une intention
        // orpheline polluerait le couloir « prévu » sans être corrigeable.
        const blocksSnap = await getDocs(
          query(collection(db, `users/${uid}/blocks`), where('taskId', '==', id)),
        )
        const batch = writeBatch(db)
        blocksSnap.docs.forEach((d) => batch.delete(d.ref))
        batch.delete(docRef(uid, id))
        await batch.commit()
      } else {
        const blocks = getStore<PlannedBlock[]>('xinghe-blocks', [])
        // Les blocs d'abord : si l'écriture s'interrompt entre les deux, la
        // tâche existe encore et une reprise refera le travail — l'inverse
        // laisserait des blocs sur une tâche morte.
        setStore('xinghe-blocks', removeBlocksOfTask(blocks, id))
        persist((all) => all.filter((t) => t.id !== id))
      }
    },
    [uid, persist],
  )

  return { tasks, loading, addTask, updateTask, toggleComplete, deleteTask }
}
