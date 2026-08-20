import { useState, useEffect } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db, isFirebaseConfigured } from '@/config/firebase'
import { getStore } from '@/lib/localStore'
import type { Session } from '@/features/goals/types'
import { periodRange, getDayBoundary } from '@/lib/time'
import { useTimerSettings } from '@/hooks/useTimerSettings'

const LS_KEY = 'xinghe-sessions'

export interface DayStat {
  date: string
  minutes: number
}

/**
 * Répartit les sessions sur les 7 jours de la fenêtre, en utilisant la
 * frontière de journée configurable pour à la fois étiqueter et regrouper —
 * une session à 3h avec dayStart=4 appartient à la journée précédente.
 */
export function bucketSessionsByDay(
  sessions: Session[],
  rangeStart: number,
  dayStartHour: number,
): DayStat[] {
  // Calendar arithmetic, like periodRange: recover the local calendar date of
  // the range start, then add whole days with new Date(y, m, d + i) instead
  // of a fixed 86_400_000ms — a fixed offset drifts by an hour across a DST
  // transition and can, in principle, land on the wrong side of the day
  // boundary. (See useWeekSessions.test.ts for the discrimination check this
  // was verified against.)
  const offsetMs = dayStartHour * 3_600_000
  const base = new Date(rangeStart - offsetMs)
  const y = base.getFullYear()
  const m = base.getMonth()
  const d = base.getDate()

  return Array.from({ length: 7 }, (_, i) => {
    const ts = new Date(y, m, d + i).getTime() + offsetMs
    const date = getDayBoundary(ts, dayStartHour)
    const minutes = Math.floor(
      sessions
        .filter((s) => getDayBoundary(s.startedAt, dayStartHour) === date)
        .reduce((sum, s) => sum + s.durationMs, 0) / 60_000,
    )
    return { date, minutes }
  })
}

function loadLocalSessions(start: number, end: number): Session[] {
  const all = getStore<Session[]>(LS_KEY, [])
  return all.filter((s) => s.startedAt >= start && s.startedAt < end && s.type === 'focus')
}

export function useWeekSessions(uid: string | null) {
  const { settings } = useTimerSettings()
  const dayStart = settings.dayStart
  const range = periodRange('week', dayStart, Date.now())

  const [sessions, setSessions] = useState<Session[]>(() =>
    loadLocalSessions(range.start, range.end),
  )

  useEffect(() => {
    const { start, end } = periodRange('week', dayStart, Date.now())

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
    )
    const unsub = onSnapshot(q, (snap) => {
      setSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Session)))
    })
    return unsub
  }, [uid, dayStart])

  const totalMs = sessions.reduce((s, e) => s + e.durationMs, 0)
  const totalMinutes = Math.floor(totalMs / 60_000)

  const byDay = bucketSessionsByDay(sessions, range.start, dayStart)

  return { sessions, totalMinutes, byDay }
}
