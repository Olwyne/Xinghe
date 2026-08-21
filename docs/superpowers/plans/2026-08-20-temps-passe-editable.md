# Temps passé éditable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire des sessions la seule source du temps passé sur une tâche, consultable, corrigeable et complétable à la main depuis le modal de tâche.

**Architecture:** Une saisie manuelle est une session comme une autre, distinguée par un champ `origin`. Toute la logique de saisie (validation, conversion formulaire ↔ session, total) vit dans un module pur `timeEntry.ts` ; l'accès aux données passe par un hook unique `useTaskSessions` ; l'affichage est un composant séparé monté par `TaskModal`. `Task.spentMs` cesse d'être lu et écrit, ce qui supprime la double comptabilité actuelle.

**Tech Stack:** Vite + React 19 + TypeScript, Firebase Firestore avec repli `localStorage`, react-i18next FR/EN, Vitest.

## Global Constraints

- Toutes les commandes shell sont préfixées par `rtk`, y compris dans les chaînes `&&`.
- Type check : `rtk npx tsc -b`. Ne jamais passer `--noEmit false` — cela force l'émission de `.js` dans tout `src/`.
- Tests : `rtk npm test`. 106 tests passent au départ.
- Aucune nouvelle dépendance npm. Cela exclut `jsdom` et `@testing-library/react` : aucun test de rendu DOM, donc toute logique à tester vit dans une fonction pure.
- Aucune nouvelle variable CSS personnalisée.
- Toute chaîne visible passe par `t()`, avec la clé présente dans `src/i18n/fr.json` **et** `src/i18n/en.json` dans le même commit.
- `noUnusedLocals` est activé : un import laissé orphelin fait échouer le type check.
- Aucune migration de données. `origin` absent d'un document existant vaut `'timer'`.
- Règles de saisie, exactement deux : durée d'au moins 1 minute, début pas dans le futur. Chevauchements autorisés, pas de plafond de durée, pas de limite d'ancienneté.
- Le formulaire saisit des minutes entières : `durationMs = durationMinutes × 60 000`. `totalMinutes` tronque à la minute inférieure (`Math.floor`), comme l'agrégation des objectifs de projet.
- Une session est rattachée à la période contenant son **début**.

## Hors périmètre, délibérément

- Le journal du jour et le rattachement d'une session orpheline à une tâche : sous-projet C.
- La durée estimée d'une tâche, le calendrier, le glisser-déposer, la comparaison planifié/réel.
- Un champ de total directement modifiable qui créerait une entrée d'ajustement.
- La suppression en cascade des sessions quand une tâche est supprimée : elles subsistent volontairement.

## File Structure

**Créés**
- `src/features/tasks/timeEntry.ts` — logique pure de la saisie : validation, conversion formulaire ↔ session, total, réaffectation de projet
- `src/features/tasks/timeEntry.test.ts` — tests de ce module
- `src/hooks/useTaskSessions.ts` — accès aux sessions d'une tâche : lecture temps réel, ajout, modification, suppression
- `src/features/tasks/TaskTimeEntries.tsx` + `.css` — la section « Temps passé »

**Modifiés**
- `src/features/goals/types.ts` — `Session` gagne `origin` et `editedAt`
- `src/hooks/useTodaySessions.ts` — `recordSession` écrit `origin: 'timer'`
- `src/features/timer/TimerScreen.tsx` — n'incrémente plus `Task.spentMs`
- `src/features/tasks/TaskModal.tsx` — suppression du bloc stale `spentMs` (tâche 1), puis montage de `<TaskTimeEntries>` (tâche 5)
- `src/features/tasks/TaskModal.css` — suppression de la règle `.tm-time`
- `src/hooks/useTasks.ts` — un changement de projet réaffecte les sessions de la tâche
- `src/i18n/fr.json`, `src/i18n/en.json` — suppression de `tasks.timeSpent` (tâche 1), puis clés `tasks.*` de la section (tâche 5)

---

### Task 1: `origin` sur les sessions, `spentMs` hors circuit

**Files:**
- Modify: `src/features/goals/types.ts`
- Modify: `src/hooks/useTodaySessions.ts`
- Modify: `src/features/timer/TimerScreen.tsx:44-52`

**Interfaces:**
- Consumes: rien
- Produces: `Session.origin?: 'timer' | 'manual'`, `Session.editedAt?: number`. `recordSession(projectId: string, durationMs: number, startedAt: number, taskId?: string)` garde sa signature et écrit désormais `origin: 'timer'`.

Aucun test unitaire : ce sont des déclarations de types et deux écritures de champ, vérifiées par `tsc` et la suite existante.

- [ ] **Step 1: Étendre le type `Session`**

Dans `src/features/goals/types.ts`, dans l'interface `Session`, après `endedAt` :

```ts
  /** Comment l'entrée est née. Absent sur les documents antérieurs = 'timer'. */
  origin?: 'timer' | 'manual'
  /** Dernière correction manuelle. Absent = jamais corrigée. */
  editedAt?: number
```

- [ ] **Step 2: Marquer les sessions du minuteur**

Dans `src/hooks/useTodaySessions.ts`, dans l'objet construit par `recordSession`, ajouter après `type: 'focus',` :

```ts
        origin: 'timer',
```

- [ ] **Step 3: Cesser d'incrémenter `spentMs`**

Dans `src/features/timer/TimerScreen.tsx`, remplacer le corps de `onFocusComplete` :

```ts
  const onFocusComplete = useCallback(
    async (ms: number, startedAt: number) => {
      const pid = selectedTask?.projectId ?? 'inbox'
      await recordSession(pid, ms, startedAt, selectedTaskId ?? undefined)
    },
    [recordSession, selectedTask, selectedTaskId],
  )
```

Le temps de la tâche se calcule désormais depuis ses sessions ; l'accumulateur `Task.spentMs` n'est plus une source de vérité. Si `updateTask` ou `uid` ne sont plus utilisés ailleurs dans le fichier après cette suppression, retirer aussi leur récupération — `noUnusedLocals` le signalera.

- [ ] **Step 4: Retirer l'affichage stale de `spentMs` du modal**

Dans `src/features/tasks/TaskModal.tsx`, supprimer le bloc aux lignes 223-227 :

```tsx
        {!!task?.spentMs && task.spentMs > 0 && (
          <div className="tm-time">
            {t('tasks.timeSpent', { minutes: Math.round(task.spentMs / 60000) })}
          </div>
        )}
```

