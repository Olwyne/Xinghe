import { useState, useEffect, useCallback } from 'react'
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
} from 'firebase/firestore'
import { db, isFirebaseConfigured } from '@/config/firebase'
import { getStore, setStore } from '@/lib/localStore'
import type { HabitEntry } from '@/features/habits/types'

const LS_KEY = 'xinghe-habit-entries'

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function dateStr(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString().slice(0, 10)
}

export function useHabitEntries(uid: string | null) {
  const [entries, setEntries] = useState<HabitEntry[]>(() => {
    const all = getStore<HabitEntry[]>(LS_KEY, [])
    const cutoff = dateStr(6)
    return all.filter((e) => e.date >= cutoff)
  })

  useEffect(() => {
    if (!isFirebaseConfigured || !uid || !db) return
    const col = collection(db, 'users', uid, 'habitEntries')
    const cutoff = dateStr(6)
    const q = query(col, where('date', '>=', cutoff))
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as HabitEntry))
      setEntries(docs)
    })
    return unsub
  }, [uid])

  const toggleEntry = useCallback(async (habitId: string) => {
    const today = todayStr()
    const existing = entries.find((e) => e.habitId === habitId && e.date === today)

    if (existing) {
      if (isFirebaseConfigured && uid && db) {
        await deleteDoc(doc(db, 'users', uid, 'habitEntries', existing.id))
      } else {
        setEntries((prev) => {
          const updated = prev.filter((e) => e.id !== existing.id)
          setStore(LS_KEY, updated)
          return updated
        })
      }
    } else {
      const entry: Omit<HabitEntry, 'id'> = {
        habitId,
        date: today,
        completedAt: Date.now(),
      }
      if (isFirebaseConfigured && uid && db) {
        await addDoc(collection(db, 'users', uid, 'habitEntries'), entry)
      } else {
        const next: HabitEntry = { ...entry, id: crypto.randomUUID() }
        setEntries((prev) => {
          const updated = [...prev, next]
          setStore(LS_KEY, updated)
          return updated
        })
      }
    }
  }, [uid, entries])

  function isCompletedToday(habitId: string): boolean {
    return entries.some((e) => e.habitId === habitId && e.date === todayStr())
  }

  function streakFor(habitId: string): number {
    let streak = 0
    for (let i = 0; i < 365; i++) {
      const d = dateStr(i)
      if (entries.some((e) => e.habitId === habitId && e.date === d)) {
        streak++
      } else {
        break
      }
    }
    return streak
  }

  return { entries, toggleEntry, isCompletedToday, streakFor }
}
