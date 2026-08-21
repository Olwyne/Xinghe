# Grille du jour — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher une journée à son échelle horaire réelle, sessions comprises, et permettre de rattacher après coup une session sans tâche.

**Architecture:** Tout le calcul de placement vit dans une fonction pure `layoutDaySessions` — bornage à la fenêtre, groupement des chevauchements, répartition en colonnes — testée sans navigateur. Un hook `useDaySessions` lit les sessions d'une journée et écrit le rattachement. Le composant `DayGrid` ne fait que poser des `<div>` à partir du résultat de la fonction pure, et délègue l'édition au modal de tâche existant.

**Tech Stack:** Vite + React 19 + TypeScript, Firebase Firestore avec repli `localStorage`, react-i18next FR/EN, Vitest.

## Global Constraints

- Toutes les commandes shell sont préfixées par `rtk`, y compris dans les chaînes `&&`.
- Type check : `rtk npx tsc -b`. Ne jamais passer `--noEmit false` — cela force l'émission de `.js` dans tout `src/`.
- Tests : `rtk npm test`. 138 tests passent au départ.
- Aucune nouvelle dépendance npm. Cela exclut `jsdom` et `@testing-library/react` : aucun test de rendu DOM, donc toute logique à tester vit dans une fonction pure.
- Aucune nouvelle variable CSS personnalisée.
- Toute chaîne visible passe par `t()`, avec la clé présente dans `src/i18n/fr.json` **et** `src/i18n/en.json` dans le même commit.
- Dates et heures via `Intl.DateTimeFormat` avec `i18n.language` — aucune chaîne de format écrite à la main.
- `noUnusedLocals` est activé : un import laissé orphelin fait échouer le type check.
- Aucun changement du modèle de données, aucune migration, aucun nouvel index Firestore.
- La fenêtre du jour vient de `periodRange('day', dayStartHour, référence)` — la frontière de journée configurable s'applique donc partout.
- Une session appartient à la période contenant son **début** ; les bords qui dépassent sont tronqués et signalés.
- Le rattachement écrit `taskId` **et** `projectId` (celui de la tâche) dans la même mise à jour.
- Les écritures qui échouent remontent à l'appelant et sont affichées ; aucun rattachement optimiste.
- Au chargement, des squelettes — jamais une grille vide transitoire.

## Hors périmètre, délibérément

- Les blocs planifiés, le glisser-déposer, le redimensionnement : sous-projet C2.
- La vue semaine, et la comparaison planifié vs réel (sous-projet D).
- Créer ou supprimer une session depuis la grille : les deux vivent dans le modal de tâche, où le sous-projet B les a mises.

## File Structure

**Créés**
- `src/features/calendar/dayLayout.ts` — logique pure : bornage, groupement, colonnes
- `src/features/calendar/dayLayout.test.ts` — tests de ce module
- `src/hooks/useDaySessions.ts` — sessions d'une journée, en lecture temps réel, plus le rattachement
- `src/features/calendar/DayGrid.tsx` + `.css` — la grille et sa navigation

**Modifiés**
- `src/features/tasks/TasksScreen.tsx` — troisième vue `jour`, et fourniture du modal de tâche à la grille
- `src/components/Sidebar.tsx` — entrée `day` dans la navigation desktop
- `src/App.tsx` — routage de l'onglet desktop `day`
- `src/i18n/fr.json`, `src/i18n/en.json` — clés `calendar.*` et le libellé de la bascule de vue

---

### Task 1: Logique pure de disposition

**Files:**
- Create: `src/features/calendar/dayLayout.ts`
- Test: `src/features/calendar/dayLayout.test.ts`

**Interfaces:**
- Consumes: `Session` de `@/features/goals/types`, `PeriodRange` de `@/lib/time`
- Produces:
  - `interface PositionedSession { session: Session; top: number; height: number; column: number; columnCount: number; clippedEnd: boolean }`
  - `layoutDaySessions(sessions: Session[], range: PeriodRange): PositionedSession[]`

- [ ] **Step 1: Write the failing test**