Jusqu'à ce que la section des temps passés arrive, cet emplacement reste vide ; il sera occupé par `<TaskTimeEntries task={task} />` en tâche 5.

**Amendement post-revue (pré-merge) :** ce plan n'avait pas repéré que `useTasks.ts` stampait encore `spentMs: 0` sur chaque tâche créée (`addTask`, ligne ~88 avant correction). C'est une écriture sans lecteur — le contrat de la tâche 1 est « `spentMs` n'est plus écrit » — donc supprimée du document créé par `addTask`. La déclaration du champ optionnel reste dans `src/features/tasks/types.ts` : les documents existants la conservent, il n'y a pas de migration.

- [ ] **Step 5: Retirer la clé i18n devenue orpheline**

Dans `src/i18n/fr.json` et `src/i18n/en.json`, supprimer la ligne `"timeSpent": …` du bloc `tasks`. Avant la suppression, vérifier qu'elle n'est utilisée nulle part :

```bash
rtk grep -rn "tasks.timeSpent" src
```

Expected: aucun résultat.

- [ ] **Step 6: Retirer la règle CSS devenue orpheline**

Dans `src/features/tasks/TaskModal.css`, vérifier que `.tm-time` n'est utilisé que par le bloc qu'on vient de supprimer :

```bash
rtk grep -rn "tm-time" src
```

Expected: une seule occurrence dans `TaskModal.tsx` qui sera supprimée, et une dans le CSS à retirer.

Supprimer les lignes 218-221 :

```css
.tm-time {
  font-size: var(--xh-text-sm);
  color: var(--xh-text-faint);
}
```

- [ ] **Step 7: Vérifier**

Run: `rtk npx tsc -b && rtk npm test`
Expected: aucune erreur de type, 106 tests au vert.

- [ ] **Step 8: Commit**

```bash
rtk git add src/features/goals/types.ts src/hooks/useTodaySessions.ts src/features/timer/TimerScreen.tsx src/features/tasks/TaskModal.tsx src/features/tasks/TaskModal.css src/i18n/fr.json src/i18n/en.json && rtk git commit -m "feat: mark timer sessions with an origin, stop writing Task.spentMs"
```

---

### Task 2: Logique pure de la saisie

**Files:**
- Create: `src/features/tasks/timeEntry.ts`
- Test: `src/features/tasks/timeEntry.test.ts`

**Interfaces:**
- Consumes: `Session` de `@/features/goals/types` (avec `origin` et `editedAt`, tâche 1)
- Produces:
  - `interface TimeEntryDraft { day: number; startMinutes: number; durationMinutes: number }`
  - `type TimeEntryError = 'duration-too-short' | 'starts-in-future'`
  - `validateEntry(draft: TimeEntryDraft, now: number): TimeEntryError | null`
  - `draftToStartedAt(draft: TimeEntryDraft): number`
  - `sessionToDraft(session: Session): TimeEntryDraft`
  - `totalMinutes(sessions: Session[]): number`
  - `reassignSessions(sessions: Session[], taskId: string, newProjectId: string): Session[]`

- [ ] **Step 1: Write the failing test**

Créer `src/features/tasks/timeEntry.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import type { Session } from '@/features/goals/types'
import {
  validateEntry,
  draftToStartedAt,
  sessionToDraft,
  totalMinutes,
  reassignSessions,
  type TimeEntryDraft,
} from './timeEntry'

/** Minuit local d'un jour donné, sans dépendre du fuseau du runner. */
function day(y: number, m: number, d: number): number {
  return new Date(y, m - 1, d).getTime()
}

function draft(over: Partial<TimeEntryDraft> = {}): TimeEntryDraft {
  return { day: day(2026, 3, 10), startMinutes: 9 * 60, durationMinutes: 30, ...over }
}

function session(over: Partial<Session> = {}): Session {
  return {
    id: 's1',
    projectId: 'p1',
    taskId: 't1',
    startedAt: day(2026, 3, 10) + 9 * 60 * 60_000,
    durationMs: 30 * 60_000,
    type: 'focus',
    ...over,
  }
}

const NOW = day(2026, 3, 10) + 12 * 60 * 60_000 // 10 mars 2026, midi

describe('validateEntry', () => {
  it('accepte une entrée nominale', () => {
    expect(validateEntry(draft(), NOW)).toBeNull()
  })

  it('accepte une durée d’exactement une minute', () => {
    expect(validateEntry(draft({ durationMinutes: 1 }), NOW)).toBeNull()
  })

  it('refuse une durée nulle', () => {
    expect(validateEntry(draft({ durationMinutes: 0 }), NOW)).toBe('duration-too-short')
  })

  it('refuse une durée négative', () => {
    expect(validateEntry(draft({ durationMinutes: -30 }), NOW)).toBe('duration-too-short')
  })

  it('accepte un début à l’instant présent', () => {
    expect(validateEntry(draft({ startMinutes: 12 * 60 }), NOW)).toBeNull()
  })

  it('refuse un début dans le futur', () => {
    expect(validateEntry(draft({ startMinutes: 12 * 60 + 1 }), NOW)).toBe('starts-in-future')
  })

  it('refuse un jour futur même à une heure passée', () => {
    expect(validateEntry(draft({ day: day(2026, 3, 11) }), NOW)).toBe('starts-in-future')
  })

  it('accepte une entrée ancienne', () => {
    expect(validateEntry(draft({ day: day(2020, 1, 5) }), NOW)).toBeNull()
  })

  it('signale la durée avant le futur quand les deux sont invalides', () => {
    const d = draft({ day: day(2026, 3, 11), durationMinutes: 0 })
    expect(validateEntry(d, NOW)).toBe('duration-too-short')
  })
})

describe('draftToStartedAt', () => {
  it('combine le jour et l’heure', () => {
    expect(draftToStartedAt(draft())).toBe(day(2026, 3, 10) + 9 * 60 * 60_000)
  })

  it('gère minuit', () => {
    expect(draftToStartedAt(draft({ startMinutes: 0 }))).toBe(day(2026, 3, 10))
  })

  it('gère 23h59', () => {
    expect(draftToStartedAt(draft({ startMinutes: 23 * 60 + 59 })))
      .toBe(day(2026, 3, 10) + (23 * 60 + 59) * 60_000)
  })
})

describe('sessionToDraft', () => {
  it('décompose une session en jour, heure et durée', () => {
    const d = sessionToDraft(session())
    expect(d.day).toBe(day(2026, 3, 10))
    expect(d.startMinutes).toBe(9 * 60)
    expect(d.durationMinutes).toBe(30)
  })

  it('fait un aller-retour sans perte pour une durée en minutes entières', () => {
    const original = draft({ startMinutes: 14 * 60 + 35, durationMinutes: 95 })
    const s = session({
      startedAt: draftToStartedAt(original),
      durationMs: original.durationMinutes * 60_000,
    })
    expect(sessionToDraft(s)).toEqual(original)
  })

  it('tronque les secondes d’une session mesurée', () => {
    const s = session({ durationMs: 25 * 60_000 + 47_000 })
    expect(sessionToDraft(s).durationMinutes).toBe(25)
  })

  it('reste sur le bon jour local après un changement d’heure', () => {
    // Dernier dimanche de mars : passage à l'heure d'été dans la plupart des fuseaux européens
    const s = session({ startedAt: day(2026, 3, 29) + 15 * 60 * 60_000 })
    expect(sessionToDraft(s).day).toBe(day(2026, 3, 29))
    expect(sessionToDraft(s).startMinutes).toBe(15 * 60)
  })
})

describe('totalMinutes', () => {
  it('vaut zéro sans session', () => {
    expect(totalMinutes([])).toBe(0)
  })

  it('somme plusieurs sessions', () => {
    expect(totalMinutes([session(), session({ id: 's2', durationMs: 45 * 60_000 })])).toBe(75)
  })

  it('tronque le total à la minute inférieure', () => {
    const a = session({ durationMs: 30_000 })
    const b = session({ id: 's2', durationMs: 45_000 })
    // 75 s au total : une minute pleine, pas deux
    expect(totalMinutes([a, b])).toBe(1)
  })
})

describe('reassignSessions', () => {
  it('change le projet des sessions de la tâche', () => {
    const result = reassignSessions([session(), session({ id: 's2' })], 't1', 'p2')
    expect(result.map((s) => s.projectId)).toEqual(['p2', 'p2'])
  })

  it('laisse les sessions des autres tâches intactes', () => {
    const other = session({ id: 's2', taskId: 't2', projectId: 'p9' })
    const result = reassignSessions([session(), other], 't1', 'p2')
    expect(result.find((s) => s.id === 's2')?.projectId).toBe('p9')
  })

  it('ignore les sessions sans tâche', () => {
    const orphan = session({ id: 's3', taskId: null, projectId: 'p9' })
    const result = reassignSessions([orphan], 't1', 'p2')
    expect(result[0].projectId).toBe('p9')
  })

  it('ne retourne que des sessions, sans en perdre', () => {
    const input = [session(), session({ id: 's2', taskId: 't2' })]
    expect(reassignSessions(input, 't1', 'p2')).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk npx vitest run src/features/tasks/timeEntry.test.ts`
