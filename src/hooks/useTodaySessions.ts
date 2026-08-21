import { useState, useEffect, useCallback } from 'react'
import { getStore, setStore } from '@/lib/localStore'
import { db, isFirebaseConfigured } from '@/config/firebase'
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  where,
  orderBy,
} from 'firebase/firestore'
import type { Session } from '@/features/goals/types'
import { periodRange } from '@/lib/time'
import { useTimerSettings } from '@/hooks/useTimerSettings'

const STORE_KEY = 'xinghe-sessions'

function loadLocalSessions(start: number, end: number): Session[] {
  const all = getStore<Session[]>(STORE_KEY, [])
  return all.filter((s) => s.startedAt >= start && s.startedAt < end && s.type === 'focus')
}

export function useTodaySessions(uid: string | null) {
  const { settings } = useTimerSettings()
  const dayStart = settings.dayStart
  const range = periodRange('day', dayStart, Date.now())

  const [sessions, setSessions] = useState<Session[]>(() =>
    loadLocalSessions(range.start, range.end),
  )

  useEffect(() => {
    const { start, end } = periodRange('day', dayStart, Date.now())

    if (!isFirebaseConfigured || !uid || !db) {
      setSessions(loadLocalSessions(start, end))
      return
    }

    const col = collection(db, 'users', uid, 'sessions')
    const q = query(
      col,
      where('startedAt', '>=', start),
      where('startedAt', '<', end),
      where('type', '==', 'focus'),
      orderBy('startedAt', 'desc'),
    )
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Session))
      setSessions(docs)
    })
    return unsub
  }, [uid, dayStart])

  const recordSession = useCallback(
    async (projectId: string, durationMs: number, startedAt: number, taskId?: string) => {
      const session: Omit<Session, 'id'> = {
        projectId,
        taskId: taskId ?? null,
        startedAt,
        durationMs,
        endedAt: Date.now(),
        type: 'focus',
        origin: 'timer',
      }

      if (isFirebaseConfigured && uid && db) {
        await addDoc(collection(db, 'users', uid, 'sessions'), session)
      } else {
        const all = getStore<Session[]>(STORE_KEY, [])
        const newSession: Session = { ...session, id: crypto.randomUUID() }
        setStore(STORE_KEY, [...all, newSession])
        setSessions((prev) => [newSession, ...prev])
      }
    },
    [uid],
  )

  const totalFocusMinutes = Math.floor(
    sessions.reduce((sum, s) => sum + s.durationMs, 0) / 60_000,
  )

  return { sessions, recordSession, totalFocusMinutes }
}