Créer `src/features/calendar/dayLayout.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import type { Session } from '@/features/goals/types'
import type { PeriodRange } from '@/lib/time'
import { layoutDaySessions } from './dayLayout'

const HOUR = 3_600_000
const DAY_START = new Date(2026, 2, 10, 4).getTime() // 10 mars 2026, 4h locales
const RANGE: PeriodRange = { start: DAY_START, end: DAY_START + 24 * HOUR }

/** Session démarrant `fromHour` heures après le début de la fenêtre. */
function at(id: string, fromHour: number, durationHours: number): Session {
  return {
    id,
    projectId: 'p1',
    taskId: 't1',
    startedAt: DAY_START + fromHour * HOUR,
    durationMs: durationHours * HOUR,
    type: 'focus',
  }
}

describe('layoutDaySessions — positions', () => {
  it('place une session d’une heure sur 1/24 de la hauteur', () => {
    const [block] = layoutDaySessions([at('a', 6, 1)], RANGE)
    expect(block.top).toBeCloseTo(6 / 24)
    expect(block.height).toBeCloseTo(1 / 24)
  })

  it('place une session commençant au début de la fenêtre à top 0', () => {
    const [block] = layoutDaySessions([at('a', 0, 2)], RANGE)
    expect(block.top).toBe(0)
  })

  it('reste proportionnel sur une fenêtre de 23 heures', () => {
    const shortRange: PeriodRange = { start: DAY_START, end: DAY_START + 23 * HOUR }
    const [block] = layoutDaySessions([at('a', 0, 23)], shortRange)
    expect(block.height).toBeCloseTo(1)
  })

  it('n’applique aucun plancher de hauteur — 30 secondes reste 30 secondes', () => {
    const tiny = { ...at('a', 6, 0), durationMs: 30_000 }
    const [block] = layoutDaySessions([tiny], RANGE)
    expect(block.height).toBeCloseTo(30_000 / (24 * HOUR))
  })
})

describe('layoutDaySessions — troncature', () => {
  it('exclut une session dont le début précède la fenêtre, même si elle déborde dedans', () => {
    const before = { ...at('a', 0, 2), startedAt: DAY_START - HOUR }
    expect(layoutDaySessions([before], RANGE)).toEqual([])
  })

  it('tronque une session qui déborde après la fenêtre', () => {
    const [block] = layoutDaySessions([at('a', 23, 3)], RANGE)
    expect(block.clippedEnd).toBe(true)
    expect(block.top + block.height).toBeCloseTo(1)
  })

  it('ne signale aucune troncature pour une session entièrement dedans', () => {
    const [block] = layoutDaySessions([at('a', 6, 1)], RANGE)
    expect(block.clippedEnd).toBe(false)
  })

  it('exclut une session entièrement antérieure à la fenêtre', () => {
    const outside = { ...at('a', 0, 1), startedAt: DAY_START - 5 * HOUR }
    expect(layoutDaySessions([outside], RANGE)).toEqual([])
  })

  it('exclut une session entièrement postérieure à la fenêtre', () => {
    const outside = { ...at('a', 0, 1), startedAt: DAY_START + 30 * HOUR }
    expect(layoutDaySessions([outside], RANGE)).toEqual([])
  })

  it('borne top et height à l’intervalle [0, 1]', () => {
    const huge = { ...at('a', 0, 0), durationMs: 50 * HOUR }
    const [block] = layoutDaySessions([huge], RANGE)
    expect(block.top).toBeGreaterThanOrEqual(0)
    expect(block.height).toBeLessThanOrEqual(1)
  })

  it('exclut une session commençant une milliseconde avant le début de la fenêtre', () => {
    const justBefore = { ...at('a', 0, 1), startedAt: DAY_START - 1 }
    expect(layoutDaySessions([justBefore], RANGE)).toEqual([])
  })

  it('inclut une session commençant exactement au début de la fenêtre', () => {
    const [block] = layoutDaySessions([at('a', 0, 1)], RANGE)
    expect(block.top).toBe(0)
  })
})

describe('layoutDaySessions — colonnes', () => {
  it('donne toute la largeur à une session seule', () => {
    const [block] = layoutDaySessions([at('a', 6, 1)], RANGE)
    expect(block.column).toBe(0)
    expect(block.columnCount).toBe(1)
  })

  it('donne toute la largeur à deux sessions disjointes', () => {
    const blocks = layoutDaySessions([at('a', 6, 1), at('b', 8, 1)], RANGE)
    expect(blocks.map((b) => b.columnCount)).toEqual([1, 1])
    expect(blocks.map((b) => b.column)).toEqual([0, 0])
  })

  it('partage la largeur entre deux sessions qui se recouvrent', () => {
    const blocks = layoutDaySessions([at('a', 6, 2), at('b', 7, 2)], RANGE)
    expect(blocks.map((b) => b.columnCount)).toEqual([2, 2])
    expect(blocks.map((b) => b.column)).toEqual([0, 1])
  })

  it('traite une chaîne A–B–C comme un seul groupe de deux colonnes', () => {
    // A 6h→8h, B 7h→9h, C 8h30→10h : A et C sont disjointes, mais B les relie.
    const a = at('a', 6, 2)
    const b = at('b', 7, 2)
    const c = { ...at('c', 8, 1.5), startedAt: DAY_START + 8.5 * HOUR }
    const blocks = layoutDaySessions([a, b, c], RANGE)
    expect(blocks.every((x) => x.columnCount === 2)).toBe(true)
    // C réutilise la colonne libérée par A
    expect(blocks.find((x) => x.session.id === 'c')?.column).toBe(0)
  })

  it('sépare deux groupes distincts sans les compter ensemble', () => {
    const blocks = layoutDaySessions(
      [at('a', 6, 2), at('b', 7, 2), at('c', 14, 1)],
      RANGE,
    )
    expect(blocks.find((x) => x.session.id === 'c')?.columnCount).toBe(1)
    expect(blocks.find((x) => x.session.id === 'a')?.columnCount).toBe(2)
  })

  it('place une session incluse dans une autre en deuxième colonne', () => {
    const outer = at('a', 6, 4)
    const inner = at('b', 7, 1)
    const blocks = layoutDaySessions([outer, inner], RANGE)
    expect(blocks.find((x) => x.session.id === 'b')?.column).toBe(1)
    expect(blocks.every((x) => x.columnCount === 2)).toBe(true)
  })

  it('ne compte pas comme chevauchement deux sessions bout à bout', () => {
    const blocks = layoutDaySessions([at('a', 6, 1), at('b', 7, 1)], RANGE)
    expect(blocks.every((x) => x.columnCount === 1)).toBe(true)
  })

  it('monte à trois colonnes quand trois sessions se recouvrent', () => {
    const blocks = layoutDaySessions([at('a', 6, 3), at('b', 6.5, 3), at('c', 7, 3)], RANGE)
    expect(blocks.every((x) => x.columnCount === 3)).toBe(true)
    expect(blocks.map((x) => x.column).sort()).toEqual([0, 1, 2])
  })
})

describe('layoutDaySessions — ordre', () => {
  it('trie par début croissant quel que soit l’ordre d’entrée', () => {
    const blocks = layoutDaySessions([at('c', 14, 1), at('a', 6, 1), at('b', 9, 1)], RANGE)
    expect(blocks.map((x) => x.session.id)).toEqual(['a', 'b', 'c'])
  })

  it('départage deux débuts identiques de façon déterministe', () => {
    const first = layoutDaySessions([at('b', 6, 1), at('a', 6, 1)], RANGE)
    const second = layoutDaySessions([at('a', 6, 1), at('b', 6, 1)], RANGE)
    expect(first.map((x) => x.session.id)).toEqual(second.map((x) => x.session.id))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk npx vitest run src/features/calendar/dayLayout.test.ts`
