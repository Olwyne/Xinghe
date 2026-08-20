# Objectifs de temps par projet — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner à chaque projet une cible de temps (jour, semaine ou mois) dont la progression est calculée depuis les sessions déjà enregistrées, affichée dans l'écran Objectifs et dans Stats.

**Architecture:** Un champ `timeTarget` sur le doc `Project` porte la cible. Toute la logique de calcul est pure et isolée dans `src/lib/time.ts` (fenêtres de période) et `src/features/goals/progress.ts` (agrégation, normalisation, allocation), consommée par un hook unique `useProjectProgress` — frontière qui permettra plus tard de passer à des rollups sans toucher aux écrans. Deux bugs existants sont corrigés au passage car les objectifs en dépendent : `startedAt` de session écrit à la fin de la session, et hooks ignorant la frontière de journée configurable.

**Tech Stack:** Vite + React 19 + TypeScript, Firebase Firestore (`onSnapshot`) avec fallback `localStorage`, react-i18next (FR/EN), Vitest.

## Global Constraints

- Toutes les commandes shell sont préfixées par `rtk` (convention `CLAUDE.md`), y compris dans les chaînes `&&`.
- Frontière de journée : `TimerSettings.dayStart` (entier 0–11, défaut `4`), lue via `useTimerSettings()`. Aucune date « aujourd'hui » ne doit être calculée avec `setHours(0, 0, 0, 0)` après ce plan.
- Une seule cadence par projet : `'day' | 'week' | 'month'`.
- Normalisation en minutes/jour, diviseurs fixes : `day → ×1`, `week → ÷7`, `month → ÷30`.
- Semaine du lundi au dimanche.
- Aucune migration de données. `timeTarget` absent ou `null` = pas de cible.
- Avertissement de sur-allocation : informatif, jamais bloquant, jamais de modale.
- Remise à zéro sèche en fin de période : pas de report de déficit.
- i18n : toute nouvelle clé est ajoutée à `src/i18n/fr.json` **et** `src/i18n/en.json` dans le même commit.
- Aucune nouvelle dépendance npm.
- Bornes de saisie : minimum 1 minute ; maximum 1 440 (`day`), 10 080 (`week`), 44 640 (`month`).

**Note sur les tests :** le projet n'a ni `jsdom` ni `@testing-library/react`, et la contrainte « aucune nouvelle dépendance » s'applique. Le seul test existant (`src/features/timer/timerEngine.test.ts`) porte sur de la logique pure. Ce plan suit ce modèle : la logique d'affichage est extraite dans des fonctions pures testées (`buildTargetRows`), et aucun test de rendu DOM n'est écrit. C'est le seul écart au spec, qui mentionnait « un test de rendu sur `TimeTargetsSection` ».

## File Structure

**Créés**
- `src/features/goals/progress.ts` — logique pure : normalisation, allocation, agrégation des sessions par projet, construction des lignes d'affichage
- `src/features/goals/progress.test.ts` — tests de la logique ci-dessus
- `src/hooks/useProjectProgress.ts` — hook unique exposant la progression à l'UI (Firestore + fallback localStorage)
- `src/features/goals/TimeTargetsSection.tsx` + `.css` — section « Temps par projet »
- `src/features/goals/GoalsScreen.tsx` — conteneur : `TimeTargetsSection` puis `HabitsScreen`
- `src/lib/time.test.ts` — tests de `periodRange`

**Modifiés**
- `src/lib/time.ts` — ajout de `periodRange()`
- `src/features/tasks/types.ts` — `TargetPeriod`, `TimeTarget`, `Project.timeTarget`
- `src/features/goals/types.ts` — `Session.endedAt`
- `src/hooks/useTodaySessions.ts` — `recordSession` prend `startedAt`, écrit `endedAt`, utilise `periodRange`
- `src/hooks/useWeekSessions.ts` — utilise `periodRange`
- `src/hooks/useTimer.ts` — `onFocusComplete` reçoit `startedAt`
- `src/features/timer/TimerScreen.tsx` — transmet le vrai `startedAt`
- `src/hooks/useProjects.ts` — `updateProject` accepte `timeTarget`
- `src/features/tasks/ProjectModal.tsx` + `.css` — édition de la cible
- `src/features/stats/StatsScreen.tsx` + `.css` — carte « Objectifs par projet »
- `src/App.tsx:35` — `<HabitsScreen />` → `<GoalsScreen />`
- `src/i18n/fr.json`, `src/i18n/en.json` — clés `goals.*`

---

### Task 1: Fenêtres de période dans `lib/time.ts`

**Files:**
- Modify: `src/lib/time.ts`
- Test: `src/lib/time.test.ts` (create)

**Interfaces:**
- Consumes: rien
- Produces: `type TargetPeriod = 'day' | 'week' | 'month'`, `interface PeriodRange { start: number; end: number }`, `periodRange(period: TargetPeriod, dayStartHour: number, now: number): PeriodRange`. `start` est inclusif, `end` exclusif.

- [ ] **Step 1: Write the failing test**

Créer `src/lib/time.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { periodRange } from './time'

const HOUR = 3_600_000

/** Construit un timestamp local, sans dépendre du fuseau du runner. */
function at(y: number, m: number, d: number, h = 0, min = 0): number {
  return new Date(y, m - 1, d, h, min, 0, 0).getTime()
}

describe('periodRange', () => {
  it('day: 2h du matin appartient à la journée précédente avec dayStart=4', () => {
    const r = periodRange('day', 4, at(2026, 3, 10, 2, 30))
    expect(r.start).toBe(at(2026, 3, 9, 4))
    expect(r.end).toBe(at(2026, 3, 10, 4))
  })

  it('day: 10h du matin appartient à la journée courante avec dayStart=4', () => {
    const r = periodRange('day', 4, at(2026, 3, 10, 10, 0))
    expect(r.start).toBe(at(2026, 3, 10, 4))
    expect(r.end).toBe(at(2026, 3, 11, 4))
  })

  it('day: dayStart=0 revient à minuit', () => {
    const r = periodRange('day', 0, at(2026, 3, 10, 2, 30))
    expect(r.start).toBe(at(2026, 3, 10, 0))
    expect(r.end).toBe(at(2026, 3, 11, 0))
  })

  it('week: commence le lundi', () => {
    // 2026-03-10 est un mardi
    const r = periodRange('week', 4, at(2026, 3, 10, 10))
    expect(r.start).toBe(at(2026, 3, 9, 4))
    expect(r.end).toBe(at(2026, 3, 16, 4))
  })

  it('week: dimanche appartient à la semaine qui a commencé le lundi précédent', () => {
    // 2026-03-15 est un dimanche
    const r = periodRange('week', 4, at(2026, 3, 15, 22))
    expect(r.start).toBe(at(2026, 3, 9, 4))
    expect(r.end).toBe(at(2026, 3, 16, 4))
  })

  it('week: dimanche 2h du matin appartient encore à la semaine précédente', () => {
    const r = periodRange('week', 4, at(2026, 3, 16, 2))
    expect(r.start).toBe(at(2026, 3, 9, 4))
    expect(r.end).toBe(at(2026, 3, 16, 4))
  })

  it('month: février 2026 (28 jours)', () => {
    const r = periodRange('month', 4, at(2026, 2, 15, 12))
    expect(r.start).toBe(at(2026, 2, 1, 4))
    expect(r.end).toBe(at(2026, 3, 1, 4))
  })

  it('month: janvier (31 jours)', () => {
    const r = periodRange('month', 4, at(2026, 1, 31, 23))
    expect(r.start).toBe(at(2026, 1, 1, 4))
    expect(r.end).toBe(at(2026, 2, 1, 4))
  })

  it('month: le 1er à 2h du matin appartient au mois précédent', () => {
    const r = periodRange('month', 4, at(2026, 4, 1, 2))
    expect(r.start).toBe(at(2026, 3, 1, 4))
    expect(r.end).toBe(at(2026, 4, 1, 4))
  })

  it('week: une semaine traversant un changement d’heure fait 7 jours à une heure près', () => {
    // Dernier dimanche de mars : passage à l'heure d'été dans la plupart des fuseaux européens
    const r = periodRange('week', 4, at(2026, 3, 30, 12))
    const hours = (r.end - r.start) / HOUR
    expect(hours).toBeGreaterThanOrEqual(167)
    expect(hours).toBeLessThanOrEqual(169)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk npx vitest run src/lib/time.test.ts`