Expected: FAIL — `Failed to resolve import "./timeEntry"`.

- [ ] **Step 3: Write minimal implementation**

Créer `src/features/tasks/timeEntry.ts` :

```ts
import type { Session } from '@/features/goals/types'

export interface TimeEntryDraft {
  /** Minuit local du jour choisi. */
  day: number
  /** Minutes depuis minuit. */
  startMinutes: number
  durationMinutes: number
}

export type TimeEntryError = 'duration-too-short' | 'starts-in-future'

/**
 * Deux règles seulement : au moins une minute, pas de début dans le futur.
 * Les chevauchements sont autorisés — le seul qui gêne se verra sur la grille
 * horaire du calendrier, pas dans ce formulaire.
 *
 * null = valide.
 */
export function validateEntry(draft: TimeEntryDraft, now: number): TimeEntryError | null {
  if (!Number.isInteger(draft.durationMinutes) || draft.durationMinutes < 1) {
    return 'duration-too-short'
  }
  if (draftToStartedAt(draft) > now) return 'starts-in-future'
  return null
}

export function draftToStartedAt(draft: TimeEntryDraft): number {
  return draft.day + draft.startMinutes * 60_000
}

/** Décompose une session pour pré-remplir le formulaire. Les secondes sont perdues. */
export function sessionToDraft(session: Session): TimeEntryDraft {
  const start = new Date(session.startedAt)
  const dayStart = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime()
  return {
    day: dayStart,
    startMinutes: Math.round((session.startedAt - dayStart) / 60_000),
    durationMinutes: Math.floor(session.durationMs / 60_000),
  }
}

/** Total tronqué à la minute inférieure, comme l'agrégation des objectifs de projet. */
export function totalMinutes(sessions: Session[]): number {
  const ms = sessions.reduce((sum, s) => sum + s.durationMs, 0)
  return Math.floor(ms / 60_000)
}

/**
 * Le temps suit la tâche : déplacer une tâche vers un autre projet réaffecte
 * ses sessions, sinon son temps resterait compté ailleurs qu'elle.
 */
export function reassignSessions(
  sessions: Session[],
  taskId: string,
  newProjectId: string,
): Session[] {
  return sessions.map((s) =>
    s.taskId === taskId ? { ...s, projectId: newProjectId } : s,
  )
}
```