Expected: FAIL — `Failed to resolve import "./dayLayout"`.

- [ ] **Step 3: Write minimal implementation**

Créer `src/features/calendar/dayLayout.ts` :

```ts
import type { Session } from '@/features/goals/types'
import type { PeriodRange } from '@/lib/time'

export interface PositionedSession {
  session: Session
  /** Fraction de la fenêtre : 0 = début de la grille, 1 = fin. */
  top: number
  height: number
  /** Colonne occupée dans son groupe de chevauchement. */
  column: number
  /** Nombre de colonnes du groupe, donc largeur = 1 / columnCount. */
  columnCount: number
  clippedEnd: boolean
}

interface Bounded {
  session: Session
  start: number
  end: number
  clippedEnd: boolean
  column: number
}

export function layoutDaySessions(
  sessions: Session[],
  range: PeriodRange,
): PositionedSession[] {
  const span = range.end - range.start
  if (span <= 0) return []

  const bounded: Bounded[] = []
  for (const session of sessions) {
    const rawStart = session.startedAt
    const rawEnd = session.startedAt + session.durationMs
    // Une session appartient à la fenêtre qui contient son début : jamais dessinée ailleurs.
    if (rawStart < range.start || rawStart >= range.end) continue
    bounded.push({
      session,
      start: rawStart,
      end: Math.min(rawEnd, range.end),
      clippedEnd: rawEnd > range.end,
      column: 0,
    })
  }

  // Tri par début, départagé par id pour que deux appels donnent le même ordre.
  bounded.sort((a, b) => a.start - b.start || a.session.id.localeCompare(b.session.id))

  const result: PositionedSession[] = []
  let group: Bounded[] = []
  /** Fin de la dernière session placée dans chaque colonne du groupe courant. */
  let columnEnds: number[] = []

  function flushGroup() {
    const columnCount = columnEnds.length
    for (const b of group) {
      result.push({
        session: b.session,
        top: (b.start - range.start) / span,
        height: (b.end - b.start) / span,
        column: b.column,
        columnCount,
        clippedEnd: b.clippedEnd,
      })
    }
    group = []
    columnEnds = []
  }

  for (const b of bounded) {
    // Un groupe se ferme quand plus aucune de ses colonnes n'est encore occupée.
    const groupEnd = columnEnds.length ? Math.max(...columnEnds) : -Infinity
    if (b.start >= groupEnd) flushGroup()

    let column = columnEnds.findIndex((end) => end <= b.start)
    if (column === -1) {
      column = columnEnds.length
      columnEnds.push(b.end)
    } else {
      columnEnds[column] = b.end
    }

    b.column = column
    group.push(b)
  }
  flushGroup()

  return result
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk npx vitest run src/features/calendar/dayLayout.test.ts`
Expected: PASS, 22 tests.