Expected: FAIL — `periodRange is not a function` (l'import est indéfini).

- [ ] **Step 3: Write minimal implementation**

Ajouter à la fin de `src/lib/time.ts` :

```ts
export type TargetPeriod = 'day' | 'week' | 'month'

export interface PeriodRange {
  /** Inclusif. */
  start: number
  /** Exclusif. */
  end: number
}

/**
 * Fenêtre de la période courante, calée sur la frontière de journée configurable.
 * Une session à 2h du matin avec dayStartHour=4 appartient à la journée de la veille.
 */
export function periodRange(
  period: TargetPeriod,
  dayStartHour: number,
  now: number,
): PeriodRange {
  const offset = dayStartHour * 3_600_000
  const shifted = new Date(now - offset)
  const y = shifted.getFullYear()
  const m = shifted.getMonth()
  const d = shifted.getDate()

  let startDate: Date
  let endDate: Date

  if (period === 'day') {
    startDate = new Date(y, m, d)
    endDate = new Date(y, m, d + 1)
  } else if (period === 'week') {
    const mondayIndex = (shifted.getDay() + 6) % 7
    startDate = new Date(y, m, d - mondayIndex)
    endDate = new Date(y, m, d - mondayIndex + 7)
  } else {
    startDate = new Date(y, m, 1)
    endDate = new Date(y, m + 1, 1)
  }

  return {
    start: startDate.getTime() + offset,
    end: endDate.getTime() + offset,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk npx vitest run src/lib/time.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
rtk git add src/lib/time.ts src/lib/time.test.ts && rtk git commit -m "feat: add periodRange helper honouring configurable day boundary"
```

---

### Task 2: Types `TimeTarget` et `Session.endedAt`

**Files:**
- Modify: `src/features/tasks/types.ts`
- Modify: `src/features/goals/types.ts`

**Interfaces:**
- Consumes: `TargetPeriod` de la Task 1
- Produces: `interface TimeTarget { period: TargetPeriod; targetMinutes: number }`, `Project.timeTarget?: TimeTarget | null`, `Session.endedAt?: number`

Pas de test : ce sont des déclarations de types, vérifiées par `tsc`.

- [ ] **Step 1: Ajouter les types de cible**

Dans `src/features/tasks/types.ts`, ajouter en haut du fichier (après `export type Quadrant`) :

```ts
import type { TargetPeriod } from '@/lib/time'

export type { TargetPeriod }

export interface TimeTarget {
  period: TargetPeriod
  /** Minutes visées sur une période complète. 1 à 1440/10080/44640 selon la cadence. */
  targetMinutes: number
}
```

Et dans l'interface `Project`, après `isInbox: boolean` :

```ts
  /** Cible de temps du projet. Absent ou null = aucune cible. */
  timeTarget?: TimeTarget | null
```

- [ ] **Step 2: Ajouter `endedAt` à `Session`**

Dans `src/features/goals/types.ts`, dans l'interface `Session`, après `durationMs: number` :

```ts
  /** Fin réelle de la session. Absent sur les documents créés avant ce champ. */
  endedAt?: number
```

- [ ] **Step 3: Vérifier la compilation**

Run: `rtk npx tsc -b`
Expected: aucune erreur.

- [ ] **Step 4: Commit**

```bash
rtk git add src/features/tasks/types.ts src/features/goals/types.ts && rtk git commit -m "feat: add TimeTarget type on Project and endedAt on Session"
```

---

### Task 3: Correction de `startedAt` sur les sessions

Le bug : `recordSession` écrit `startedAt: Date.now()` **au moment de l'appel**, c'est-à-dire à la fin de la session. Une session qui démarre à 3 h 50 et finit à 4 h 15 serait rattachée au mauvais jour.

**Files:**
- Modify: `src/hooks/useTodaySessions.ts`
- Modify: `src/hooks/useTimer.ts:39`, `:69`, `:143`
- Modify: `src/features/timer/TimerScreen.tsx:42-52`

**Interfaces:**
- Consumes: `Session.endedAt` (Task 2)
- Produces: `recordSession(projectId: string, durationMs: number, startedAt: number, taskId?: string): Promise<void>` ; `onFocusComplete?: (durationMs: number, startedAt: number) => void`

- [ ] **Step 1: Élargir la signature de `onFocusComplete` dans `useTimer`**

`src/hooks/useTimer.ts` ligne 39, remplacer :

```ts
  onFocusComplete?: (durationMs: number) => void,
```

par :

```ts
  onFocusComplete?: (durationMs: number, startedAt: number) => void,
```

Ligne 69, remplacer :

```ts
        onFocusCompleteRef.current?.(currentState.duration)
```

par :

```ts
        onFocusCompleteRef.current?.(currentState.duration, currentState.startedAt ?? Date.now())
```

Ligne 143, dans le `skip` (l'état en portée s'appelle `prev`), remplacer :

```ts
        if (elapsed >= 60_000) onFocusCompleteRef.current?.(elapsed)
```

par :

```ts
        if (elapsed >= 60_000) {
          onFocusCompleteRef.current?.(elapsed, prev.startedAt ?? Date.now() - elapsed)
        }
```

- [ ] **Step 2: Faire prendre `startedAt` à `recordSession`**

`src/hooks/useTodaySessions.ts`, remplacer le corps de `recordSession` :

```ts
  const recordSession = useCallback(
    async (projectId: string, durationMs: number, startedAt: number, taskId?: string) => {
      const session: Omit<Session, 'id'> = {
        projectId,
        taskId: taskId ?? null,
        startedAt,
        durationMs,
        endedAt: Date.now(),
        type: 'focus',
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
```

- [ ] **Step 3: Transmettre le vrai début depuis `TimerScreen`**

`src/features/timer/TimerScreen.tsx`, remplacer `onFocusComplete` :

```ts
  const onFocusComplete = useCallback(
    async (ms: number, startedAt: number) => {
      const pid = selectedTask?.projectId ?? 'inbox'
      await recordSession(pid, ms, startedAt, selectedTaskId ?? undefined)
      // Accumulate spent time on the task
      if (selectedTask && uid) {
        await updateTask(selectedTask.id, { spentMs: (selectedTask.spentMs ?? 0) + ms })
      }
    },
    [recordSession, selectedTask, selectedTaskId, uid, updateTask],
  )
```

Le tableau de dépendances était incomplet (`[recordSession]` seul) et capturait une tâche sélectionnée périmée — corrigé ici puisque la ligne est réécrite.

- [ ] **Step 4: Vérifier la compilation et la suite de tests**

Run: `rtk npx tsc -b && rtk npx vitest run`
Expected: aucune erreur TypeScript, tous les tests existants passent.

- [ ] **Step 5: Commit**

```bash
rtk git add src/hooks/useTimer.ts src/hooks/useTodaySessions.ts src/features/timer/TimerScreen.tsx && rtk git commit -m "fix: record session startedAt at session start, not at completion"
```

---

### Task 4: Frontière de journée dans les hooks de sessions

**Files:**
- Modify: `src/hooks/useTodaySessions.ts`
- Modify: `src/hooks/useWeekSessions.ts`

**Interfaces:**
- Consumes: `periodRange` (Task 1), `useTimerSettings` (existant, expose `settings.dayStart`)
- Produces: rien de nouveau ; comportement corrigé uniquement

- [ ] **Step 1: `useTodaySessions` utilise `periodRange`**

Dans `src/hooks/useTodaySessions.ts`, supprimer la fonction `todayStart()` et ajouter les imports :

```ts
import { periodRange } from '@/lib/time'
import { useTimerSettings } from '@/hooks/useTimerSettings'
```

Dans le corps du hook, en tête :

```ts
  const { settings } = useTimerSettings()
  const dayStart = settings.dayStart
  const range = periodRange('day', dayStart, Date.now())
```

Remplacer `loadLocalSessions()` par un filtrage sur la fenêtre :

```ts
function loadLocalSessions(start: number, end: number): Session[] {
  const all = getStore<Session[]>(STORE_KEY, [])
  return all.filter((s) => s.startedAt >= start && s.startedAt < end && s.type === 'focus')
}
```

et son appel initial :

```ts
  const [sessions, setSessions] = useState<Session[]>(() =>
    loadLocalSessions(range.start, range.end),
  )
```

Dans l'effet Firestore, remplacer `where('startedAt', '>=', todayStart())` par les deux bornes, et ajouter `dayStart` aux dépendances :

```ts
  useEffect(() => {
    if (!isFirebaseConfigured || !uid || !db) return
    const { start, end } = periodRange('day', dayStart, Date.now())
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
```

- [ ] **Step 2: `useWeekSessions` utilise `periodRange`**

Dans `src/hooks/useWeekSessions.ts`, supprimer `weekStart()`, ajouter les mêmes imports, et remplacer par :

```ts
  const { settings } = useTimerSettings()
  const dayStart = settings.dayStart
  const range = periodRange('week', dayStart, Date.now())

  const [sessions, setSessions] = useState<Session[]>(() => {
    const all = getStore<Session[]>(LS_KEY, [])
    return all.filter(
      (s) => s.startedAt >= range.start && s.startedAt < range.end && s.type === 'focus',
    )
  })

  useEffect(() => {
    if (!isFirebaseConfigured || !uid || !db) return
    const { start, end } = periodRange('week', dayStart, Date.now())
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
```

Le calcul de `byDay` utilise `weekStart()` : remplacer les deux occurrences par `range.start`. Chaque jour du graphe est alors `range.start + i * 86_400_000`, et `dateStr()` reste inchangé.

- [ ] **Step 3: Vérifier la compilation et les tests**

Run: `rtk npx tsc -b && rtk npx vitest run`
Expected: aucune erreur, tests existants au vert.

- [ ] **Step 4: Vérifier à la main dans l'app**

Run: `rtk npm run dev`
Ouvrir l'écran Stats, régler la frontière de journée dans Réglages (par ex. 4 h → 0 h) et vérifier que le total de la semaine se recalcule sans erreur console. Arrêter le serveur ensuite.

- [ ] **Step 5: Commit**

```bash
rtk git add src/hooks/useTodaySessions.ts src/hooks/useWeekSessions.ts && rtk git commit -m "fix: honour configurable day boundary in session hooks"
```

---

### Task 5: Logique pure de progression

**Files:**
- Create: `src/features/goals/progress.ts`
- Test: `src/features/goals/progress.test.ts` (create)

**Interfaces:**
- Consumes: `periodRange`, `TargetPeriod` (Task 1) ; `Project`, `TimeTarget` (Task 2) ; `Session` (existant)
- Produces:
  - `normalizeToDaily(period: TargetPeriod, targetMinutes: number): number`
  - `interface Allocation { totalTargetPerDay: number; globalPerDay: number; isOverAllocated: boolean }`
  - `computeAllocation(projects: Project[], globalPerDay: number): Allocation`
  - `interface ProjectProgress { periodStart: number; periodEnd: number; spentMinutes: number; targetMinutes: number; ratio: number; rawRatio: number }`
  - `aggregateByProject(projects: Project[], sessions: Session[], dayStartHour: number, now: number): Record<string, ProjectProgress>`
  - `widestRangeStart(projects: Project[], dayStartHour: number, now: number): number | null`

- [ ] **Step 1: Write the failing test**

Créer `src/features/goals/progress.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import type { Project } from '@/features/tasks/types'
import type { Session } from './types'
import {
  normalizeToDaily,
  computeAllocation,
  aggregateByProject,
  widestRangeStart,
} from './progress'

function at(y: number, m: number, d: number, h = 0): number {
  return new Date(y, m - 1, d, h, 0, 0, 0).getTime()
}

const NOW = at(2026, 3, 10, 12) // mardi 10 mars 2026, 12h

function project(id: string, target: Project['timeTarget']): Project {
  return {
    id,
    name: id,
    color: '#fff',
    icon: '*',
    createdAt: 0,
    order: 0,
    isInbox: false,
    timeTarget: target,
  }
}

function session(projectId: string, startedAt: number, minutes: number): Session {
  return {
    id: `${projectId}-${startedAt}`,
    projectId,
    taskId: null,
    startedAt,
    durationMs: minutes * 60_000,
    type: 'focus',
  }
}

describe('normalizeToDaily', () => {
  it('laisse une cible quotidienne inchangée', () => {
    expect(normalizeToDaily('day', 90)).toBe(90)
  })

  it('divise une cible hebdomadaire par 7', () => {
    expect(normalizeToDaily('week', 420)).toBe(60)
  })

  it('divise une cible mensuelle par 30', () => {
    expect(normalizeToDaily('month', 1800)).toBe(60)
  })
})

describe('computeAllocation', () => {
  it('somme les cibles normalisées', () => {
    const a = computeAllocation(
      [project('a', { period: 'day', targetMinutes: 60 }), project('b', { period: 'week', targetMinutes: 420 })],
      180,
    )
    expect(a.totalTargetPerDay).toBe(120)
    expect(a.isOverAllocated).toBe(false)
  })

  it('signale la sur-allocation', () => {
    const a = computeAllocation(
      [project('a', { period: 'day', targetMinutes: 200 })],
      180,
    )
    expect(a.isOverAllocated).toBe(true)
  })

  it('ne signale rien quand le total égale exactement l’objectif global', () => {
    const a = computeAllocation([project('a', { period: 'day', targetMinutes: 180 })], 180)
    expect(a.isOverAllocated).toBe(false)
  })

  it('ne signale rien quand l’objectif global vaut 0', () => {
    const a = computeAllocation([project('a', { period: 'day', targetMinutes: 600 })], 0)
    expect(a.isOverAllocated).toBe(false)
  })

  it('ignore les projets sans cible', () => {
    const a = computeAllocation([project('a', null), project('b', undefined)], 180)
    expect(a.totalTargetPerDay).toBe(0)
    expect(a.isOverAllocated).toBe(false)
  })
})

describe('aggregateByProject', () => {
  const projects = [
    project('thesis', { period: 'week', targetMinutes: 360 }),
    project('sport', { period: 'day', targetMinutes: 30 }),
    project('noTarget', null),
  ]

  it('cumule les sessions de la fenêtre par projet', () => {
    const sessions = [
      session('thesis', at(2026, 3, 9, 10), 60),  // lundi, dans la semaine
      session('thesis', at(2026, 3, 10, 9), 70),  // mardi, dans la semaine
      session('sport', at(2026, 3, 10, 8), 20),   // mardi, dans la journée
    ]
    const result = aggregateByProject(projects, sessions, 4, NOW)
    expect(result.thesis.spentMinutes).toBe(130)
    expect(result.thesis.targetMinutes).toBe(360)
    expect(result.sport.spentMinutes).toBe(20)
  })

  it('exclut les sessions hors fenêtre', () => {
    const sessions = [
      session('sport', at(2026, 3, 9, 8), 45),   // la veille
      session('sport', at(2026, 3, 10, 2), 15),  // 2h du matin => veille avec dayStart=4
      session('sport', at(2026, 3, 10, 8), 20),
    ]
    const result = aggregateByProject(projects, sessions, 4, NOW)
    expect(result.sport.spentMinutes).toBe(20)
  })

  it('ignore les sessions orphelines dont le projet n’existe plus', () => {
    const sessions = [session('deleted', at(2026, 3, 10, 9), 50)]
    const result = aggregateByProject(projects, sessions, 4, NOW)
    expect(result.deleted).toBeUndefined()
    expect(Object.keys(result).sort()).toEqual(['sport', 'thesis'])
  })

  it('n’inclut pas les projets sans cible', () => {
    const result = aggregateByProject(projects, [], 4, NOW)
    expect(result.noTarget).toBeUndefined()
  })

  it('borne ratio à 1 et expose rawRatio au-delà', () => {
    const sessions = [session('sport', at(2026, 3, 10, 8), 60)] // cible 30
    const result = aggregateByProject(projects, sessions, 4, NOW)
    expect(result.sport.ratio).toBe(1)
    expect(result.sport.rawRatio).toBe(2)
  })

  it('donne un ratio de 0 sans session', () => {
    const result = aggregateByProject(projects, [], 4, NOW)
    expect(result.sport.spentMinutes).toBe(0)
    expect(result.sport.ratio).toBe(0)
  })
})

describe('widestRangeStart', () => {
  it('retourne le début de la fenêtre la plus large utilisée', () => {
    const start = widestRangeStart(
      [project('a', { period: 'day', targetMinutes: 30 }), project('b', { period: 'week', targetMinutes: 60 })],
      4,
      NOW,
    )
    expect(start).toBe(at(2026, 3, 9, 4)) // lundi 4h, plus large que la journée
  })

  it('retourne null quand aucun projet n’a de cible', () => {
    expect(widestRangeStart([project('a', null)], 4, NOW)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk npx vitest run src/features/goals/progress.test.ts`
Expected: FAIL — `Failed to resolve import "./progress"`.

- [ ] **Step 3: Write minimal implementation**

Créer `src/features/goals/progress.ts` :

```ts
import { periodRange, type TargetPeriod } from '@/lib/time'
import type { Project } from '@/features/tasks/types'
import type { Session } from './types'

const DIVISORS: Record<TargetPeriod, number> = { day: 1, week: 7, month: 30 }

/** Ramène une cible de période à un équivalent quotidien, pour comparaison. */
export function normalizeToDaily(period: TargetPeriod, targetMinutes: number): number {
  return targetMinutes / DIVISORS[period]
}

export interface Allocation {
  totalTargetPerDay: number
  globalPerDay: number
  isOverAllocated: boolean
}

/**
 * Compare la somme des cibles projets à l'objectif quotidien global.
 * Purement informatif : rien n'est bloqué en cas de sur-allocation.
 */
export function computeAllocation(projects: Project[], globalPerDay: number): Allocation {
  const total = projects.reduce((sum, p) => {
    if (!p.timeTarget) return sum
    return sum + normalizeToDaily(p.timeTarget.period, p.timeTarget.targetMinutes)
  }, 0)
  const totalTargetPerDay = Math.round(total)
  return {
    totalTargetPerDay,
    globalPerDay,
    isOverAllocated: globalPerDay > 0 && totalTargetPerDay > globalPerDay,
  }
}

export interface ProjectProgress {
  periodStart: number
  periodEnd: number
  spentMinutes: number
  targetMinutes: number
  /** Borné à 1, pour la largeur de barre. */
  ratio: number
  /** Non borné, pour détecter un dépassement. */
  rawRatio: number
}

/**
 * Temps cumulé par projet sur sa propre fenêtre de période.
 * Les sessions dont le projet n'existe plus sont ignorées.
 */
export function aggregateByProject(
  projects: Project[],
  sessions: Session[],
  dayStartHour: number,
  now: number,
): Record<string, ProjectProgress> {
  const result: Record<string, ProjectProgress> = {}

  for (const p of projects) {
    if (!p.timeTarget) continue
    const { start, end } = periodRange(p.timeTarget.period, dayStartHour, now)
    const spentMs = sessions.reduce((sum, s) => {
      if (s.projectId !== p.id) return sum
      if (s.startedAt < start || s.startedAt >= end) return sum
      return sum + s.durationMs
    }, 0)
    const spentMinutes = Math.floor(spentMs / 60_000)
    const targetMinutes = p.timeTarget.targetMinutes
    const rawRatio = targetMinutes > 0 ? spentMinutes / targetMinutes : 0
    result[p.id] = {
      periodStart: start,
      periodEnd: end,
      spentMinutes,
      targetMinutes,
      ratio: Math.min(1, rawRatio),
      rawRatio,
    }
  }

  return result
}

/**
 * Début de la fenêtre la plus large parmi les cadences réellement utilisées.
 * Sert à ne charger que les sessions nécessaires. null = aucune cible définie.
 */
export function widestRangeStart(
  projects: Project[],
  dayStartHour: number,
  now: number,
): number | null {
  let earliest: number | null = null
  for (const p of projects) {
    if (!p.timeTarget) continue
    const { start } = periodRange(p.timeTarget.period, dayStartHour, now)
    if (earliest === null || start < earliest) earliest = start
  }
  return earliest
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk npx vitest run src/features/goals/progress.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 5: Commit**

```bash
rtk git add src/features/goals/progress.ts src/features/goals/progress.test.ts && rtk git commit -m "feat: add pure progress aggregation and allocation logic"
```

---

### Task 6: Hook `useProjectProgress`

**Files:**
- Create: `src/hooks/useProjectProgress.ts`

**Interfaces:**
- Consumes: `aggregateByProject`, `computeAllocation`, `widestRangeStart` (Task 5) ; `useProjects`, `useDailyGoal`, `useTimerSettings` (existants)
- Produces: `useProjectProgress(uid: string | null): { byProject: Record<string, ProjectProgress>; allocation: Allocation; loading: boolean }`

Pas de test unitaire : toute la logique testable a été extraite en Task 5 ; ce hook n'est que du câblage Firestore, et le projet n'a pas d'infrastructure de test de hooks.

- [ ] **Step 1: Écrire le hook**

Créer `src/hooks/useProjectProgress.ts` :

```ts
import { useState, useEffect, useMemo } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db, isFirebaseConfigured } from '@/config/firebase'
import { getStore } from '@/lib/localStore'
import { useProjects } from '@/hooks/useProjects'
import { useDailyGoal } from '@/hooks/useDailyGoal'
import { useTimerSettings } from '@/hooks/useTimerSettings'
import {
  aggregateByProject,
  computeAllocation,
  widestRangeStart,
  type ProjectProgress,
  type Allocation,
} from '@/features/goals/progress'
import type { Session } from '@/features/goals/types'