`sessionToDraft` utilise `getFullYear/getMonth/getDate` plutôt qu'une soustraction de millisecondes : c'est ce qui garde le bon jour local quand la journée ne fait pas 24 h, lors d'un changement d'heure.

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk npx vitest run src/features/tasks/timeEntry.test.ts`
Expected: PASS, 23 tests.

- [ ] **Step 5: Commit**

```bash
rtk git add src/features/tasks/timeEntry.ts src/features/tasks/timeEntry.test.ts && rtk git commit -m "feat: add pure time-entry logic"
```

**Amendement post-revue (pré-merge) :** les « deux règles seulement » ne suffisaient pas. Les champs `day` et `startMinutes` viennent d'`<input type="date">` / `<input type="time">` que l'utilisateur peut vider ; `fromDateInput('')` et `fromTimeInput('')` (dans `TaskTimeEntries.tsx`) produisent alors `NaN`, et `NaN > now` valant `false`, `validateEntry` laissait passer une session avec `startedAt: NaN` — un double Firestore légal, invisible à tout filtre par plage de dates, comptant pour aucune cible ni statistique. `validateEntry` porte désormais une troisième règle : `day` doit être un entier, et `startMinutes` un entier dans `0..1439`, sous un troisième code d'erreur `'invalid-time'` (clé `tasks.errorInvalidTime`, dans les deux fichiers de langue). `TimeEntryError` est donc `'duration-too-short' | 'starts-in-future' | 'invalid-time'`. Couvert par des tests : jour vidé, heure vidée, valeurs non entières, et les bornes 0 et 1439. Un test manquant sur le rejet d'une durée fractionnaire (`Number.isInteger`) a aussi été ajouté — sans lui, retirer ce garde-fou laissait la suite verte.

---

### Task 3: Les sessions suivent la tâche qui change de projet

**Files:**
- Modify: `src/hooks/useTasks.ts:96-106`

**Interfaces:**
- Consumes: `reassignSessions(sessions, taskId, newProjectId)` (tâche 2)
- Produces: `updateTask(id, updates)` garde sa signature ; un `updates.projectId` différent de l'actuel réaffecte désormais les sessions de la tâche

Aucun test unitaire ici : la logique testable est `reassignSessions`, déjà couverte en tâche 2 ; ce qui reste est du câblage Firestore, et le projet n'a pas d'infrastructure de test de hooks.

- [ ] **Step 1: Ajouter les imports nécessaires**

Dans `src/hooks/useTasks.ts`, compléter l'import Firestore existant avec `getDocs`, `where` et `writeBatch` :

```ts
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  where,
  writeBatch,
} from 'firebase/firestore'
```

et ajouter, sous les imports existants :

```ts
import type { Session } from '@/features/goals/types'
import { reassignSessions } from '@/features/tasks/timeEntry'
```

- [ ] **Step 2: Réaffecter les sessions dans `updateTask`**

Remplacer `updateTask` :

```ts
  const updateTask = useCallback(
    async (id: string, updates: Partial<Omit<Task, 'id'>>) => {
      const current = tasks.find((t) => t.id === id)
      const movesProject =
        updates.projectId !== undefined &&
        current !== undefined &&
        updates.projectId !== current.projectId

      if (isFirebaseConfigured && uid && db) {
        // Réaffecter les sessions AVANT d'écrire la tâche : si ce deuxième
        // write échoue en premier, la tâche garde son ancien projectId et
        // `movesProject` reste vrai au prochain essai, donc l'utilisateur
        // peut simplement refaire le déplacement. Dans l'autre ordre, une
        // fois la tâche mise à jour, `movesProject` serait faux et la
        // reprise ne ferait plus rien : les sessions resteraient orphelines
        // sur l'ancien projet.
        if (movesProject) {
          // Le temps déjà enregistré suit la tâche, sinon il resterait
          // compté dans les objectifs de son ancien projet.
          const snap = await getDocs(
            query(collection(db, `users/${uid}/sessions`), where('taskId', '==', id)),
          )
          if (!snap.empty) {
            const batch = writeBatch(db)
            snap.docs.forEach((d) => batch.update(d.ref, { projectId: updates.projectId }))
            await batch.commit()
          }
        }
        await updateDoc(docRef(uid, id), updates)
      } else {
        // Même ordre et même raison qu'en Firestore : réaffecter les
        // sessions d'abord pour qu'un échec de la mise à jour de la tâche
        // laisse `movesProject` vrai au prochain essai, plutôt que de
        // strander silencieusement les sessions sur l'ancien projet.
        if (movesProject) {
          const sessions = getStore<Session[]>('xinghe-sessions', [])
          setStore('xinghe-sessions', reassignSessions(sessions, id, updates.projectId!))
        }
        persist((all) => all.map((t) => (t.id === id ? { ...t, ...updates } : t)))
      }
    },
    [uid, tasks, persist],
  )
```

Le tableau de dépendances gagne `tasks` : la fonction lit désormais la tâche courante pour savoir si le projet change.

L'ordre des deux écritures compte : les sessions sont réaffectées avant que la
tâche ne soit mise à jour, dans les deux branches. Si l'écriture des sessions
échoue, la tâche garde son ancien `projectId` et le garde `movesProject`
reste vrai au prochain essai — l'utilisateur peut simplement refaire le
déplacement. Dans l'ordre inverse, une fois la tâche mise à jour, le garde
`movesProject` deviendrait faux et une reprise ne ferait plus rien, laissant
les sessions orphelines sur l'ancien projet.

- [ ] **Step 3: Vérifier**

Run: `rtk npx tsc -b && rtk npm test`
Expected: aucune erreur de type, 129 tests au vert (106 + 23).

- [ ] **Step 4: Commit**

```bash
rtk git add src/hooks/useTasks.ts && rtk git commit -m "feat: move a task's sessions when its project changes"
```

**Amendement post-revue (pré-merge) :** cette tâche n'avait couvert que `updateTask`, mais ce n'est pas le seul chemin qui change le `projectId` d'une tâche. `useProjects.ts` → `deleteProject` réaffecte déjà les tâches d'un projet supprimé vers l'inbox (`writeBatch` en Firestore, `setStore` en local) sans toucher leurs sessions, qui gardaient l'ancien `projectId` mort — exactement la divergence que cette tâche visait à éliminer. `deleteProject` réaffecte désormais aussi les sessions : en Firestore, une requête `where('projectId', '==', id)` sur `sessions` ajoute ses mises à jour au même `writeBatch` que les tâches et la suppression du projet (un seul commit atomique, donc pas de problème d'ordre de reprise) ; en local, `reassignSessions` est appelé pour chaque tâche affectée, sessions déplacées avant les tâches et avant le retrait du projet, pour la même raison de reprise sur échec qu'`updateTask`.

---

### Task 4: Hook d'accès aux sessions d'une tâche

**Files:**
- Create: `src/hooks/useTaskSessions.ts`

**Interfaces:**
- Consumes: `TimeEntryDraft`, `draftToStartedAt`, `totalMinutes` (tâche 2) ; `Session` avec `origin` et `editedAt` (tâche 1)
- Produces:

```ts
useTaskSessions(uid: string | null, taskId: string | null): {
  sessions: Session[]        // triées, plus récente d'abord
  totalMinutes: number
  loading: boolean
  addEntry: (draft: TimeEntryDraft, projectId: string) => Promise<void>
  updateEntry: (id: string, draft: TimeEntryDraft) => Promise<void>
  deleteEntry: (id: string) => Promise<void>
}
```

Aucun test unitaire : la logique testable est en tâche 2, et il n'existe pas d'infrastructure de test de hooks.

- [ ] **Step 1: Écrire le hook**

Créer `src/hooks/useTaskSessions.ts` :

```ts
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from 'firebase/firestore'
import { db, isFirebaseConfigured } from '@/config/firebase'
import { getStore, setStore } from '@/lib/localStore'
import type { Session } from '@/features/goals/types'
import {
  draftToStartedAt,
  totalMinutes as sumMinutes,
  type TimeEntryDraft,
} from '@/features/tasks/timeEntry'