- [ ] **Step 5: Run the full suite**

Run: `rtk npm test`
Expected: 160 tests au vert (138 + 22).

- [ ] **Step 6: Commit**

```bash
rtk git add src/features/calendar/dayLayout.ts src/features/calendar/dayLayout.test.ts && rtk git commit -m "feat: add pure day-grid layout logic"
```

---

### Task 2: Hook des sessions d'une journée

**Files:**
- Create: `src/hooks/useDaySessions.ts`

**Interfaces:**
- Consumes: `periodRange` et `PeriodRange` de `@/lib/time` ; `Session` de `@/features/goals/types` ; `Task` de `@/features/tasks/types` ; `useTimerSettings` pour `settings.dayStart`
- Produces:

```ts
useDaySessions(uid: string | null, reference: number): {
  sessions: Session[]
  range: PeriodRange
  loading: boolean
  attachToTask: (sessionId: string, task: Task) => Promise<void>
}
```

Aucun test unitaire : la logique testable est en tâche 1, et le projet n'a pas d'infrastructure de test de hooks — ni `jsdom` ni `@testing-library/react`, et les dépendances nouvelles sont interdites.

- [ ] **Step 1: Écrire le hook**

Créer `src/hooks/useDaySessions.ts` :

```ts
import { useState, useEffect, useCallback, useMemo } from 'react'
import { collection, query, where, onSnapshot, updateDoc, doc } from 'firebase/firestore'
import { db, isFirebaseConfigured } from '@/config/firebase'
import { getStore, setStore } from '@/lib/localStore'
import { periodRange, type PeriodRange } from '@/lib/time'
import { useTimerSettings } from '@/hooks/useTimerSettings'
import type { Session } from '@/features/goals/types'
import type { Task } from '@/features/tasks/types'

const LS_KEY = 'xinghe-sessions'

/** Les sessions d'une journée, la journée étant celle que définit dayStart. */
export function useDaySessions(uid: string | null, reference: number) {
  const { settings } = useTimerSettings()
  const dayStart = settings.dayStart

  const range: PeriodRange = useMemo(
    () => periodRange('day', dayStart, reference),
    [dayStart, reference],
  )

  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isFirebaseConfigured) {
      const all = getStore<Session[]>(LS_KEY, [])
      setSessions(
        all.filter(
          (s) => s.type === 'focus' && s.startedAt >= range.start && s.startedAt < range.end,
        ),
      )
      setLoading(false)
      return
    }

    // Firebase configuré mais uid pas encore connu : on reste en chargement
    // plutôt que d'afficher une journée vide qui serait un mensonge.
    if (!uid || !db) {
      setLoading(true)
      return
    }

    setLoading(true)
    let cancelled = false
    const unsubscribe = onSnapshot(
      query(
        collection(db, 'users', uid, 'sessions'),
        where('type', '==', 'focus'),
        where('startedAt', '>=', range.start),
        where('startedAt', '<', range.end),
      ),
      (snap) => {
        if (cancelled) return
        setSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Session))
        setLoading(false)
      },
      () => {
        if (!cancelled) setLoading(false)
      },
    )
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [uid, range.start, range.end])

  const attachToTask = useCallback(
    async (sessionId: string, task: Task) => {
      // taskId et projectId ensemble : le temps d'une tâche est compté dans
      // le projet de cette tâche, l'invariant posé par le sous-projet B.
      const updates = { taskId: task.id, projectId: task.projectId }
      if (isFirebaseConfigured && uid && db) {
        await updateDoc(doc(db, 'users', uid, 'sessions', sessionId), updates)
      } else {
        const all = getStore<Session[]>(LS_KEY, [])
        setStore(LS_KEY, all.map((s) => (s.id === sessionId ? { ...s, ...updates } : s)))
        setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, ...updates } : s)))
      }
    },
    [uid],
  )

  return { sessions, range, loading, attachToTask }
}
```