const LS_KEY = 'xinghe-sessions'

export function useProjectProgress(uid: string | null): {
  byProject: Record<string, ProjectProgress>
  allocation: Allocation
  loading: boolean
} {
  const { projects, loading: projectsLoading } = useProjects(uid)
  const { targetMinutes } = useDailyGoal(uid)
  const { settings } = useTimerSettings()
  const dayStart = settings.dayStart

  const [sessions, setSessions] = useState<Session[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)

  // Début de la fenêtre la plus large : on ne charge jamais un mois
  // de sessions si aucun projet n'a de cible mensuelle.
  const rangeStart = useMemo(
    () => widestRangeStart(projects, dayStart, Date.now()),
    [projects, dayStart],
  )

  useEffect(() => {
    if (rangeStart === null) {
      setSessions([])
      setSessionsLoading(false)
      return
    }

    if (!isFirebaseConfigured || !uid || !db) {
      const all = getStore<Session[]>(LS_KEY, [])
      setSessions(all.filter((s) => s.startedAt >= rangeStart && s.type === 'focus'))
      setSessionsLoading(false)
      return
    }

    setSessionsLoading(true)
    const q = query(
      collection(db, 'users', uid, 'sessions'),
      where('startedAt', '>=', rangeStart),
      where('type', '==', 'focus'),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        setSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Session))
        setSessionsLoading(false)
      },
      () => setSessionsLoading(false),
    )
    return unsub
  }, [uid, rangeStart])

  const byProject = useMemo(
    () => aggregateByProject(projects, sessions, dayStart, Date.now()),
    [projects, sessions, dayStart],
  )

  const allocation = useMemo(
    () => computeAllocation(projects, targetMinutes),
    [projects, targetMinutes],
  )

  return { byProject, allocation, loading: projectsLoading || sessionsLoading }
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `rtk npx tsc -b`
Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
rtk git add src/hooks/useProjectProgress.ts && rtk git commit -m "feat: add useProjectProgress hook"
```

---

### Task 7: Édition de la cible dans `ProjectModal`

**Files:**
- Modify: `src/hooks/useProjects.ts:113-122`
- Modify: `src/features/tasks/ProjectModal.tsx`
- Modify: `src/features/tasks/ProjectModal.css`
- Modify: `src/i18n/fr.json`, `src/i18n/en.json`

**Interfaces:**
- Consumes: `TimeTarget`, `TargetPeriod` (Task 2)
- Produces: `onUpdate` de `ProjectModal` accepte désormais `timeTarget` ; clés i18n `goals.target*`

- [ ] **Step 1: Élargir `updateProject`**

`src/hooks/useProjects.ts`, dans `updateProject`, remplacer le type du paramètre :

```ts
    async (
      id: string,
      updates: Partial<Pick<Project, 'name' | 'color' | 'icon' | 'timeTarget'>>,
    ) => {
```

- [ ] **Step 2: Ajouter les clés i18n**

Dans `src/i18n/fr.json`, sous l'objet racine `goals` (le créer s'il n'existe pas) :

```json
"goals": {
  "timeTargets": "Temps par projet",
  "setTarget": "Objectif de temps",
  "noTarget": "Aucune cible",
  "targetHours": "h",
  "targetMinutes": "min",
  "period": { "day": "Jour", "week": "Semaine", "month": "Mois" },
  "thisDay": "aujourd'hui",
  "thisWeek": "cette semaine",
  "thisMonth": "ce mois-ci",
  "overAllocated": "Tes objectifs cumulent {{total}} par jour, au-delà de ton objectif global de {{global}}.",
  "empty": "Aucun projet n'a encore d'objectif de temps. Ajoutes-en un depuis la gestion des projets."
}
```

Dans `src/i18n/en.json`, au même emplacement :

```json
"goals": {
  "timeTargets": "Time per project",
  "setTarget": "Time target",
  "noTarget": "No target",
  "targetHours": "h",
  "targetMinutes": "min",
  "period": { "day": "Day", "week": "Week", "month": "Month" },
  "thisDay": "today",
  "thisWeek": "this week",
  "thisMonth": "this month",
  "overAllocated": "Your targets add up to {{total}} per day, above your global goal of {{global}}.",
  "empty": "No project has a time target yet. Add one from project management."
}
```

Si une clé `goals` existe déjà dans ces fichiers, fusionner ces entrées dedans sans écraser les existantes.

- [ ] **Step 3: Ajouter l'éditeur de cible à `ProjectRow`**

Dans `src/features/tasks/ProjectModal.tsx`, importer les types :

```ts
import type { Project, TargetPeriod } from './types'
```

Élargir le type `onUpdate` de `ProjectModalProps` :

```ts
  onUpdate: (
    id: string,
    updates: Partial<Pick<Project, 'name' | 'color' | 'icon' | 'timeTarget'>>,
  ) => void
```

Ajouter en haut du fichier la table des bornes et la validation :

```ts
const MAX_MINUTES: Record<TargetPeriod, number> = { day: 1440, week: 10080, month: 44640 }

function isValidTarget(period: TargetPeriod, minutes: number): boolean {
  return Number.isInteger(minutes) && minutes >= 1 && minutes <= MAX_MINUTES[period]
}
```

Dans `ProjectRow`, ajouter l'état local sous `const [color, setColor] = useState(project.color)` :

```ts
  const [period, setPeriod] = useState<TargetPeriod>(project.timeTarget?.period ?? 'week')
  const [hours, setHours] = useState(String(Math.floor((project.timeTarget?.targetMinutes ?? 0) / 60)))
  const [mins, setMins] = useState(String((project.timeTarget?.targetMinutes ?? 0) % 60))

  const totalMinutes = (parseInt(hours, 10) || 0) * 60 + (parseInt(mins, 10) || 0)
  const targetValid = totalMinutes === 0 || isValidTarget(period, totalMinutes)
```

Remplacer la fonction `save()` :

```ts
  function save() {
    const trimmed = name.trim()
    if (!trimmed || !targetValid) return
    onUpdate(project.id, {
      name: trimmed,
      color,
      timeTarget: totalMinutes > 0 ? { period, targetMinutes: totalMinutes } : null,
    })
    setEditing(false)
  }
```

Dans le rendu du mode édition, insérer entre `pm-row__colors` et `pm-row__actions` :

```tsx
        <div className="pm-row__target">
          <span className="pm-row__target-label">{t('goals.setTarget')}</span>
          <div className="pm-row__target-inputs">
            <input
              className="pm-row__target-num"
              type="number"
              min="0"
              max="999"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              aria-label={t('goals.targetHours')}
            />
            <span>{t('goals.targetHours')}</span>
            <input
              className="pm-row__target-num"
              type="number"
              min="0"
              max="59"
              value={mins}
              onChange={(e) => setMins(e.target.value)}
              aria-label={t('goals.targetMinutes')}
            />
            <span>{t('goals.targetMinutes')}</span>
          </div>
          <div className="pm-row__periods">
            {(['day', 'week', 'month'] as TargetPeriod[]).map((p) => (
              <button
                key={p}
                className={`pm-row__period ${p === period ? 'pm-row__period--active' : ''}`}
                onClick={() => setPeriod(p)}
              >
                {t(`goals.period.${p}`)}
              </button>
            ))}
          </div>
          <button
            className="pm-row__target-clear"
            onClick={() => { setHours('0'); setMins('0') }}
          >
            {t('goals.noTarget')}
          </button>
        </div>
```

Et désactiver la sauvegarde quand la cible est invalide — remplacer le bouton `pm-row__save` :

```tsx
          <button className="pm-row__save" onClick={save} disabled={!targetValid}>
            {t('common.save')}
          </button>
```

- [ ] **Step 4: Ajouter les styles**

Ajouter à la fin de `src/features/tasks/ProjectModal.css` :

```css
.pm-row__target {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.pm-row__target-label {
  font-size: 0.75rem;
  opacity: 0.7;
}

.pm-row__target-inputs {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
}

.pm-row__target-num {
  width: 56px;
  padding: 4px 6px;
  background: var(--xh-surface-2, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--xh-border, rgba(255, 255, 255, 0.12));
  border-radius: 6px;
  color: inherit;
  font: inherit;
}

.pm-row__periods {
  display: flex;
  gap: 4px;
}

.pm-row__period {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid var(--xh-border, rgba(255, 255, 255, 0.12));
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font-size: 0.8rem;
  cursor: pointer;
}

.pm-row__period--active {
  background: var(--xh-focus);
  color: #0B0D2A;
  border-color: transparent;
}

.pm-row__target-clear {
  align-self: flex-start;
  padding: 0;
  background: none;
  border: none;
  color: inherit;
  opacity: 0.6;
  font-size: 0.75rem;
  text-decoration: underline;
  cursor: pointer;
}
```

Si les variables `--xh-surface-2` ou `--xh-border` n'existent pas dans `src/styles/tokens.css`, les valeurs de repli ci-dessus s'appliquent — ne pas inventer de nouveaux tokens.

- [ ] **Step 5: Vérifier compilation et rendu**

Run: `rtk npx tsc -b && rtk npm run dev`
Ouvrir l'écran Tâches → gestion des projets → éditer un projet : régler 6 h 0 min / Semaine, sauvegarder, rouvrir et vérifier que la valeur est bien rechargée. Vérifier que « Aucune cible » remet les champs à zéro et que sauvegarder efface la cible. Arrêter le serveur.

- [ ] **Step 6: Commit**

```bash
rtk git add src/hooks/useProjects.ts src/features/tasks/ProjectModal.tsx src/features/tasks/ProjectModal.css src/i18n/fr.json src/i18n/en.json && rtk git commit -m "feat: edit per-project time target in project modal"
```

---

### Task 8: Section « Temps par projet » dans l'écran Objectifs

**Files:**
- Modify: `src/features/goals/progress.ts` (ajout de `buildTargetRows`)
- Modify: `src/features/goals/progress.test.ts` (tests de `buildTargetRows`)
- Create: `src/features/goals/TimeTargetsSection.tsx`, `src/features/goals/TimeTargetsSection.css`
- Create: `src/features/goals/GoalsScreen.tsx`
- Modify: `src/App.tsx:35`

**Interfaces:**
- Consumes: `useProjectProgress` (Task 6), clés i18n (Task 7), `formatMinutesToHours` (existant dans `lib/time.ts`)
- Produces: `buildTargetRows(projects: Project[], byProject: Record<string, ProjectProgress>): TargetRow[]` avec `interface TargetRow { projectId: string; name: string; color: string; icon: string; spentMinutes: number; targetMinutes: number; ratio: number; isExceeded: boolean; periodKey: 'thisDay' | 'thisWeek' | 'thisMonth' }`

- [ ] **Step 1: Write the failing test**

Ajouter à la fin de `src/features/goals/progress.test.ts` :

```ts
describe('buildTargetRows', () => {
  const projects = [
    project('thesis', { period: 'week', targetMinutes: 360 }),
    project('sport', { period: 'day', targetMinutes: 30 }),
    project('noTarget', null),
  ]

  it('ne retourne que les projets ayant une cible', () => {
    const byProject = aggregateByProject(projects, [], 4, NOW)
    const rows = buildTargetRows(projects, byProject)
    expect(rows.map((r) => r.projectId).sort()).toEqual(['sport', 'thesis'])
  })

  it('traduit la cadence en clé de libellé de fenêtre', () => {
    const byProject = aggregateByProject(projects, [], 4, NOW)
    const rows = buildTargetRows(projects, byProject)
    expect(rows.find((r) => r.projectId === 'thesis')?.periodKey).toBe('thisWeek')
    expect(rows.find((r) => r.projectId === 'sport')?.periodKey).toBe('thisDay')
  })

  it('marque le dépassement de cible', () => {
    const sessions = [session('sport', at(2026, 3, 10, 8), 45)] // cible 30
    const byProject = aggregateByProject(projects, sessions, 4, NOW)
    const rows = buildTargetRows(projects, byProject)
    const sportRow = rows.find((r) => r.projectId === 'sport')
    expect(sportRow?.isExceeded).toBe(true)
    expect(sportRow?.ratio).toBe(1)
    expect(sportRow?.spentMinutes).toBe(45)
  })

  it('ne marque pas de dépassement quand la cible est juste atteinte', () => {
    const sessions = [session('sport', at(2026, 3, 10, 8), 30)]
    const byProject = aggregateByProject(projects, sessions, 4, NOW)
    const rows = buildTargetRows(projects, byProject)
    expect(rows.find((r) => r.projectId === 'sport')?.isExceeded).toBe(false)
  })

  it('préserve l’ordre des projets', () => {
    const byProject = aggregateByProject(projects, [], 4, NOW)
    expect(buildTargetRows(projects, byProject)[0].projectId).toBe('thesis')
  })
})
```

Et compléter l'import en haut du fichier de test :

```ts
import {
  normalizeToDaily,
  computeAllocation,
  aggregateByProject,
  widestRangeStart,
  buildTargetRows,
} from './progress'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk npx vitest run src/features/goals/progress.test.ts`
Expected: FAIL — `buildTargetRows is not a function`.

- [ ] **Step 3: Write minimal implementation**

Ajouter à la fin de `src/features/goals/progress.ts` :

```ts
const PERIOD_LABEL_KEY: Record<TargetPeriod, 'thisDay' | 'thisWeek' | 'thisMonth'> = {
  day: 'thisDay',
  week: 'thisWeek',
  month: 'thisMonth',
}

export interface TargetRow {
  projectId: string
  name: string
  color: string
  icon: string
  spentMinutes: number
  targetMinutes: number
  ratio: number
  isExceeded: boolean
  periodKey: 'thisDay' | 'thisWeek' | 'thisMonth'
}

/** Vue prête à afficher : un projet ayant une cible = une ligne. */
export function buildTargetRows(
  projects: Project[],
  byProject: Record<string, ProjectProgress>,
): TargetRow[] {
  const rows: TargetRow[] = []
  for (const p of projects) {
    const progress = byProject[p.id]
    if (!p.timeTarget || !progress) continue
    rows.push({
      projectId: p.id,
      name: p.name,
      color: p.color,
      icon: p.icon,
      spentMinutes: progress.spentMinutes,
      targetMinutes: progress.targetMinutes,
      ratio: progress.ratio,
      isExceeded: progress.rawRatio > 1,
      periodKey: PERIOD_LABEL_KEY[p.timeTarget.period],
    })
  }
  return rows
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk npx vitest run src/features/goals/progress.test.ts`
Expected: PASS, 21 tests.

- [ ] **Step 5: Écrire la section**

Créer `src/features/goals/TimeTargetsSection.tsx` :

```tsx
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import { useProjects } from '@/hooks/useProjects'
import { useProjectProgress } from '@/hooks/useProjectProgress'
import { buildTargetRows } from './progress'
import { formatMinutesToHours } from '@/lib/time'
import './TimeTargetsSection.css'

export function TimeTargetsSection() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const uid = user?.uid ?? null
  const { projects } = useProjects(uid)
  const { byProject, allocation, loading } = useProjectProgress(uid)

  const rows = buildTargetRows(projects, byProject)

  return (
    <section className="tts">
      <h2 className="tts__title">{t('goals.timeTargets')}</h2>

      {allocation.isOverAllocated && (
        <p className="tts__warning">
          {t('goals.overAllocated', {
            total: formatMinutesToHours(allocation.totalTargetPerDay),
            global: formatMinutesToHours(allocation.globalPerDay),
          })}
        </p>
      )}

      {loading ? (
        <div className="tts__skeletons">
          <div className="tts__skeleton" />
          <div className="tts__skeleton" />
        </div>
      ) : rows.length === 0 ? (
        <p className="tts__empty">{t('goals.empty')}</p>
      ) : (
        <ul className="tts__list">
          {rows.map((row) => (
            <li key={row.projectId} className="tts__row">
              <span className="tts__icon" style={{ color: row.color }}>{row.icon}</span>
              <div className="tts__body">
                <div className="tts__header">
                  <span className="tts__name">{row.name}</span>
                  <span className={`tts__value ${row.isExceeded ? 'tts__value--exceeded' : ''}`}>
                    {formatMinutesToHours(row.spentMinutes)} / {formatMinutesToHours(row.targetMinutes)}
                  </span>
                </div>
                <div className="tts__track">
                  <div
                    className="tts__fill"
                    style={{ width: `${row.ratio * 100}%`, background: row.color }}
                  />
                </div>
                <span className="tts__period">{t(`goals.${row.periodKey}`)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
```

Créer `src/features/goals/TimeTargetsSection.css` :

```css
.tts {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tts__title {
  font-size: 0.95rem;
  font-weight: 600;
  margin: 0;
}

.tts__warning {
  margin: 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(232, 201, 122, 0.12);
  border: 1px solid rgba(232, 201, 122, 0.3);
  font-size: 0.8rem;
  line-height: 1.4;
}

.tts__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.tts__row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.tts__icon {
  font-size: 1.1rem;
  line-height: 1.4;
}

.tts__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tts__header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}

.tts__name {
  font-size: 0.9rem;
}

.tts__value {
  font-size: 0.8rem;
  opacity: 0.75;
  font-variant-numeric: tabular-nums;
}

.tts__value--exceeded {
  color: var(--xh-focus);
  opacity: 1;
}

.tts__track {
  height: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.tts__fill {
  height: 100%;
  border-radius: 3px;
  transition: width 240ms ease;
}

.tts__period {
  font-size: 0.7rem;
  opacity: 0.55;
}

.tts__empty {
  margin: 0;
  font-size: 0.85rem;
  opacity: 0.6;
}

.tts__skeletons {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.tts__skeleton {
  height: 34px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
}
```

- [ ] **Step 6: Composer l'écran Objectifs**

Créer `src/features/goals/GoalsScreen.tsx` :

```tsx
import { TimeTargetsSection } from './TimeTargetsSection'
import { HabitsScreen } from '@/features/habits/HabitsScreen'

export function GoalsScreen() {
  return (
    <>
      <TimeTargetsSection />
      <HabitsScreen />
    </>
  )
}
```

Dans `src/App.tsx`, remplacer l'import de `HabitsScreen` par `import { GoalsScreen } from '@/features/goals/GoalsScreen'` et la ligne 35 par :

```tsx
        {tab === 'goals' && <GoalsScreen />}
```

- [ ] **Step 7: Vérifier**

Run: `rtk npx tsc -b && rtk npx vitest run && rtk npm run dev`
Ouvrir l'onglet Objectifs : la section apparaît au-dessus des habitudes. Sans cible définie → message d'état vide. Avec une cible et une session enregistrée → barre remplie. Régler une cible à 30 min/jour avec un objectif global de 90 min et deux autres projets à 60 min/jour chacun → le bandeau de sur-allocation apparaît. Arrêter le serveur.

- [ ] **Step 8: Commit**

```bash
rtk git add src/features/goals/ src/App.tsx && rtk git commit -m "feat: show per-project time targets on the goals screen"
```

---

### Task 9: Carte « Objectifs par projet » dans Stats

**Files:**
- Modify: `src/features/stats/StatsScreen.tsx`
- Modify: `src/features/stats/StatsScreen.css`
- Modify: `src/i18n/fr.json`, `src/i18n/en.json`

**Interfaces:**
- Consumes: `useProjectProgress` (Task 6), `buildTargetRows` (Task 8)
- Produces: rien

- [ ] **Step 1: Ajouter les clés i18n**

Dans `src/i18n/fr.json`, sous l'objet `stats` existant :

```json
"projectTargets": "Objectifs par projet",
"noProjectTargets": "Aucun objectif de temps défini."
```

Dans `src/i18n/en.json`, sous `stats` :

```json
"projectTargets": "Targets by project",
"noProjectTargets": "No time target set."
```

- [ ] **Step 2: Ajouter la carte**

Dans `src/features/stats/StatsScreen.tsx`, ajouter les imports :

```ts
import { useProjects } from '@/hooks/useProjects'
import { useProjectProgress } from '@/hooks/useProjectProgress'
import { buildTargetRows } from '@/features/goals/progress'
```

Dans le corps du composant, après `const { targetMinutes } = useDailyGoal(uid)` :

```ts
  const { projects } = useProjects(uid)
  const { byProject } = useProjectProgress(uid)
  const targetRows = buildTargetRows(projects, byProject)
```

Insérer la carte après la carte « focus de la semaine » et avant la carte des habitudes :

```tsx
      <section className="stats-card">
        <div className="stats-card__header">
          <span className="stats-card__label">{t('stats.projectTargets')}</span>
        </div>

        {targetRows.length === 0 ? (
          <p className="stats-card__empty">{t('stats.noProjectTargets')}</p>
        ) : (
          <ul className="stats-targets">
            {targetRows.map((row) => (
              <li key={row.projectId} className="stats-target">
                <span className="stats-target__name">{row.name}</span>
                <div className="stats-target__track">
                  <div
                    className="stats-target__fill"
                    style={{ width: `${row.ratio * 100}%`, background: row.color }}
                  />
                </div>
                <span className="stats-target__pct">
                  {Math.round((row.spentMinutes / row.targetMinutes) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
```

Note : `row.targetMinutes` est toujours ≥ 1 (validé à la saisie, Task 7), donc la division est sûre.

- [ ] **Step 3: Ajouter les styles**

Ajouter à la fin de `src/features/stats/StatsScreen.css` :

```css
.stats-targets {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.stats-target {
  display: grid;
  grid-template-columns: minmax(60px, 1fr) 2fr auto;
  align-items: center;
  gap: 10px;
  font-size: 0.8rem;
}

.stats-target__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stats-target__track {
  height: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.stats-target__fill {
  height: 100%;
  border-radius: 3px;
}

.stats-target__pct {
  opacity: 0.7;
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 4: Vérifier**

Run: `rtk npx tsc -b && rtk npx vitest run && rtk npm run dev`
Ouvrir l'onglet Stats : la carte affiche une ligne par projet ayant une cible, avec le pourcentage. Sans cible → message d'état vide. Arrêter le serveur.

- [ ] **Step 5: Commit**

```bash
rtk git add src/features/stats/StatsScreen.tsx src/features/stats/StatsScreen.css src/i18n/fr.json src/i18n/en.json && rtk git commit -m "feat: show project targets versus actual in stats"
```

---

### Task 10: Vérification finale

**Files:** aucun (vérification)

- [ ] **Step 1: Suite complète**

Run: `rtk npx vitest run`
Expected: tous les tests au vert, dont les 10 de `time.test.ts` et les 21 de `progress.test.ts`.

- [ ] **Step 2: Build de production**

Run: `rtk npm run build`
Expected: build réussi, aucune erreur TypeScript.

- [ ] **Step 3: Vérifier qu'aucun `setHours(0, 0, 0, 0)` ne subsiste**

Run: `rtk grep -rn "setHours(0" src`
Expected: aucun résultat.

- [ ] **Step 4: Parcours manuel**

Run: `rtk npm run dev`

1. Définir une cible de 6 h/semaine sur un projet.
2. Lancer une session de focus courte sur une tâche de ce projet, la laisser se terminer.
3. Vérifier que la barre de l'écran Objectifs progresse.
4. Vérifier que la carte de Stats affiche le même pourcentage.
5. Changer la cadence en « Jour » : la progression se recalcule sur la journée.
6. Supprimer la cible : le projet disparaît des deux écrans, sans erreur console.

Arrêter le serveur.

- [ ] **Step 5: Commit final si des correctifs ont été nécessaires**

```bash
rtk git add -A && rtk git commit -m "fix: address issues found during final verification"
```
