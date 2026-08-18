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
} from 'firebase/firestore'
import { db, isFirebaseConfigured } from '@/config/firebase'
import { getStore, setStore } from '@/lib/localStore'
import type { Habit } from '@/features/habits/types'

const LS_KEY = 'xinghe-habits'

export function useHabits(uid: string | null) {
  const [habits, setHabits] = useState<Habit[]>(() => getStore<Habit[]>(LS_KEY, []))

  useEffect(() => {
    if (!isFirebaseConfigured || !uid || !db) return
    const col = collection(db, 'users', uid, 'habits')
    const q = query(col, orderBy('order', 'asc'))
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Habit))
      setHabits(docs)
      setStore(LS_KEY, docs)
    })
    return unsub
  }, [uid])

  const addHabit = useCallback(async (name: string, icon: string) => {
    const habit: Omit<Habit, 'id'> = {
      name: name.trim(),
      icon,
      createdAt: Date.now(),
      order: Date.now(),
    }
    if (isFirebaseConfigured && uid && db) {
      await addDoc(collection(db, 'users', uid, 'habits'), habit)
    } else {
      const next: Habit = { ...habit, id: crypto.randomUUID() }
      setHabits((prev) => {
        const updated = [...prev, next]
        setStore(LS_KEY, updated)
        return updated
      })
    }
  }, [uid])

  const updateHabit = useCallback(async (id: string, patch: Partial<Omit<Habit, 'id'>>) => {
    if (isFirebaseConfigured && uid && db) {
      await updateDoc(doc(db, 'users', uid, 'habits', id), patch)
    } else {
      setHabits((prev) => {
        const updated = prev.map((h) => h.id === id ? { ...h, ...patch } : h)
        setStore(LS_KEY, updated)
        return updated
      })
    }
  }, [uid])

  const deleteHabit = useCallback(async (id: string) => {
    if (isFirebaseConfigured && uid && db) {
      await deleteDoc(doc(db, 'users', uid, 'habits', id))
    } else {
      setHabits((prev) => {
        const updated = prev.filter((h) => h.id !== id)
        setStore(LS_KEY, updated)
        return updated
      })
    }
  }, [uid])

  return { habits, addHabit, updateHabit, deleteHabit }
}