- [ ] **Step 2: Vérifier**

Run: `rtk npx tsc -b && rtk npm test`
Expected: aucune erreur de type, 160 tests au vert.

- [ ] **Step 3: Commit**

```bash
rtk git add src/hooks/useDaySessions.ts && rtk git commit -m "feat: add useDaySessions hook"
```

---

### Task 3: Le composant de grille

**Files:**
- Create: `src/features/calendar/DayGrid.tsx`, `src/features/calendar/DayGrid.css`
- Modify: `src/i18n/fr.json`, `src/i18n/en.json`

**Interfaces:**
- Consumes: `layoutDaySessions`, `PositionedSession` (tâche 1) ; `useDaySessions` (tâche 2) ; `TaskPicker` de `@/features/timer/TaskPicker` (props `tasks`, `projectColors`, `selectedId`, `onSelect`) ; `useTasks`, `useProjects`, `useAuth`
- Produces: `<DayGrid onOpenTask={(task: Task) => void} />`

Aucun test de rendu : ni `jsdom` ni `@testing-library/react`. Toute la logique testable est en tâche 1.

- [ ] **Step 1: Ajouter les clés i18n**

Dans `src/i18n/fr.json`, ajouter un objet `calendar` à la racine :

```json
"calendar": {
  "day": "Jour",
  "today": "Aujourd'hui",
  "previousDay": "Jour précédent",
  "nextDay": "Jour suivant",
  "noTask": "Sans tâche",
  "attachToTask": "Rattacher à une tâche",
  "emptyDay": "Aucune session ce jour-là.",
  "continuesAfter": "Se poursuit le lendemain",
  "attachFailed": "Rattachement impossible. Réessaie."
}
```

Dans `src/i18n/en.json` :

```json
"calendar": {
  "day": "Day",
  "today": "Today",
  "previousDay": "Previous day",
  "nextDay": "Next day",
  "noTask": "No task",
  "attachToTask": "Attach to a task",
  "emptyDay": "No session that day.",
  "continuesAfter": "Continues the next day",
  "attachFailed": "Could not attach. Try again."
}
```

- [ ] **Step 2: Écrire le composant**

Créer `src/features/calendar/DayGrid.tsx` :

