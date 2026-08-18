import { useState, useEffect } from 'react'
import { getStore, setStore } from '@/lib/localStore'
import { db, isFirebaseConfigured } from '@/config/firebase'
import {
  doc,
  onSnapshot,
  setDoc,
} from 'firebase/firestore'

const DEFAULT_TARGET = 90
const STORE_KEY = 'xinghe-daily-goal'
const GOAL_DOC = 'settings/dailyGoal'

export function useDailyGoal(uid: string | null) {
  const [targetMinutes, setTargetMinutes] = useState<number>(
    () => getStore<number>(STORE_KEY, DEFAULT_TARGET),
  )

  useEffect(() => {
    if (!isFirebaseConfigured || !uid || !db) return
    const ref = doc(db, 'users', uid, GOAL_DOC)
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as { targetMinutes: number }
        setTargetMinutes(data.targetMinutes)
        setStore(STORE_KEY, data.targetMinutes)
      }
    })
    return unsub
  }, [uid])

  async function updateGoal(minutes: number) {
    setStore(STORE_KEY, minutes)
    setTargetMinutes(minutes)
    if (isFirebaseConfigured && uid && db) {
      const ref = doc(db, 'users', uid, GOAL_DOC)
      await setDoc(ref, { targetMinutes: minutes })
    }
  }

  return { targetMinutes, updateGoal }
}
