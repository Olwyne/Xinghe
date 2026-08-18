import { useState, useEffect } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db, isFirebaseConfigured } from '@/config/firebase'
import { getStore } from '@/lib/localStore'
import type { Session } from '@/features/goals/types'

const LS_KEY = 'xinghe-sessions'

function weekStart(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.getTime()
}

function dateStr(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10)
}

export interface DayStat {
  date: string
  minutes: number
}

export function useWeekSessions(uid: string | null) {
  const [sessions, setSessions] = useState<Session[]>(() => {
    const all = getStore<Session[]>(LS_KEY, [])
    const start = weekStart()
    return all.filter((s) => s.startedAt >= start && s.type === 'focus')
  })

  useEffect(() => {
    if (!isFirebaseConfigured || !uid || !db) return
    const col = collection(db, 'users', uid, 'sessions')
    const q = query(
      col,
      where('startedAt', '>=', weekStart()),
      where('type', '==', 'focus'),
    )
    const unsub = onSnapshot(q, (snap) => {
      setSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Session)))
    })
    return unsub
  }, [uid])

  const totalMs = sessions.reduce((s, e) => s + e.durationMs, 0)
  const totalMinutes = Math.floor(totalMs / 60_000)

  const byDay: DayStat[] = Array.from({ length: 7 }, (_, i) => {
    const ts = weekStart() + i * 86_400_000
    const date = dateStr(ts)
    const minutes = Math.floor(
      sessions
        .filter((s) => dateStr(s.startedAt) === date)
        .reduce((sum, s) => sum + s.durationMs, 0) / 60_000,
    )
    return { date, minutes }
  })

  return { sessions, totalMinutes, byDay }
}