```tsx
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import { useTasks } from '@/hooks/useTasks'
import { useProjects } from '@/hooks/useProjects'
import { useDaySessions } from '@/hooks/useDaySessions'
import { TaskPicker } from '@/features/timer/TaskPicker'
import { layoutDaySessions } from './dayLayout'
import type { Task } from '@/features/tasks/types'
import './DayGrid.css'

const HOUR = 3_600_000

interface DayGridProps {
  /** Ouvre le modal d'une tâche : toute l'édition d'une session y vit déjà. */
  onOpenTask: (task: Task) => void
}

export function DayGrid({ onOpenTask }: DayGridProps) {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const uid = user?.uid ?? null

  const [reference, setReference] = useState(() => Date.now())
  const { sessions, range, loading, attachToTask } = useDaySessions(uid, reference)
  const { tasks } = useTasks(uid, 'all')
  const { projects } = useProjects(uid)

  const [attaching, setAttaching] = useState<string | null>(null)
  const [attachFailed, setAttachFailed] = useState(false)

  const projectColors = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p.color])),
    [projects],
  )
  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks])
  const blocks = useMemo(() => layoutDaySessions(sessions, range), [sessions, range])

  const hourCount = Math.round((range.end - range.start) / HOUR)
  const hours = Array.from({ length: hourCount }, (_, i) => range.start + i * HOUR)

  const dayLabel = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(range.start))

  const hourFormat = new Intl.DateTimeFormat(i18n.language, {
    hour: '2-digit',
    minute: '2-digit',
  })

  const now = Date.now()
  const showNowLine = now >= range.start && now < range.end
  const nowTop = ((now - range.start) / (range.end - range.start)) * 100

  async function handleSelect(sessionId: string, taskId: string | null) {
    const task = taskId ? tasksById.get(taskId) : null
    if (!task) {
      setAttaching(null)
      return
    }
    try {
      await attachToTask(sessionId, task)
      setAttaching(null)
      setAttachFailed(false)
    } catch {
      setAttachFailed(true)
    }
  }

  return (
    <section className="daygrid">
      <div className="daygrid__nav">
        <button
          type="button"
          className="daygrid__navbtn"
          aria-label={t('calendar.previousDay')}
          onClick={() => setReference((r) => r - 24 * HOUR)}
        >
          ‹
        </button>
        <span className="daygrid__date">{dayLabel}</span>
        <button
          type="button"
          className="daygrid__navbtn"
          aria-label={t('calendar.nextDay')}
          onClick={() => setReference((r) => r + 24 * HOUR)}
        >
          ›
        </button>
        <button
          type="button"
          className="daygrid__today"
          onClick={() => setReference(Date.now())}
        >
          {t('calendar.today')}
        </button>
      </div>

      {attachFailed && <p className="daygrid__error">{t('calendar.attachFailed')}</p>}

      <div className="daygrid__body">
        <div className="daygrid__ruler">
          {hours.map((ts) => (
            <div key={ts} className="daygrid__hour">
              <span className="daygrid__hourlabel">{hourFormat.format(new Date(ts))}</span>
            </div>
          ))}
        </div>

        <div className="daygrid__canvas">
          {hours.map((ts) => (
            <div key={ts} className="daygrid__line" />
          ))}

          {showNowLine && (
            <div className="daygrid__now" style={{ top: `${nowTop}%` }} />
          )}

          {loading ? (
            <>
              <div className="daygrid__skeleton" style={{ top: '20%', height: '8%' }} />
              <div className="daygrid__skeleton" style={{ top: '45%', height: '12%' }} />
            </>
          ) : blocks.length === 0 ? (
            <p className="daygrid__empty">{t('calendar.emptyDay')}</p>
          ) : (
            blocks.map((block) => {
              const task = block.session.taskId ? tasksById.get(block.session.taskId) : undefined
              const color = projectColors[block.session.projectId] ?? 'var(--xh-text-faint)'
              const width = 100 / block.columnCount
              return (
                <button
                  type="button"
                  key={block.session.id}
                  className={`daygrid__block ${task ? '' : 'daygrid__block--orphan'} ${
                    block.clippedEnd ? 'daygrid__block--clipend' : ''
                  }`}
                  style={{
                    top: `${block.top * 100}%`,
                    height: `${block.height * 100}%`,
                    left: `${block.column * width}%`,
                    width: `${width}%`,
                    borderColor: color,
                    background: task ? color : 'transparent',
                  }}
                  title={[
                    task ? task.title : t('calendar.noTask'),
                    block.clippedEnd ? t('calendar.continuesAfter') : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  onClick={() => {
                    if (task) onOpenTask(task)
                    else setAttaching(block.session.id)
                  }}
                >
                  <span className="daygrid__blocktitle">
                    {task ? task.title : t('calendar.noTask')}
                  </span>
                  {block.session.origin !== 'manual' && (
                    <span className="daygrid__blockicon">⏱</span>
                  )}
                </button>
              )
            })
          )}
        </div>
      </div>

      {attaching && (
        <div className="daygrid__attach">
          <span className="daygrid__attachlabel">{t('calendar.attachToTask')}</span>
          <TaskPicker
            tasks={tasks.filter((task) => !task.completed)}
            projectColors={projectColors}
            selectedId={null}
            onSelect={(taskId) => handleSelect(attaching, taskId)}
          />
        </div>
      )}
    </section>
  )
}
```

Le composant ne calcule aucune géométrie : il consomme `top`, `height`, `column` et `columnCount` produits par la tâche 1. Le plancher de hauteur d'un bloc très court est une règle CSS (`min-height` à l'étape suivante), pas un calcul.

- [ ] **Step 3: Styler la grille**

Créer `src/features/calendar/DayGrid.css` :

```css
.daygrid {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  flex: 1;
}

.daygrid__nav {
  display: flex;
  align-items: center;
  gap: 8px;
}

.daygrid__navbtn,
.daygrid__today {
  padding: 4px 10px;
  border: 1px solid var(--xh-card-border);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font-size: 0.8rem;
  cursor: pointer;
}

.daygrid__today {
  margin-left: auto;
}

.daygrid__date {
  font-size: 0.9rem;
}

.daygrid__error {
  margin: 0;
  font-size: 0.75rem;
  color: var(--xh-focus);
}

.daygrid__body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.daygrid__ruler {
  width: 56px;
  flex-shrink: 0;
}

.daygrid__hour {
  height: 48px;
  position: relative;
}

.daygrid__hourlabel {
  position: absolute;
  top: -6px;
  right: 8px;
  font-size: 0.68rem;
  opacity: 0.55;
  font-variant-numeric: tabular-nums;
}

.daygrid__canvas {
  position: relative;
  flex: 1;
  border-left: 1px solid var(--xh-card-border);
}

.daygrid__line {
  height: 48px;
  border-bottom: 1px solid var(--xh-card-border);
  opacity: 0.4;
}

.daygrid__now {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--xh-focus);
  opacity: 0.8;
}

.daygrid__block {
  position: absolute;
  min-height: 14px;
  padding: 2px 6px;
  border: 1px solid;
  border-radius: 4px;
  color: #0b0d2a;
  font-size: 0.7rem;
  text-align: left;
  overflow: hidden;
  cursor: pointer;
  display: flex;
  align-items: flex-start;
  gap: 4px;
}

.daygrid__block--orphan {
  color: inherit;
  border-style: dashed;
}

.daygrid__block--clipend {
  border-bottom-width: 3px;
  border-bottom-style: double;
}

.daygrid__blocktitle {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.daygrid__blockicon {
  margin-left: auto;
  opacity: 0.7;
}

.daygrid__skeleton {
  position: absolute;
  left: 0;
  width: 60%;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.06);
}

.daygrid__empty {
  position: absolute;
  top: 12px;
  left: 12px;
  margin: 0;
  font-size: 0.78rem;
  opacity: 0.5;
}

.daygrid__attach {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--xh-card-border);
  border-radius: 8px;
}

.daygrid__attachlabel {
  font-size: 0.78rem;
  opacity: 0.7;
}
```