const LS_KEY = 'xinghe-sessions'

function byNewestFirst(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => b.startedAt - a.startedAt)
}

function loadLocal(taskId: string): Session[] {
  const all = getStore<Session[]>(LS_KEY, [])
  return byNewestFirst(all.filter((s) => s.taskId === taskId))
}

/** Les entrées de temps d'une tâche : lecture temps réel et écritures. */
export function useTaskSessions(uid: string | null, taskId: string | null) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!taskId) {
      setSessions([])
      setLoading(false)
      return
    }

    if (!isFirebaseConfigured || !uid || !db) {
      setSessions(loadLocal(taskId))
      setLoading(false)
      return
    }

    setLoading(true)
    let cancelled = false
    const unsubscribe = onSnapshot(
      query(collection(db, 'users', uid, 'sessions'), where('taskId', '==', taskId)),
      (snap) => {
        if (cancelled) return
        setSessions(byNewestFirst(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Session)))
        setLoading(false)
      },
      () => {
        // Permission refusée, réseau coupé : on sort de l'état de chargement
        // plutôt que de laisser la section sur des squelettes indéfiniment.
        if (!cancelled) setLoading(false)
      },
    )
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [uid, taskId])

  const addEntry = useCallback(
    async (draft: TimeEntryDraft, projectId: string) => {
      if (!taskId) return
      const entry: Omit<Session, 'id'> = {
        projectId,
        taskId,
        startedAt: draftToStartedAt(draft),
        durationMs: draft.durationMinutes * 60_000,
        type: 'focus',
        origin: 'manual',
      }
      if (isFirebaseConfigured && uid && db) {
        await addDoc(collection(db, 'users', uid, 'sessions'), entry)
      } else {
        const all = getStore<Session[]>(LS_KEY, [])
        const created: Session = { ...entry, id: crypto.randomUUID() }
        setStore(LS_KEY, [...all, created])
        setSessions((prev) => byNewestFirst([...prev, created]))
      }
    },
    [uid, taskId],
  )

  const updateEntry = useCallback(
    async (id: string, draft: TimeEntryDraft) => {
      // origin n'est pas touché : une session mesurée puis corrigée reste
      // marquée 'timer', editedAt dit qu'elle a été retouchée.
      const updates = {
        startedAt: draftToStartedAt(draft),
        durationMs: draft.durationMinutes * 60_000,
        editedAt: Date.now(),
      }
      if (isFirebaseConfigured && uid && db) {
        await updateDoc(doc(db, 'users', uid, 'sessions', id), updates)
      } else {
        const all = getStore<Session[]>(LS_KEY, [])
        const next = all.map((s) => (s.id === id ? { ...s, ...updates } : s))
        setStore(LS_KEY, next)
        setSessions((prev) => byNewestFirst(prev.map((s) => (s.id === id ? { ...s, ...updates } : s))))
      }
    },
    [uid],
  )

  const deleteEntry = useCallback(
    async (id: string) => {
      if (isFirebaseConfigured && uid && db) {
        await deleteDoc(doc(db, 'users', uid, 'sessions', id))
      } else {
        const all = getStore<Session[]>(LS_KEY, [])
        setStore(LS_KEY, all.filter((s) => s.id !== id))
        setSessions((prev) => prev.filter((s) => s.id !== id))
      }
    },
    [uid],
  )

  const total = useMemo(() => sumMinutes(sessions), [sessions])

  return { sessions, totalMinutes: total, loading, addEntry, updateEntry, deleteEntry }
}
```

Les écritures ne rattrapent pas leurs erreurs : elles remontent à l'appelant, qui garde le formulaire ouvert et affiche le message (tâche 5). Aucune suppression optimiste ne fait disparaître une entrée qui existe encore.

- [ ] **Step 2: Vérifier**

Run: `rtk npx tsc -b && rtk npm test`
Expected: aucune erreur de type, 129 tests au vert.

- [ ] **Step 3: Commit**

```bash
rtk git add src/hooks/useTaskSessions.ts && rtk git commit -m "feat: add useTaskSessions hook"
```

**Amendements post-revue (pré-merge) :**

1. Le garde `if (!isFirebaseConfigured || !uid || !db)` ci-dessus traitait « Firebase configuré mais `uid` pas encore résolu » comme « pas de Firebase » : il lisait `localStorage` (vide dans un déploiement Firebase), affichait tout de suite l'état vide « Aucun temps enregistré. » puis, une fois l'utilisateur connu, les vrais squelettes puis les données — la séquence que la tâche 5 interdit explicitement. Un clic dans cette fenêtre pouvait aussi router une écriture vers `localStorage` au lieu de Firestore, où elle se perdait. Le hook distingue désormais les deux cas : seul `!isFirebaseConfigured` prend la branche locale ; si Firebase est configuré mais `uid` est encore `null`, le hook reste en `loading` et les trois fonctions d'écriture (`addEntry`, `updateEntry`, `deleteEntry`) lèvent plutôt que d'écrire dans le mauvais magasin.

2. `updateEntry` n'écrivait pas `endedAt`, laissant une session mesurée avec un `endedAt` obsolète après correction — champ à trois états (correct, périmé, absent) que la grille horaire du calendrier (sous-projet C) doit pouvoir lire sans ambiguïté. `addEntry` et `updateEntry` maintiennent maintenant `endedAt = startedAt + durationMs` sur toute session écrite par l'application.

Ces deux points sont couverts en amont par l'appelant (`TaskTimeEntries.tsx`, tâche 5) et par construction dans le hook ; il n'existe pas d'infrastructure de test de hooks dans ce projet pour les épingler directement.

---

### Task 5: Section « Temps passé » dans le modal de tâche

**Files:**
- Create: `src/features/tasks/TaskTimeEntries.tsx`, `src/features/tasks/TaskTimeEntries.css`
- Modify: `src/features/tasks/TaskModal.tsx:223-227`
- Modify: `src/i18n/fr.json`, `src/i18n/en.json`

**Interfaces:**
- Consumes: `useTaskSessions` (tâche 4) ; `validateEntry`, `sessionToDraft`, `type TimeEntryDraft`, `type TimeEntryError` (tâche 2) ; `formatMinutesToHours` de `@/lib/time`
- Produces: `<TaskTimeEntries task={task} />`, où `task: Task` est une tâche **déjà enregistrée**

- [ ] **Step 1: Ajouter les clés i18n**

Dans `src/i18n/fr.json`, dans l'objet `tasks` existant :

```json
"timeEntries": "Temps passé",
"addEntry": "Ajouter",
"noEntries": "Aucun temps enregistré.",
"entryDate": "Date",
"entryStart": "Début",
"entryDuration": "Durée",
"entryHours": "h",
"entryMinutes": "min",
"fromTimer": "Minuteur",
"edited": "corrigée",
"confirmDeleteEntry": "Supprimer ?",
"errorDurationTooShort": "La durée doit être d'au moins une minute.",
"errorStartsInFuture": "Une entrée ne peut pas commencer dans le futur.",
"entrySaveFailed": "Enregistrement impossible. Réessaie.",
```

Dans `src/i18n/en.json`, dans l'objet `tasks` :

```json
"timeEntries": "Time spent",
"addEntry": "Add",
"noEntries": "No time recorded yet.",
"entryDate": "Date",
"entryStart": "Start",
"entryDuration": "Duration",
"entryHours": "h",
"entryMinutes": "min",
"fromTimer": "Timer",
"edited": "edited",
"confirmDeleteEntry": "Delete?",
"errorDurationTooShort": "The duration must be at least one minute.",
"errorStartsInFuture": "An entry cannot start in the future.",
"entrySaveFailed": "Could not save. Try again.",
```

Supprimer la clé `tasks.timeSpent` des deux fichiers : l'affichage qu'elle servait disparaît à l'étape 3.

**Amendement post-revue (pré-merge) :** deux clés manquaient et ont été ajoutées aux deux fichiers de langue : `deleteEntry` (nom accessible du bouton `✕`, cf. amendement 2 de l'étape « Commit » plus bas) et `errorInvalidTime` (troisième code d'erreur de `validateEntry`, cf. l'amendement de la tâche 2). FR : `"deleteEntry": "Supprimer cette entrée"`, `"errorInvalidTime": "Renseigne une date et une heure valides."`. EN : `"deleteEntry": "Delete this entry"`, `"errorInvalidTime": "Enter a valid date and time."`.

- [ ] **Step 2: Écrire le composant**

Créer `src/features/tasks/TaskTimeEntries.tsx` :

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import { useTaskSessions } from '@/hooks/useTaskSessions'
import { formatMinutesToHours } from '@/lib/time'
import type { Task } from './types'
import type { Session } from '@/features/goals/types'
import {
  validateEntry,
  sessionToDraft,
  type TimeEntryDraft,
  type TimeEntryError,
} from './timeEntry'
import './TaskTimeEntries.css'

const ERROR_KEYS: Record<TimeEntryError, string> = {
  'duration-too-short': 'tasks.errorDurationTooShort',
  'starts-in-future': 'tasks.errorStartsInFuture',
}

function todayMidnight(): number {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function emptyDraft(): TimeEntryDraft {
  return { day: todayMidnight(), startMinutes: 9 * 60, durationMinutes: 25 }
}

/** `2026-03-10` pour un <input type="date">, en heure locale. */
function toDateInput(day: number): string {
  const d = new Date(day)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const date = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${date}`
}