`--xh-card-border` et `--xh-focus` sont définis dans `src/styles/tokens.css` — ne pas en créer d'autres.

- [ ] **Step 4: Vérifier**

Run: `rtk npx tsc -b && rtk npm test`
Expected: aucune erreur de type, 160 tests au vert.

- [ ] **Step 5: Commit**

```bash
rtk git add src/features/calendar/DayGrid.tsx src/features/calendar/DayGrid.css src/i18n/fr.json src/i18n/en.json && rtk git commit -m "feat: add the day grid component"
```

---

### Task 4: Brancher la grille dans la navigation

**Files:**
- Modify: `src/features/tasks/TasksScreen.tsx`
- Modify: `src/components/Sidebar.tsx:5`, `:12-19`
- Modify: `src/App.tsx`
- Modify: `src/i18n/fr.json`, `src/i18n/en.json`

**Interfaces:**
- Consumes: `<DayGrid onOpenTask={(task) => void} />` (tâche 3)
- Produces: la vue `jour` dans l'écran Tâches, et l'onglet desktop `day`

- [ ] **Step 1: Ajouter la troisième vue à l'écran Tâches**

Dans `src/features/tasks/TasksScreen.tsx`, élargir le type de vue :

```ts
type TasksView = 'list' | 'matrix' | 'day'
```

ajouter l'import :

```ts
import { DayGrid } from '@/features/calendar/DayGrid'
```

ajouter le troisième bouton de bascule, à la suite de celui de la matrice :

```tsx
          <button
            className={`tasks-toggle__btn ${view === 'day' ? 'tasks-toggle__btn--active' : ''}`}
            onClick={() => setView('day')}
          >
            {t('calendar.day')}
          </button>
```

et le rendu de la vue, après le bloc `{view === 'matrix' && …}` :

```tsx
      {view === 'day' && (
        <div className="tasks-screen__day">
          <DayGrid onOpenTask={(task) => setOpenTask(task)} />
        </div>
      )}
```

`setOpenTask` est l'état que l'écran utilise déjà pour son `TaskModal` : la grille délègue donc l'édition au modal existant sans le dupliquer.

- [ ] **Step 2: Ajouter le style du conteneur**

Ajouter à la fin de `src/features/tasks/TasksScreen.css` :

```css
.tasks-screen__day {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding: 0 16px 16px;
}
```

- [ ] **Step 3: Ajouter l'onglet desktop**

Dans `src/components/Sidebar.tsx`, élargir le type :

```ts
export type DesktopTab = 'timer' | 'tasks' | 'matrix' | 'day' | 'goals' | 'stats' | 'settings'
```

Le type actuel est exactement `'timer' | 'tasks' | 'matrix' | 'goals' | 'stats' | 'settings'` ; `'day'` s'y insère après `'matrix'`.

Puis ajouter l'entrée de navigation après celle de la matrice :

```ts
  { key: 'day', labelKey: 'calendar.day' },
```

- [ ] **Step 4: Router l'onglet dans `App.tsx`**

Dans `src/App.tsx`, ajouter l'import :

```ts
import { DayScreen } from '@/features/calendar/DayScreen'
```

et la ligne de rendu, après celle de la matrice :

```tsx
        {tab === 'day' && <DayScreen />}
```

- [ ] **Step 5: Écrire l'écran desktop**

L'onglet desktop a besoin de son propre modal de tâche, puisqu'il ne passe pas par l'écran Tâches. Créer `src/features/calendar/DayScreen.tsx` :

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import { useTasks } from '@/hooks/useTasks'
import { useProjects } from '@/hooks/useProjects'
import { TaskModal, type TaskDraft } from '@/features/tasks/TaskModal'
import { DayGrid } from './DayGrid'
import type { Task } from '@/features/tasks/types'

export function DayScreen() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const uid = user?.uid ?? null
  const { projects } = useProjects(uid)
  const { updateTask } = useTasks(uid, 'all')
  const [openTask, setOpenTask] = useState<Task | null>(null)

  async function handleSave(draft: TaskDraft) {
    if (!openTask) return
    await updateTask(openTask.id, draft)
    setOpenTask(null)
  }

  return (
    <div className="day-screen">
      <h1 className="day-screen__title">{t('calendar.day')}</h1>
      <DayGrid onOpenTask={(task) => setOpenTask(task)} />

      {openTask && (
        <TaskModal
          task={openTask}
          projects={projects}
          defaultProjectId={openTask.projectId}
          onSave={handleSave}
          onClose={() => setOpenTask(null)}
        />
      )}
    </div>
  )
}
```

`TaskModal` (`src/features/tasks/TaskModal.tsx:19`) prend `task`, `projects`, `defaultProjectId`, `defaultQuadrant?`, `onSave`, `onDelete?`, `onClose`, et `onSave` reçoit un `TaskDraft` exporté à la ligne 10 avec les champs `title`, `notes`, `projectId`, `quadrant`, `dueDate`, `subtasks`. `task: null` ouvrirait le modal en création — ici il est toujours non nul.

Ajouter à la fin de `src/features/tasks/TasksScreen.css` — le titre suit le motif des autres écrans :

```css
.day-screen {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding: 16px;
  gap: 12px;
}

.day-screen__title {
  margin: 0;
  font-size: 1.1rem;
}
```

- [ ] **Step 6: Vérifier**

Run: `rtk npx tsc -b && rtk npm test`
Expected: aucune erreur de type, 160 tests au vert. `noUnusedLocals` signalera tout import laissé orphelin.

- [ ] **Step 7: Commit**

```bash
rtk git add src/features/tasks/TasksScreen.tsx src/features/tasks/TasksScreen.css src/features/calendar/DayScreen.tsx src/components/Sidebar.tsx src/App.tsx && rtk git commit -m "feat: reach the day grid from the tasks screen and the sidebar"
```

---

### Task 5: Vérification finale

**Files:** aucun (vérification)

- [ ] **Step 1: Suite complète**

Run: `rtk npm test`
Expected: 160 tests au vert, sortie sans avertissement.

- [ ] **Step 2: Build de production**

Run: `rtk npm run build`
Expected: build réussi, aucune erreur TypeScript.

- [ ] **Step 3: Vérifier qu'aucune géométrie n'a fui dans le composant**

Run: `rtk grep -n "startedAt" src/features/calendar/DayGrid.tsx`
Expected: aucun résultat — le composant lit `top`, `height`, `column` et `columnCount`, jamais les timestamps bruts. La seule exception admise serait une comparaison pour la ligne « maintenant », qui utilise `range`, pas une session.

- [ ] **Step 4: Parcours manuel**

Run: `rtk npm run dev`

Note : la racine du dépôt contient un `.env` avec de vraies clés Firebase, que le serveur de dev reprend, ce qui mène à l'écran de connexion. Pour le mode local, créer un `.env.local` avec les variables `VITE_FIREBASE_*` vides, et le supprimer ensuite — il ne doit pas être commité. Si le parcours ne peut pas être joué, le dire clairement plutôt que de le déclarer réussi.

1. Ouvrir l'écran Tâches, basculer sur « Jour » : la grille affiche 24 graduations depuis la frontière de journée réglée.
2. Lancer une courte session sur une tâche depuis le minuteur, revenir : le bloc apparaît à la bonne heure, avec ⏱ et la couleur du projet.
3. Toucher ce bloc : le modal de la tâche s'ouvre sur sa section « Temps passé ».
4. Lancer une session sans tâche sélectionnée, revenir : le bloc apparaît en pointillés, libellé « Sans tâche ». Le toucher ouvre le sélecteur ; choisir une tâche la rattache, le bloc prend la couleur du projet.
5. Naviguer au jour précédent puis revenir avec « Aujourd'hui ».
6. Depuis le modal de tâche, ajouter deux entrées manuelles qui se chevauchent : les deux blocs se partagent la largeur.

Arrêter le serveur.

- [ ] **Step 5: Commit final si des correctifs ont été nécessaires**

```bash
rtk git add -A && rtk git commit -m "fix: address issues found during final verification"
```