function fromDateInput(value: string): number {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

/** `09:15` pour un <input type="time">. */
function toTimeInput(startMinutes: number): string {
  const h = String(Math.floor(startMinutes / 60)).padStart(2, '0')
  const m = String(startMinutes % 60).padStart(2, '0')
  return `${h}:${m}`
}

function fromTimeInput(value: string): number {
  const [h, m] = value.split(':').map(Number)
  return h * 60 + m
}

function formatDay(startedAt: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(startedAt))
}

function formatRange(session: Session, locale: string): string {
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' })
  const end = new Date(session.startedAt + session.durationMs)
  return `${time.format(new Date(session.startedAt))} → ${time.format(end)}`
}

export function TaskTimeEntries({ task }: { task: Task }) {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const uid = user?.uid ?? null
  const { sessions, totalMinutes, loading, addEntry, updateEntry, deleteEntry } =
    useTaskSessions(uid, task.id)

  /** null = aucun formulaire ouvert ; 'new' = ajout ; sinon l'id modifié. */
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<TimeEntryDraft>(emptyDraft)
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)
  /**
   * Id de la ligne (ou 'new' pour le formulaire d'ajout) dont la dernière
   * tentative a échoué. Un id, pas un booléen, pour qu'un échec sur une
   * ligne ne s'affiche jamais sur une autre pendant qu'une suppression
   * concurrente est encore en vol.
   */
  const [failedId, setFailedId] = useState<string | null>(null)

  const error = validateEntry(draft, Date.now())

  function openNew() {
    setDraft(emptyDraft())
    setFailedId(null)
    setConfirmingDelete(null)
    setEditing('new')
  }

  function openEdit(session: Session) {
    setDraft(sessionToDraft(session))
    setFailedId(null)
    setConfirmingDelete(null)
    setEditing(session.id)
  }

  async function save() {
    if (error) return
    try {
      if (editing === 'new') await addEntry(draft, task.projectId)
      else if (editing) await updateEntry(editing, draft)
      setEditing(null)
      setFailedId(null)
    } catch {
      // Le formulaire reste ouvert avec la saisie intacte.
      setFailedId(editing)
    }
  }

  async function remove(id: string) {
    setFailedId(null)
    try {
      await deleteEntry(id)
      // Une autre ligne a pu être armée pendant l'attente : ne désarmer
      // que si c'est toujours celle-ci qui est en attente de confirmation.
      setConfirmingDelete((prev) => (prev === id ? null : prev))
    } catch {
      setFailedId(id)
    }
  }

  const form = (
    <div className="tte-form">
      <label className="tte-form__field">
        <span>{t('tasks.entryDate')}</span>
        <input
          type="date"
          value={toDateInput(draft.day)}
          onChange={(e) => setDraft({ ...draft, day: fromDateInput(e.target.value) })}
        />
      </label>
      <label className="tte-form__field">
        <span>{t('tasks.entryStart')}</span>
        <input
          type="time"
          value={toTimeInput(draft.startMinutes)}
          onChange={(e) => setDraft({ ...draft, startMinutes: fromTimeInput(e.target.value) })}
        />
      </label>
      <label className="tte-form__field">
        <span>{t('tasks.entryDuration')}</span>
        <span className="tte-form__duration">
          <input
            type="number"
            min="0"
            max="99"
            value={Math.floor(draft.durationMinutes / 60)}
            onChange={(e) =>
              setDraft({
                ...draft,
                durationMinutes: (parseInt(e.target.value, 10) || 0) * 60 + (draft.durationMinutes % 60),
              })
            }
          />
          <span>{t('tasks.entryHours')}</span>
          <input
            type="number"
            min="0"
            max="59"
            value={draft.durationMinutes % 60}
            onChange={(e) =>
              setDraft({
                ...draft,
                durationMinutes:
                  Math.floor(draft.durationMinutes / 60) * 60 + (parseInt(e.target.value, 10) || 0),
              })
            }
          />
          <span>{t('tasks.entryMinutes')}</span>
        </span>
      </label>

      {error && <p className="tte-form__error">{t(ERROR_KEYS[error])}</p>}
      {failedId === editing && <p className="tte-form__error">{t('tasks.entrySaveFailed')}</p>}

      <div className="tte-form__actions">
        <button type="button" onClick={save} disabled={!!error}>{t('common.save')}</button>
        <button type="button" onClick={() => setEditing(null)}>{t('common.cancel')}</button>
      </div>
    </div>
  )

  return (
    <section className="tte">
      <div className="tte__header">
        <span className="tte__title">{t('tasks.timeEntries')}</span>
        <span className="tte__total">{formatMinutesToHours(totalMinutes)}</span>
        <button type="button" className="tte__add" onClick={openNew}>
          {t('tasks.addEntry')}
        </button>
      </div>

      {editing === 'new' && form}

      {loading ? (
        <div className="tte__skeletons">
          <div className="tte__skeleton" />
          <div className="tte__skeleton" />
        </div>
      ) : sessions.length === 0 ? (
        <p className="tte__empty">{t('tasks.noEntries')}</p>
      ) : (
        <ul className="tte__list">
          {sessions.map((s) =>
            editing === s.id ? (
              <li key={s.id}>{form}</li>
            ) : (
              <li key={s.id} className="tte__row">
                <span className="tte__day">{formatDay(s.startedAt, i18n.language)}</span>
                <span className="tte__range">{formatRange(s, i18n.language)}</span>
                <span className="tte__duration">
                  {formatMinutesToHours(Math.floor(s.durationMs / 60_000))}
                </span>
                <span className="tte__origin">
                  {s.origin !== 'manual' && <span title={t('tasks.fromTimer')}>⏱</span>}
                  {s.editedAt && <span title={t('tasks.edited')}>✎</span>}
                </span>
                {confirmingDelete === s.id ? (
                  <>
                    <button type="button" className="tte__confirm" onClick={() => remove(s.id)}>
                      {t('tasks.confirmDeleteEntry')}
                    </button>
                    <button
                      type="button"
                      className="tte__cancel"
                      onClick={() => {
                        setConfirmingDelete(null)
                        setFailedId(null)
                      }}
                    >
                      {t('common.cancel')}
                    </button>
                    {failedId === s.id && <p className="tte-form__error">{t('tasks.entrySaveFailed')}</p>}
                  </>
                ) : (
                  <>
                    <button type="button" className="tte__edit" onClick={() => openEdit(s)}>
                      {t('common.edit')}
                    </button>
                    <button
                      type="button"
                      className="tte__delete"
                      onClick={() => {
                        setConfirmingDelete(s.id)
                        setFailedId(null)
                      }}
                    >
                      ✕
                    </button>
                  </>
                )}
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  )
}
```

`common.edit` existe déjà dans les deux fichiers de langue — rien à ajouter pour cette clé.

Le projet de l'entrée est `task.projectId`, la valeur **enregistrée** de la tâche — pas l'état local du sélecteur de projet du modal, qui peut contenir un changement non encore validé.

- [ ] **Step 3: Monter la section dans `TaskModal`**

Dans `src/features/tasks/TaskModal.tsx`, ajouter l'import :

```ts
import { TaskTimeEntries } from './TaskTimeEntries'
```

Le bloc `{!!task?.spentMs && task.spentMs > 0 && (…)}` a déjà été supprimé en tâche 1. Monter la nouvelle section à la même place (entre la section des sous-tâches et les boutons d'action) :

```tsx
        {task && <TaskTimeEntries task={task} />}
```

Une tâche en cours de création n'a pas d'`id`, donc pas d'entrées : la section n'apparaît qu'à la réouverture.

- [ ] **Step 4: Styler la section**

Créer `src/features/tasks/TaskTimeEntries.css` :

```css
.tte {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 16px;
}

.tte__header {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.tte__title {
  font-size: 0.8rem;
  opacity: 0.7;
}

.tte__total {
  font-variant-numeric: tabular-nums;
  font-size: 0.9rem;
}

.tte__add {
  margin-left: auto;
  padding: 4px 10px;
  border: 1px solid var(--xh-card-border, rgba(255, 255, 255, 0.12));
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font-size: 0.78rem;
  cursor: pointer;
}

.tte__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tte__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 0.78rem;
}

.tte__row .tte-form__error {
  flex-basis: 100%;
}

.tte__day {
  opacity: 0.7;
  min-width: 92px;
}

.tte__range {
  opacity: 0.85;
  font-variant-numeric: tabular-nums;
}

.tte__duration {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}

.tte__origin {
  display: flex;
  gap: 3px;
  opacity: 0.6;
  min-width: 28px;
}

.tte__edit,
.tte__delete,
.tte__confirm,
.tte__cancel {
  padding: 2px 6px;
  border: none;
  background: none;
  color: inherit;
  opacity: 0.6;
  font-size: 0.75rem;
  cursor: pointer;
}

.tte__confirm {
  color: var(--xh-focus);
  opacity: 1;
}

.tte__empty {
  margin: 0;
  font-size: 0.78rem;
  opacity: 0.55;
}

.tte__skeletons {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tte__skeleton {
  height: 20px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
}

.tte-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--xh-card-border, rgba(255, 255, 255, 0.12));
  border-radius: 8px;
}

.tte-form__field {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.78rem;
}

.tte-form__field span {
  min-width: 56px;
  opacity: 0.7;
}

.tte-form__field input {
  padding: 4px 6px;
  background: var(--xh-card, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--xh-card-border, rgba(255, 255, 255, 0.12));
  border-radius: 6px;
  color: inherit;
  font: inherit;
  font-size: 0.78rem;
}

.tte-form__duration {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.tte-form__duration input {
  width: 52px;
}

.tte-form__error {
  margin: 0;
  font-size: 0.72rem;
  color: var(--xh-focus);
}

.tte-form__actions {
  display: flex;
  gap: 8px;
}

.tte-form__actions button {
  padding: 4px 10px;
  border: 1px solid var(--xh-card-border, rgba(255, 255, 255, 0.12));
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font-size: 0.78rem;
  cursor: pointer;
}

.tte-form__actions button:disabled {
  opacity: 0.4;
  cursor: default;
}
```

`--xh-card` et `--xh-card-border` sont définis dans `src/styles/tokens.css` (lignes 22-23) ; les valeurs de repli ne servent qu'à rendre les règles lisibles isolément. Ne pas créer de nouvelle variable.

- [ ] **Step 5: Vérifier**

Run: `rtk npx tsc -b && rtk npm test`
Expected: aucune erreur de type, 129 tests au vert.

- [ ] **Step 6: Commit**

```bash
rtk git add src/features/tasks/TaskTimeEntries.tsx src/features/tasks/TaskTimeEntries.css src/features/tasks/TaskModal.tsx src/i18n/fr.json src/i18n/en.json && rtk git commit -m "feat: list, edit and add time entries from the task modal"
```

**Amendements post-revue (pré-merge) :**

1. `<span className="tte__total">{formatMinutesToHours(totalMinutes)}</span>` était rendu en dehors du ternaire `loading`, donc `0 min` s'affichait au-dessus des squelettes à chaque ouverture, avant les vraies données — exactement la séquence transitoire interdite par la spec. Le total affiche maintenant un tiret cadratin (`—`) pendant `loading`, sans nouvelle variable CSS.

2. Le bouton `✕` de suppression n'avait ni texte ni `title` — aucun nom accessible. Il porte désormais `aria-label={t('tasks.deleteEntry')}`, avec la clé ajoutée dans les deux fichiers de langue (elle avait été prévue dans la spec d'origine puis perdue quand le bouton est devenu une icône).

3. `ERROR_KEYS` gagne l'entrée `'invalid-time': 'tasks.errorInvalidTime'` pour le troisième code d'erreur ajouté à `validateEntry` en tâche 2 (voir l'amendement de cette tâche).

4. Ce composant appelle `useAuth()` pour obtenir `uid` ; comme `useAuth` est un hook « par appel » avec son propre `useState(null)`, une instance fraîchement montée voit `uid === null` le temps que `onAuthStateChanged` résolve, même si `AuthGuard` a déjà résolu l'authentification ailleurs dans l'arbre. C'est ce qui alimentait le bug de squelette de la tâche 4 (amendement 1) : corrigé côté `useTaskSessions`, pas ici, pour ne pas dupliquer la logique de chargement dans chaque consommateur.

---

### Task 6: Vérification finale

**Files:** aucun (vérification)

- [ ] **Step 1: Suite complète**

Run: `rtk npm test`
Expected (post-revue) : 138 tests au vert (129 + 9 ajoutés en revue pré-merge : 3 sur `validateEntry` pour la garde `NaN`/non-entier introduite dans son amendement, 2 sur les bornes 0/1439, 1 sur la durée fractionnaire, 1 réécriture de discrimination DST pour `sessionToDraft`, et 1 réécriture de `reassignSessions` pour l'immutabilité — voir les amendements des tâches 2 et 6bis).

- [ ] **Step 2: Build de production**

Run: `rtk npm run build`
Expected: build réussi, aucune erreur TypeScript.

- [ ] **Step 3: Vérifier que `spentMs` n'est plus lu ni écrit**

Run: `rtk grep -rn "spentMs" src`
Expected: une seule occurrence, la déclaration du champ dans `src/features/tasks/types.ts`. Si `TaskModal` ou `TimerScreen` apparaissent encore, la tâche 1 est incomplète.

- [ ] **Step 4: Vérifier qu'aucune clé i18n n'est orpheline**

Run: `rtk grep -rn "tasks.timeSpent" src`
Expected: aucun résultat — la clé et son usage ont disparu ensemble.

- [ ] **Step 5: Parcours manuel**

Run: `rtk npm run dev`

Note : la racine du dépôt contient un `.env` avec de vraies clés Firebase, que le serveur de dev reprend, ce qui mène à l'écran de connexion. Pour le mode local, créer un `.env.local` avec les variables `VITE_FIREBASE_*` vides, et le supprimer ensuite — il ne doit pas être commité. Si le parcours ne peut pas être joué, le dire clairement plutôt que de le déclarer réussi.

1. Ouvrir une tâche ayant déjà du temps enregistré : la section liste ses entrées, marquées ⏱, et le total correspond.
2. Ajouter une entrée d'hier, 14h00, 1 h 30 : elle apparaît sans ⏱, le total augmente d'autant.
3. Saisir une durée de 0 : l'enregistrement est bloqué avec le motif affiché. Saisir une date de demain : le motif change.
4. Corriger une entrée du minuteur : elle garde ⏱ et gagne la marque de correction.
5. Supprimer une entrée : la confirmation apparaît, puis le total baisse.
6. Déplacer la tâche vers un autre projet, puis ouvrir l'écran Objectifs : le temps a suivi.

Arrêter le serveur.

- [ ] **Step 6: Commit final si des correctifs ont été nécessaires**

```bash
rtk git add -A && rtk git commit -m "fix: address issues found during final verification"
```

**Amendement post-revue (pré-merge) — deux tests qui ne pinçaient rien :**

- Le test DST de `sessionToDraft` (tâche 2) construisait une session à 15h00 et vérifiait `startMinutes === 900` et le bon jour. La première assertion est vraie par construction — `(startedAt - dayStart) / 60_000` vaut 900 quel que soit le calcul de `dayStart` tant qu'il représente *un* minuit local. La seconde tient aussi bien pour la décomposition calendaire de l'implémentation que pour une troncature naïve de l'epoch (`startedAt - startedAt % 86_400_000`) tant que l'heure testée est loin de minuit et que le fuseau du runner ne fait pas la différence. Le test a été réécrit sur une heure proche de la limite (00h30) avec le fuseau du runner fixé explicitement à `Europe/Paris` (une CI tourne souvent en UTC, où le cas serait vide de sens). Discrimination vérifiée manuellement : en substituant temporairement `sessionToDraft` par la troncature naïve, le test échoue (`expected 1774656000000 to be 1774738800000`) ; l'implémentation d'origine restaurée, il passe. Voir `sdd/final-fixes-report.md` pour le détail de cette vérification.

- Le test `reassignSessions` qui ne vérifiait que `toHaveLength(2)` passait pour une implémentation qui renvoie deux sessions arbitraires, ou qui mute ses entrées en place. Réécrit pour vérifier la préservation des champs de la session non concernée et la non-mutation du tableau d'entrée et de ses objets.
