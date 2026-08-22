# Blocs planifiés (C2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter à la grille du jour des blocs planifiés — créés au tap, déplacés au glisser, réglés au formulaire, lançables dans le minuteur.

**Architecture:** Une entité `PlannedBlock` stockée dans `users/{uid}/blocks`, distincte des `Session` parce que planifier n'est pas mesurer. Le canvas de la grille se coupe en deux couloirs — prévu à gauche, réel à droite — chacun disposé par un appel indépendant à une fonction de disposition rendue générique. Toute l'arithmétique du geste (accrochage, bornage) sort des composants dans des modules purs, seule couverture de test possible.

**Tech Stack:** Vite + React 19 + TypeScript, Vitest, Firebase Firestore avec repli `localStorage`, react-i18next (FR/EN), CSS custom properties.

## Global Constraints

- **Aucune nouvelle dépendance npm.** Ni jsdom, ni `@testing-library/react`, ni bibliothèque de drag-and-drop. Toute logique testable doit vivre dans des fonctions pures.
- Préfixer **toute** commande shell par `rtk`, y compris dans les chaînes `&&`.
- Tests : `rtk npx vitest run --dir src`. Typage : `rtk npx tsc -b` (jamais `--noEmit false`, qui émet du `.js` dans `src/`). Build : `rtk npm run build`.
- Les deux langues dans le même commit : `src/i18n/fr.json` et `src/i18n/en.json`.
- Dates et heures via `Intl.DateTimeFormat` avec `i18n.language`. Aucun format écrit à la main.
- Couleurs via les custom properties existantes (`--xh-card-border`, `--xh-focus`, `--xh-text-faint`). Thème sombre uniquement.
- Une session appartient à la fenêtre qui contient **son début**. Un bloc suit la même règle.
- Le temps d'une tâche est compté dans le projet de cette tâche : tout écrit qui pose un `taskId` pose le `projectId` correspondant dans la même opération.
- `stepMs` d'accrochage : `900_000` (un quart d'heure). Hauteur de grille : `48` px/heure.
- Seuil de bascule appui → glisser : `4` px.
- Ne jamais écrire pendant un `pointermove`. Une seule écriture, au `pointerup`.

---

### Task 1 : Rendre la disposition générique

**Files:**
- Modify: `src/features/calendar/dayLayout.ts`
- Test: `src/features/calendar/dayLayout.test.ts`

**Interfaces:**
- Consumes: `PeriodRange` de `@/lib/time`, `Session` de `@/features/goals/types`
- Produces: `Span`, `Positioned<T>`, `layoutSpans<T extends Span>(items: T[], range: PeriodRange): Positioned<T>[]`. `layoutDaySessions` et `PositionedSession` restent exportés, inchangés du point de vue de l'appelant.

Les 24 tests existants de `dayLayout.test.ts` doivent passer **sans être modifiés**. C'est la preuve que la généralisation ne change aucun comportement. Si un test existant doit être touché, c'est que la refonte a dérapé — arrêter et signaler.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à la fin de `src/features/calendar/dayLayout.test.ts` :

```ts
describe('layoutSpans — générique', () => {
  it('place un objet qui n’est pas une Session', () => {
    const block = { id: 'b1', startedAt: DAY_START + 6 * HOUR, durationMs: 2 * HOUR, taskId: 't1' }
    const [positioned] = layoutSpans([block], RANGE)
    expect(positioned.item.taskId).toBe('t1')
    expect(positioned.top).toBeCloseTo(6 / 24)
    expect(positioned.height).toBeCloseTo(2 / 24)
  })

  it('deux appels indépendants ne partagent jamais de colonne', () => {
    // Le prévu et le réel se recouvrent dans le temps mais vivent dans deux
    // couloirs : chacun doit occuper toute la largeur du sien.
    const planned = { id: 'p', startedAt: DAY_START + 6 * HOUR, durationMs: 2 * HOUR }
    const actual = { id: 'a', startedAt: DAY_START + 6 * HOUR, durationMs: HOUR }
    const [left] = layoutSpans([planned], RANGE)
    const [right] = layoutSpans([actual], RANGE)
    expect(left.column).toBe(0)
    expect(left.columnCount).toBe(1)
    expect(right.column).toBe(0)
    expect(right.columnCount).toBe(1)
  })

  it('garde le découpage en colonnes à l’intérieur d’un même appel', () => {
    const a = { id: 'a', startedAt: DAY_START + 6 * HOUR, durationMs: 2 * HOUR }
    const b = { id: 'b', startedAt: DAY_START + 7 * HOUR, durationMs: 2 * HOUR }
    const positioned = layoutSpans([a, b], RANGE)
    expect(positioned.map((p) => p.column)).toEqual([0, 1])
    expect(positioned.every((p) => p.columnCount === 2)).toBe(true)
  })
})
```

Et compléter la ligne d'import en tête du fichier :

```ts
import { layoutDaySessions, layoutSpans } from './dayLayout'
```

- [ ] **Step 2: Lancer les tests pour les voir échouer**

Run: `rtk npx vitest run --dir src`
Expected: FAIL — `layoutSpans is not a function` (ou une erreur d'import). Les 24 tests existants passent toujours.

- [ ] **Step 3: Généraliser l'implémentation**

Remplacer entièrement le contenu de `src/features/calendar/dayLayout.ts` par :

```ts
import type { Session } from '@/features/goals/types'
import type { PeriodRange } from '@/lib/time'

/** Le minimum pour être placé sur la grille : un identifiant et un intervalle. */
export interface Span {
  id: string
  startedAt: number
  durationMs: number
}

export interface Positioned<T> {
  item: T
  /** Fraction de la fenêtre : 0 = début de la grille, 1 = fin. */
  top: number
  height: number
  /** Colonne occupée dans son groupe de chevauchement. */
  column: number
  /** Nombre de colonnes du groupe, donc largeur = 1 / columnCount. */
  columnCount: number
  clippedEnd: boolean
}

export interface PositionedSession {
  session: Session
  top: number
  height: number
  column: number
  columnCount: number
  clippedEnd: boolean
}

interface Bounded<T> {
  item: T
  start: number
  end: number
  clippedEnd: boolean
  column: number
}

/**
 * Dispose des intervalles sur une fenêtre.
 *
 * Générique parce que la grille tient deux couloirs — les sessions mesurées
 * et les blocs planifiés — disposés par deux appels séparés : deux objets de
 * couloirs différents ne doivent jamais se partager une colonne.
 */
export function layoutSpans<T extends Span>(
  items: T[],
  range: PeriodRange,
): Positioned<T>[] {
  const span = range.end - range.start
  if (span <= 0) return []

  const bounded: Bounded<T>[] = []
  for (const item of items) {
    const rawStart = item.startedAt
    const rawEnd = item.startedAt + item.durationMs
    // Un objet appartient à la fenêtre qui contient son début : jamais dessiné ailleurs.
    if (rawStart < range.start || rawStart >= range.end) continue
    bounded.push({
      item,
      start: rawStart,
      end: Math.min(rawEnd, range.end),
      clippedEnd: rawEnd > range.end,
      column: 0,
    })
  }

  // Tri par début, départagé par id pour que deux appels donnent le même ordre.
  bounded.sort((a, b) => a.start - b.start || a.item.id.localeCompare(b.item.id))

  const result: Positioned<T>[] = []
  let group: Bounded<T>[] = []
  /** Fin du dernier objet placé dans chaque colonne du groupe courant. */
  let columnEnds: number[] = []

  function flushGroup() {
    const columnCount = columnEnds.length
    for (const b of group) {
      result.push({
        item: b.item,
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
    let groupEnd = -Infinity
    for (const end of columnEnds) {
      if (end > groupEnd) groupEnd = end
    }
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

/** Enveloppe historique : même disposition, l'objet placé s'appelle `session`. */
export function layoutDaySessions(
  sessions: Session[],
  range: PeriodRange,
): PositionedSession[] {
  return layoutSpans(sessions, range).map(({ item, ...rest }) => ({
    session: item,
    ...rest,
  }))
}
```

Noter le remplacement de `Math.max(...columnEnds)` par une boucle : le spread était relevé comme dette au moment de la revue de C1, et cette réécriture le supprime sans coût.

- [ ] **Step 4: Lancer les tests pour les voir passer**

Run: `rtk npx vitest run --dir src`
Expected: PASS — 27 tests dans `dayLayout.test.ts`, 165 au total.

Run: `rtk npx tsc -b`
Expected: aucune erreur.

- [ ] **Step 5: Commit**

```bash
rtk git add src/features/calendar/dayLayout.ts src/features/calendar/dayLayout.test.ts && rtk git commit -m "refactor: make the day layout generic over any timed span"
```

---

### Task 2 : Arithmétique du glisser

**Files:**
- Create: `src/features/calendar/blockDrag.ts`
- Test: `src/features/calendar/blockDrag.test.ts`

**Interfaces:**
- Consumes: `PeriodRange` de `@/lib/time`
- Produces: `SNAP_STEP_MS: number`, `snapToStep(ms: number, stepMs: number): number`, `dragToStart(args: { originalStart: number; deltaPx: number; pxPerMs: number; range: PeriodRange; stepMs: number }): number`

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `src/features/calendar/blockDrag.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import type { PeriodRange } from '@/lib/time'
import { snapToStep, dragToStart, SNAP_STEP_MS } from './blockDrag'

const HOUR = 3_600_000
const MINUTE = 60_000
const DAY_START = new Date(2026, 2, 10, 4).getTime() // 10 mars 2026, 4h locales
const RANGE: PeriodRange = { start: DAY_START, end: DAY_START + 24 * HOUR }
/** 48 px/heure, la hauteur de la grille. */
const PX_PER_MS = 48 / HOUR

describe('snapToStep', () => {
  it('arrondit au pas le plus proche vers le bas', () => {
    expect(snapToStep(7 * MINUTE, SNAP_STEP_MS)).toBe(0)
  })

  it('arrondit au pas le plus proche vers le haut', () => {
    expect(snapToStep(8 * MINUTE, SNAP_STEP_MS)).toBe(15 * MINUTE)
  })

  it('laisse une valeur déjà sur un pas intacte', () => {
    expect(snapToStep(30 * MINUTE, SNAP_STEP_MS)).toBe(30 * MINUTE)
  })

  it('arrondit aussi les valeurs négatives', () => {
    expect(snapToStep(-8 * MINUTE, SNAP_STEP_MS)).toBe(-15 * MINUTE)
  })
})

describe('dragToStart', () => {
  const base = { pxPerMs: PX_PER_MS, range: RANGE, stepMs: SNAP_STEP_MS }

  it('rend le début inchangé quand rien n’a bougé', () => {
    const originalStart = DAY_START + 6 * HOUR
    expect(dragToStart({ ...base, originalStart, deltaPx: 0 })).toBe(originalStart)
  })

  it('descend d’une demi-heure pour 24 px', () => {
    const originalStart = DAY_START + 6 * HOUR
    const result = dragToStart({ ...base, originalStart, deltaPx: 24 })
    expect(result).toBe(originalStart + 30 * MINUTE)
  })

  it('remonte d’une heure pour -48 px', () => {
    const originalStart = DAY_START + 6 * HOUR
    const result = dragToStart({ ...base, originalStart, deltaPx: -48 })
    expect(result).toBe(originalStart - HOUR)
  })

  it('accroche un déplacement intermédiaire au quart d’heure', () => {
    const originalStart = DAY_START + 6 * HOUR
    // 10 px ≈ 12,5 min : le pas le plus proche est 15 min.
    const result = dragToStart({ ...base, originalStart, deltaPx: 10 })
    expect(result).toBe(originalStart + 15 * MINUTE)
  })

  it('accroche sur la grille de la fenêtre, pas sur l’époque', () => {
    // Un début décalé de 7 min doit retomber sur un quart d'heure compté
    // depuis le début de la fenêtre, quelle que soit l'heure de celui-ci.
    const originalStart = DAY_START + 6 * HOUR + 7 * MINUTE
    const result = dragToStart({ ...base, originalStart, deltaPx: 0 })
    expect((result - RANGE.start) % SNAP_STEP_MS).toBe(0)
  })

  it('borne le début au début de la fenêtre', () => {
    const originalStart = DAY_START + 30 * MINUTE
    const result = dragToStart({ ...base, originalStart, deltaPx: -1000 })
    expect(result).toBe(RANGE.start)
  })

  it('ne borne jamais la fin : un bloc long garde sa durée près du bord', () => {
    // Tiré tout en bas, le début se pose sur le dernier pas de la fenêtre.
    // La durée n'entre pas dans le calcul — le débordement est dessiné
    // comme une troncature, pas corrigé en douce.
    const originalStart = DAY_START + 20 * HOUR
    const result = dragToStart({ ...base, originalStart, deltaPx: 10_000 })
    expect(result).toBe(RANGE.end - SNAP_STEP_MS)
  })

  it('reste dans une fenêtre de 25 heures', () => {
    const longRange: PeriodRange = { start: DAY_START, end: DAY_START + 25 * HOUR }
    const result = dragToStart({
      ...base,
      range: longRange,
      originalStart: DAY_START + 20 * HOUR,
      deltaPx: 10_000,
    })
    expect(result).toBe(longRange.end - SNAP_STEP_MS)
  })

  it('rend le début inchangé si l’échelle est nulle', () => {
    // Une grille de hauteur nulle (mesure faite avant la mise en page) ferait
    // diverger la division : mieux vaut ne pas bouger que sauter à l'infini.
    const originalStart = DAY_START + 6 * HOUR
    expect(dragToStart({ ...base, originalStart, deltaPx: 30, pxPerMs: 0 })).toBe(
      originalStart,
    )
  })
})
```

- [ ] **Step 2: Lancer les tests pour les voir échouer**

Run: `rtk npx vitest run --dir src`
Expected: FAIL — `Failed to resolve import "./blockDrag"`.

- [ ] **Step 3: Écrire l'implémentation**

Créer `src/features/calendar/blockDrag.ts` :

```ts
import type { PeriodRange } from '@/lib/time'

/** Le quart d'heure : le pas d'accrochage de la grille. */
export const SNAP_STEP_MS = 900_000

/** Arrondit au pas le plus proche. */
export function snapToStep(ms: number, stepMs: number): number {
  return Math.round(ms / stepMs) * stepMs
}

/**
 * Nouveau début d'un bloc tiré de `deltaPx` pixels.
 *
 * Deux règles :
 * - l'accrochage se compte depuis le début de la fenêtre, pas depuis l'époque,
 *   pour que les blocs se posent sur les traits dessinés même les jours de 23
 *   ou 25 heures ;
 * - on borne le début, jamais la fin. Un bloc de deux heures tiré près du bord
 *   garde sa durée et ressort tronqué à droite — le raccourcir serait une
 *   écriture que le geste n'a pas demandée.
 */
export function dragToStart(args: {
  originalStart: number
  deltaPx: number
  pxPerMs: number
  range: PeriodRange
  stepMs: number
}): number {
  const { originalStart, deltaPx, pxPerMs, range, stepMs } = args
  if (!Number.isFinite(pxPerMs) || pxPerMs <= 0) return originalStart

  const raw = originalStart + deltaPx / pxPerMs
  const snapped = range.start + snapToStep(raw - range.start, stepMs)

  if (snapped < range.start) return range.start
  const lastStep = range.end - stepMs
  if (snapped > lastStep) return lastStep
  return snapped
}
```

- [ ] **Step 4: Lancer les tests pour les voir passer**

Run: `rtk npx vitest run --dir src`
Expected: PASS — 12 tests dans `blockDrag.test.ts`, 177 au total.

- [ ] **Step 5: Commit**

```bash
rtk git add src/features/calendar/blockDrag.ts src/features/calendar/blockDrag.test.ts && rtk git commit -m "feat: add pure snap-and-clamp arithmetic for dragging blocks"
```

---

### Task 3 : Autoriser le futur dans la validation

**Files:**
- Modify: `src/features/tasks/timeEntry.ts`
- Test: `src/features/tasks/timeEntry.test.ts`

**Interfaces:**
- Produces: `validateEntry(draft: TimeEntryDraft, now: number, options?: { allowFuture?: boolean }): TimeEntryError | null`

Le troisième paramètre est **optionnel** : les appelants existants (`TaskTimeEntries.tsx`) ne changent pas.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à la fin de `src/features/tasks/timeEntry.test.ts` :

```ts
describe('validateEntry — allowFuture', () => {
  const now = new Date(2026, 2, 10, 12).getTime()
  const future: TimeEntryDraft = {
    day: new Date(2026, 2, 11).getTime(),
    startMinutes: 9 * 60,
    durationMinutes: 50,
  }

  it('refuse un début futur par défaut', () => {
    expect(validateEntry(future, now)).toBe('starts-in-future')
  })

  it('accepte un début futur quand allowFuture est vrai', () => {
    expect(validateEntry(future, now, { allowFuture: true })).toBeNull()
  })

  it('refuse toujours une heure vidée, même avec allowFuture', () => {
    // Un champ date ou heure vidé produit NaN : sans cette garde, l'entrée
    // s'écrirait avec un startedAt NaN, invisible de tout lecteur filtré
    // par plage. C'est la corruption silencieuse rattrapée au sous-projet B.
    const broken: TimeEntryDraft = { ...future, startMinutes: NaN }
    expect(validateEntry(broken, now, { allowFuture: true })).toBe('invalid-time')
  })

  it('refuse toujours une durée nulle, même avec allowFuture', () => {
    const broken: TimeEntryDraft = { ...future, durationMinutes: 0 }
    expect(validateEntry(broken, now, { allowFuture: true })).toBe('duration-too-short')
  })
})
```

- [ ] **Step 2: Lancer les tests pour les voir échouer**

Run: `rtk npx vitest run --dir src`
Expected: FAIL — « accepte un début futur quand allowFuture est vrai » renvoie `'starts-in-future'`.

- [ ] **Step 3: Écrire l'implémentation**

Dans `src/features/tasks/timeEntry.ts`, remplacer la signature et la dernière garde de `validateEntry` :

```ts
export interface ValidateEntryOptions {
  /** Un bloc planifié est dans le futur par nature ; une session mesurée, jamais. */
  allowFuture?: boolean
}

export function validateEntry(
  draft: TimeEntryDraft,
  now: number,
  options: ValidateEntryOptions = {},
): TimeEntryError | null {
  if (!Number.isInteger(draft.durationMinutes) || draft.durationMinutes < 1) {
    return 'duration-too-short'
  }
  if (
    !Number.isInteger(draft.day) ||
    !Number.isInteger(draft.startMinutes) ||
    draft.startMinutes < 0 ||
    draft.startMinutes > 1439
  ) {
    return 'invalid-time'
  }
  if (!options.allowFuture && draftToStartedAt(draft) > now) return 'starts-in-future'
  return null
}
```

Mettre à jour le commentaire de doc juste au-dessus pour mentionner l'option, sans réécrire le reste.

- [ ] **Step 4: Lancer les tests pour les voir passer**

Run: `rtk npx vitest run --dir src`
Expected: PASS — 181 tests au total, les 23 tests existants de `timeEntry.test.ts` inchangés.

- [ ] **Step 5: Commit**

```bash
rtk git add src/features/tasks/timeEntry.ts src/features/tasks/timeEntry.test.ts && rtk git commit -m "feat: let validateEntry accept future starts for planned blocks"
```

---

### Task 4 : Entité et accès aux blocs

**Files:**
- Create: `src/features/calendar/types.ts`
- Create: `src/hooks/useDayBlocks.ts`

**Interfaces:**
- Consumes: `periodRange`, `PeriodRange` de `@/lib/time` ; `useTimerSettings` ; `getStore`/`setStore` de `@/lib/localStore` ; `Task` de `@/features/tasks/types`
- Produces:
  ```ts
  interface PlannedBlock { id: string; taskId: string; projectId: string; startedAt: number; durationMs: number; createdAt: number }
  useDayBlocks(uid: string | null, reference: number): {
    blocks: PlannedBlock[]
    loading: boolean
    addBlock: (task: Task, startedAt: number, durationMs: number) => Promise<void>
    moveBlock: (id: string, startedAt: number) => Promise<void>
    updateBlock: (id: string, startedAt: number, durationMs: number) => Promise<void>
    removeBlock: (id: string) => Promise<void>
  }
  ```

Pas de test unitaire : un hook Firestore n'est pas testable sans dépendance interdite. La vérification est le typage, le build, et la revue du hook voisin dont il copie la forme (`src/hooks/useDaySessions.ts`).

- [ ] **Step 1: Créer le type**

Créer `src/features/calendar/types.ts` :

```ts
/**
 * Une intention : faire telle tâche à telle heure.
 *
 * Distinct d'une `Session`, qui atteste d'un temps vécu. Planifier en créant
 * des sessions à l'avance ferait compter le prévu comme du travail fait.
 */
export interface PlannedBlock {
  id: string
  /** Obligatoire : un bloc est toujours l'intention de faire une tâche. */
  taskId: string
  /** Celui de la tâche : le temps d'une tâche est compté dans son projet. */
  projectId: string
  startedAt: number
  durationMs: number
  createdAt: number
}
```

- [ ] **Step 2: Écrire le hook**

Créer `src/hooks/useDayBlocks.ts` :

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
import { periodRange, type PeriodRange } from '@/lib/time'
import { useTimerSettings } from '@/hooks/useTimerSettings'
import type { PlannedBlock } from '@/features/calendar/types'
import type { Task } from '@/features/tasks/types'

const LS_KEY = 'xinghe-blocks'

/** Les blocs planifiés d'une journée, la journée étant celle que définit dayStart. */
export function useDayBlocks(uid: string | null, reference: number) {
  const { settings } = useTimerSettings()
  const dayStart = settings.dayStart

  const range: PeriodRange = useMemo(
    () => periodRange('day', dayStart, reference),
    [dayStart, reference],
  )

  const [blocks, setBlocks] = useState<PlannedBlock[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isFirebaseConfigured) {
      // Lecture ponctuelle, pas un abonnement : même trait de famille que
      // useDaySessions, documenté là-bas.
      const all = getStore<PlannedBlock[]>(LS_KEY, [])
      setBlocks(all.filter((b) => b.startedAt >= range.start && b.startedAt < range.end))
      setLoading(false)
      return
    }

    // Firebase configuré mais uid pas encore connu : rester en chargement
    // plutôt que d'afficher une journée vide qui serait un mensonge.
    if (!uid || !db) {
      setBlocks([])
      setLoading(true)
      return
    }

    setLoading(true)
    let cancelled = false
    const unsubscribe = onSnapshot(
      query(
        collection(db, 'users', uid, 'blocks'),
        where('startedAt', '>=', range.start),
        where('startedAt', '<', range.end),
      ),
      (snap) => {
        if (cancelled) return
        setBlocks(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PlannedBlock))
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

  const addBlock = useCallback(
    async (task: Task, startedAt: number, durationMs: number) => {
      // taskId et projectId ensemble, dès la création : le temps d'une tâche
      // est compté dans le projet de cette tâche.
      const entry: Omit<PlannedBlock, 'id'> = {
        taskId: task.id,
        projectId: task.projectId,
        startedAt,
        durationMs,
        createdAt: Date.now(),
      }
      if (isFirebaseConfigured) {
        // Ne pas retomber en localStorage si Firebase est configuré mais que
        // uid/db ne sont pas prêts : ce serait écrire dans un magasin que ce
        // déploiement ne lit jamais.
        if (!uid || !db) throw new Error('auth not ready')
        await addDoc(collection(db, 'users', uid, 'blocks'), entry)
      } else {
        const all = getStore<PlannedBlock[]>(LS_KEY, [])
        const created: PlannedBlock = { ...entry, id: crypto.randomUUID() }
        setStore(LS_KEY, [...all, created])
        setBlocks((prev) => [...prev, created])
      }
    },
    [uid],
  )

  const writeLocal = useCallback(
    (id: string, updates: Partial<PlannedBlock>) => {
      const all = getStore<PlannedBlock[]>(LS_KEY, [])
      setStore(LS_KEY, all.map((b) => (b.id === id ? { ...b, ...updates } : b)))
      setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...updates } : b)))
    },
    [],
  )

  const moveBlock = useCallback(
    async (id: string, startedAt: number) => {
      if (isFirebaseConfigured) {
        if (!uid || !db) throw new Error('auth not ready')
        await updateDoc(doc(db, 'users', uid, 'blocks', id), { startedAt })
      } else {
        writeLocal(id, { startedAt })
      }
    },
    [uid, writeLocal],
  )

  const updateBlock = useCallback(
    async (id: string, startedAt: number, durationMs: number) => {
      if (isFirebaseConfigured) {
        if (!uid || !db) throw new Error('auth not ready')
        await updateDoc(doc(db, 'users', uid, 'blocks', id), { startedAt, durationMs })
      } else {
        writeLocal(id, { startedAt, durationMs })
      }
    },
    [uid, writeLocal],
  )

  const removeBlock = useCallback(
    async (id: string) => {
      if (isFirebaseConfigured) {
        if (!uid || !db) throw new Error('auth not ready')
        await deleteDoc(doc(db, 'users', uid, 'blocks', id))
      } else {
        const all = getStore<PlannedBlock[]>(LS_KEY, [])
        setStore(LS_KEY, all.filter((b) => b.id !== id))
        setBlocks((prev) => prev.filter((b) => b.id !== id))
      }
    },
    [uid],
  )

  return { blocks, loading, addBlock, moveBlock, updateBlock, removeBlock }
}
```

- [ ] **Step 3: Vérifier le typage et la suite**

Run: `rtk npx tsc -b`
Expected: aucune erreur.

Run: `rtk npx vitest run --dir src`
Expected: PASS — 181 tests, inchangés.

- [ ] **Step 4: Commit**

```bash
rtk git add src/features/calendar/types.ts src/hooks/useDayBlocks.ts && rtk git commit -m "feat: add the planned-block entity and its day-scoped hook"
```

---

### Task 5 : Le projet d'un bloc suit celui de sa tâche

**Files:**
- Create: `src/features/calendar/blockCascades.ts`
- Create: `src/features/calendar/blockCascades.test.ts`
- Modify: `src/hooks/useTasks.ts` (fonctions `updateTask` et `deleteTask`)
- Modify: `src/hooks/useProjects.ts` (fonction `deleteProject`)

**Interfaces:**
- Consumes: `PlannedBlock` de `@/features/calendar/types`
- Produces: `removeBlocksOfTask(blocks: PlannedBlock[], taskId: string): PlannedBlock[]`, `reassignBlocksOfTask(blocks: PlannedBlock[], taskId: string, newProjectId: string): PlannedBlock[]`, `reassignBlocksOfProject(blocks: PlannedBlock[], projectId: string, newProjectId: string): PlannedBlock[]`

Trois chemins, un seul invariant : **le temps d'une tâche est compté dans le projet de cette tâche.** Les sessions le respectent déjà sur les trois ; les blocs, qui portent aussi un `projectId`, doivent le respecter partout ou nulle part.

- `updateTask` déplace une tâche vers un autre projet → ses blocs suivent.
- `deleteTask` supprime la tâche → ses blocs partent avec elle. Une intention orpheline n'est ni corrigeable ni utile, contrairement à une session orpheline qui atteste d'un temps vécu et que C1 sait rattacher.
- `deleteProject` renvoie tout vers l'inbox → les blocs aussi, sans quoi leur `projectId` pointerait sur un projet mort.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `src/features/calendar/blockCascades.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import type { PlannedBlock } from './types'
import { removeBlocksOfTask, reassignBlocksOfTask, reassignBlocksOfProject } from './blockCascades'

function block(id: string, taskId: string, projectId: string): PlannedBlock {
  return { id, taskId, projectId, startedAt: 0, durationMs: 3_600_000, createdAt: 0 }
}

describe('removeBlocksOfTask', () => {
  it('retire les blocs de la tâche supprimée', () => {
    const blocks = [block('a', 't1', 'p1'), block('b', 't2', 'p1'), block('c', 't1', 'p1')]
    expect(removeBlocksOfTask(blocks, 't1').map((b) => b.id)).toEqual(['b'])
  })

  it('rend une liste intacte quand aucun bloc ne correspond', () => {
    const blocks = [block('a', 't2', 'p1')]
    expect(removeBlocksOfTask(blocks, 't1')).toEqual(blocks)
  })
})

describe('reassignBlocksOfTask', () => {
  it('fait suivre les blocs quand la tâche change de projet', () => {
    const blocks = [block('a', 't1', 'p1'), block('b', 't2', 'p1')]
    const next = reassignBlocksOfTask(blocks, 't1', 'p2')
    expect(next.map((b) => b.projectId)).toEqual(['p2', 'p1'])
  })

  it('ne touche pas aux blocs des autres tâches', () => {
    const blocks = [block('a', 't2', 'p1')]
    expect(reassignBlocksOfTask(blocks, 't1', 'p2')).toEqual(blocks)
  })
})

describe('reassignBlocksOfProject', () => {
  it('déplace les blocs du projet supprimé vers le projet cible', () => {
    const blocks = [block('a', 't1', 'p1'), block('b', 't2', 'p2')]
    const next = reassignBlocksOfProject(blocks, 'p1', 'inbox')
    expect(next.map((b) => b.projectId)).toEqual(['inbox', 'p2'])
  })

  it('ne touche pas aux blocs des autres projets', () => {
    const blocks = [block('a', 't1', 'p2')]
    expect(reassignBlocksOfProject(blocks, 'p1', 'inbox')).toEqual(blocks)
  })
})
```

- [ ] **Step 2: Lancer les tests pour les voir échouer**

Run: `rtk npx vitest run --dir src`
Expected: FAIL — `Failed to resolve import "./blockCascades"`.

- [ ] **Step 3: Écrire les fonctions pures**

Créer `src/features/calendar/blockCascades.ts` :

```ts
import type { PlannedBlock } from './types'

/**
 * Une tâche supprimée emporte ses blocs : « faire quelque chose de 9h à 11h »
 * sans savoir quoi n'est ni corrigeable ni utile.
 */
export function removeBlocksOfTask(blocks: PlannedBlock[], taskId: string): PlannedBlock[] {
  return blocks.filter((b) => b.taskId !== taskId)
}

/**
 * Une tâche qui change de projet emmène ses blocs : sinon le prévu resterait
 * compté dans les objectifs de son ancien projet, alors que le réel a suivi.
 */
export function reassignBlocksOfTask(
  blocks: PlannedBlock[],
  taskId: string,
  newProjectId: string,
): PlannedBlock[] {
  return blocks.map((b) => (b.taskId === taskId ? { ...b, projectId: newProjectId } : b))
}

/**
 * Un projet supprimé emmène ses blocs vers l'inbox, comme ses tâches et ses
 * sessions : sinon leur projectId pointerait sur un projet mort et le bloc
 * perdrait sa couleur.
 */
export function reassignBlocksOfProject(
  blocks: PlannedBlock[],
  projectId: string,
  newProjectId: string,
): PlannedBlock[] {
  return blocks.map((b) => (b.projectId === projectId ? { ...b, projectId: newProjectId } : b))
}
```

- [ ] **Step 4: Lancer les tests pour les voir passer**

Run: `rtk npx vitest run --dir src`
Expected: PASS — 6 tests dans `blockCascades.test.ts`, 187 au total.

- [ ] **Step 5: Faire suivre les blocs dans `updateTask`**

Dans `src/hooks/useTasks.ts`, `updateTask` réassigne déjà les sessions quand `movesProject` est vrai, **avant** d'écrire la tâche. Les blocs rejoignent ce traitement, au même endroit et dans le même ordre.

Branche Firestore — remplacer le bloc `if (movesProject) { … }` par :

```ts
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
```

Branche localStorage — remplacer le `if (movesProject) { … }` correspondant par :

```ts
        if (movesProject) {
          const sessions = getStore<Session[]>('xinghe-sessions', [])
          setStore('xinghe-sessions', reassignSessions(sessions, id, updates.projectId!))
          const blocks = getStore<PlannedBlock[]>('xinghe-blocks', [])
          setStore('xinghe-blocks', reassignBlocksOfTask(blocks, id, updates.projectId!))
        }
```

Ne pas toucher au commentaire qui explique l'ordre d'écriture : il reste vrai, et vaut désormais aussi pour les blocs.

- [ ] **Step 6: Brancher la cascade dans `deleteTask`**

Dans `src/hooks/useTasks.ts`, remplacer la fonction `deleteTask` (autour de la ligne 187) par :

```ts
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
```

Compléter les imports en tête de `src/hooks/useTasks.ts` — n'ajouter que ce qui manque :

```ts
import { getStore, setStore } from '@/lib/localStore'
import { removeBlocksOfTask, reassignBlocksOfTask } from '@/features/calendar/blockCascades'
import type { PlannedBlock } from '@/features/calendar/types'
```

`getDocs`, `query`, `where`, `writeBatch` et `collection` viennent de `firebase/firestore` : vérifier lesquels sont déjà importés avant d'en ajouter.

- [ ] **Step 7: Brancher la cascade dans `deleteProject`**

Dans `src/hooks/useProjects.ts`, dans `deleteProject`, ajouter les blocs aux deux branches.

Branche Firestore — remplacer la lecture et le batch existants par :

```ts
        const [tasksSnap, sessionsSnap, blocksSnap] = await Promise.all([
          getDocs(query(collection(db, `users/${uid}/tasks`), where('projectId', '==', id))),
          getDocs(query(collection(db, `users/${uid}/sessions`), where('projectId', '==', id))),
          getDocs(query(collection(db, `users/${uid}/blocks`), where('projectId', '==', id))),
        ])
        const batch = writeBatch(db)
        sessionsSnap.docs.forEach((d) => batch.update(d.ref, { projectId: inbox.id }))
        blocksSnap.docs.forEach((d) => batch.update(d.ref, { projectId: inbox.id }))
        tasksSnap.docs.forEach((d) => batch.update(d.ref, { projectId: inbox.id }))
        batch.delete(docRef(uid, id))
        await batch.commit()
```

Branche localStorage — juste après l'écriture de `xinghe-sessions` (`setStore('xinghe-sessions', nextSessions)`), insérer :

```ts
        // Même ordre que les sessions : réaffecter avant de déplacer les
        // tâches, pour qu'une interruption laisse un état que la reprise
        // corrige au lieu de blocs sur un projet mort.
        const blocks = getStore<PlannedBlock[]>('xinghe-blocks', [])
        setStore('xinghe-blocks', reassignBlocksOfProject(blocks, id, inbox.id))
```

Compléter les imports de `src/hooks/useProjects.ts` :

```ts
import { reassignBlocksOfProject } from '@/features/calendar/blockCascades'
import type { PlannedBlock } from '@/features/calendar/types'
```

- [ ] **Step 8: Vérifier**

Run: `rtk npx tsc -b`
Expected: aucune erreur.

Run: `rtk npx vitest run --dir src`
Expected: PASS — 187 tests.

- [ ] **Step 9: Commit**

```bash
rtk git add src/features/calendar/blockCascades.ts src/features/calendar/blockCascades.test.ts src/hooks/useTasks.ts src/hooks/useProjects.ts && rtk git commit -m "feat: keep a planned block's project in step with its task"
```

---

### Task 6 : Deux couloirs dans la grille

**Files:**
- Modify: `src/features/calendar/DayGrid.tsx`
- Modify: `src/features/calendar/DayGrid.css`
- Modify: `src/i18n/fr.json`, `src/i18n/en.json`

**Interfaces:**
- Consumes: `layoutSpans` (Task 1), `useDayBlocks` (Task 4), `PlannedBlock` (Task 4)
- Produces: le canvas rend deux couloirs. Les blocs planifiés sont affichés, pas encore interactifs.

Cette tâche est du rendu : aucun test automatisé possible. Vérification = typage, build, et relecture.

- [ ] **Step 1: Ajouter les clés i18n**

Dans `src/i18n/fr.json`, sous l'objet `calendar` :

```json
    "planned": "prévu",
    "actual": "réel",
```

Dans `src/i18n/en.json`, au même endroit :

```json
    "planned": "planned",
    "actual": "actual",
```

- [ ] **Step 2: Consommer les blocs dans le composant**

Dans `src/features/calendar/DayGrid.tsx`, ajouter aux imports :

```ts
import { useDayBlocks } from '@/hooks/useDayBlocks'
import { layoutSpans } from './dayLayout'
```

et compléter l'import existant de `dayLayout` s'il ne fait que `layoutDaySessions` — les deux fonctions viennent du même module, une seule ligne d'import.

Juste après la ligne qui appelle `useDaySessions`, ajouter :

```ts
  const { blocks: plannedBlocks, loading: blocksLoading } = useDayBlocks(uid, reference)
```

Et à côté du `useMemo` qui calcule `blocks`, ajouter :

```ts
  // Deux appels séparés, jamais un seul : un bloc planifié et une session ne
  // doivent pas se partager une colonne, ils vivent dans deux couloirs.
  const plannedPositions = useMemo(
    () => layoutSpans(plannedBlocks, range),
    [plannedBlocks, range],
  )
```

Renommer la variable existante `blocks` en `sessionPositions` dans tout le fichier, pour que `blocks` ne désigne plus deux choses. Le rendu existant devient `sessionPositions.map(...)`, et la garde de journée vide devient :

```ts
          ) : sessionPositions.length === 0 && plannedPositions.length === 0 ? (
```

Ajouter `blocksLoading` à la garde de chargement :

```ts
          {sessionsLoading || tasksLoading || blocksLoading ? (
```

- [ ] **Step 3: Rendre les deux couloirs**

Dans `src/features/calendar/DayGrid.tsx`, entourer les blocs de session d'un couloir droit, et ajouter le couloir gauche. Le canvas devient :

```tsx
        <div className="daygrid__canvas">
          {hours.map((ts) => (
            <div key={ts} className="daygrid__line" />
          ))}

          {showNowLine && (
            <div className="daygrid__now" style={{ top: `${nowTop}%` }} />
          )}

          <div className="daygrid__lanelabels">
            <span>{t('calendar.planned')}</span>
            <span>{t('calendar.actual')}</span>
          </div>

          <div className="daygrid__lane daygrid__lane--planned">
            {plannedPositions.map((positioned) => {
              const block = positioned.item
              const task = tasksById.get(block.taskId)
              const color = projectColors[block.projectId] ?? 'var(--xh-text-faint)'
              const width = 100 / positioned.columnCount
              return (
                <div
                  key={block.id}
                  className={`daygrid__planned ${
                    positioned.clippedEnd ? 'daygrid__block--clipend' : ''
                  } ${task?.completed ? 'daygrid__planned--done' : ''}`}
                  style={{
                    top: `${positioned.top * 100}%`,
                    height: `${positioned.height * 100}%`,
                    left: `${positioned.column * width}%`,
                    width: `${width}%`,
                    borderColor: color,
                    color,
                  }}
                >
                  <span className="daygrid__blocktitle">
                    {task ? task.title : t('calendar.noTask')}
                  </span>
                </div>
              )
            })}
          </div>

          <div className="daygrid__lane daygrid__lane--actual">
            {/* le rendu existant des sessions, inchangé, déplacé ici tel quel */}
          </div>
        </div>
```

Déplacer le bloc de rendu des sessions (le `sessionPositions.map(...)` avec ses `<button>`) à l'intérieur de `daygrid__lane--actual`, sans en modifier le contenu. Les squelettes de chargement et le message de journée vide restent enfants directs du canvas.

- [ ] **Step 4: Styler les couloirs**

Ajouter à `src/features/calendar/DayGrid.css` :

```css
/* Deux couloirs disjoints : un bloc planifié ne peut jamais recouvrir une
   session, donc la cible d'un geste est toujours certaine. */
.daygrid__lane {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 50%;
}

.daygrid__lane--planned {
  left: 0;
  padding-right: 3px;
}

.daygrid__lane--actual {
  left: 50%;
  padding-left: 3px;
}

.daygrid__lanelabels {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  font-size: 0.62rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.4;
  pointer-events: none;
}

.daygrid__lanelabels span {
  flex: 1;
  padding-left: 4px;
}

/* Contour pointillé, fond transparent : une intention n'est pas un fait. */
.daygrid__planned {
  position: absolute;
  min-height: 14px;
  padding: 2px 6px;
  border: 1px dashed;
  border-radius: 4px;
  background: transparent;
  font-size: 0.7rem;
  text-align: left;
  overflow: hidden;
  display: flex;
  align-items: flex-start;
  gap: 4px;
}

.daygrid__planned--done {
  opacity: 0.45;
}
```

Les blocs de session étant désormais dans un couloir de demi-largeur, leur `left`/`width` en pourcentage se rapporte à ce couloir : aucun changement à faire dans leur style en ligne.

- [ ] **Step 5: Vérifier**

Run: `rtk npx tsc -b`
Expected: aucune erreur.

Run: `rtk npx vitest run --dir src && rtk npm run build`
Expected: 187 tests PASS, build réussi.

- [ ] **Step 6: Commit**

```bash
rtk git add src/features/calendar/DayGrid.tsx src/features/calendar/DayGrid.css src/i18n/fr.json src/i18n/en.json && rtk git commit -m "feat: split the day canvas into planned and actual lanes"
```

---

### Task 7 : Créer, modifier et supprimer un bloc

**Files:**
- Create: `src/features/calendar/BlockPanel.tsx`
- Create: `src/features/calendar/BlockPanel.css`
- Modify: `src/features/calendar/DayGrid.tsx`
- Modify: `src/i18n/fr.json`, `src/i18n/en.json`

**Interfaces:**
- Consumes: `validateEntry`, `draftToStartedAt`, `TimeEntryDraft` de `@/features/tasks/timeEntry` (Task 3) ; `SNAP_STEP_MS`, `snapToStep` de `./blockDrag` (Task 2) ; `addBlock`/`updateBlock`/`removeBlock` de `useDayBlocks` (Task 4) ; `TaskPicker` de `@/features/timer/TaskPicker`
- Produces:
  ```tsx
  interface BlockPanelProps {
    mode: { kind: 'create'; startedAt: number } | { kind: 'edit'; block: PlannedBlock }
    tasks: Task[]
    projectColors: Record<string, string>
    defaultDurationMinutes: number
    onCreate: (task: Task, startedAt: number, durationMs: number) => Promise<void>
    onUpdate: (id: string, startedAt: number, durationMs: number) => Promise<void>
    onRemove: (id: string) => Promise<void>
    onStartTimer: (taskId: string) => void
    onClose: () => void
  }
  ```

- [ ] **Step 1: Ajouter les clés i18n**

Dans `src/i18n/fr.json`, sous `calendar` :

```json
    "newBlock": "Planifier un créneau",
    "editBlock": "Créneau planifié",
    "blockStart": "Début",
    "blockDuration": "Durée (min)",
    "startTimer": "Démarrer",
    "deleteBlock": "Supprimer",
    "confirmDelete": "Confirmer ?",
    "blockFailed": "Échec de l'enregistrement.",
    "close": "Fermer",
```

Dans `src/i18n/en.json` :

```json
    "newBlock": "Plan a slot",
    "editBlock": "Planned slot",
    "blockStart": "Start",
    "blockDuration": "Duration (min)",
    "startTimer": "Start",
    "deleteBlock": "Delete",
    "confirmDelete": "Confirm?",
    "blockFailed": "Could not save.",
    "close": "Close",
```

- [ ] **Step 2: Écrire le panneau**

Créer `src/features/calendar/BlockPanel.tsx` :

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TaskPicker } from '@/features/timer/TaskPicker'
import { validateEntry, draftToStartedAt, type TimeEntryDraft } from '@/features/tasks/timeEntry'
import type { Task } from '@/features/tasks/types'
import type { PlannedBlock } from './types'
import './BlockPanel.css'

export type BlockPanelMode =
  | { kind: 'create'; startedAt: number }
  | { kind: 'edit'; block: PlannedBlock }

interface BlockPanelProps {
  mode: BlockPanelMode
  tasks: Task[]
  projectColors: Record<string, string>
  defaultDurationMinutes: number
  onCreate: (task: Task, startedAt: number, durationMs: number) => Promise<void>
  onUpdate: (id: string, startedAt: number, durationMs: number) => Promise<void>
  onRemove: (id: string) => Promise<void>
  onStartTimer: (taskId: string) => void
  onClose: () => void
}

/** Décompose un timestamp en jour local + minutes, la forme que valide timeEntry. */
function toDraft(startedAt: number, durationMinutes: number): TimeEntryDraft {
  const start = new Date(startedAt)
  const day = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime()
  return {
    day,
    startMinutes: Math.round((startedAt - day) / 60_000),
    durationMinutes,
  }
}

function toTimeInput(draft: TimeEntryDraft): string {
  if (!Number.isInteger(draft.startMinutes)) return ''
  const h = String(Math.floor(draft.startMinutes / 60)).padStart(2, '0')
  const m = String(draft.startMinutes % 60).padStart(2, '0')
  return `${h}:${m}`
}

function fromTimeInput(value: string): number {
  // Un champ vidé donne '' : NaN plutôt que 0, pour que validateEntry le
  // refuse au lieu d'écrire un créneau à minuit que personne n'a demandé.
  const [h, m] = value.split(':')
  const hours = Number(h)
  const minutes = Number(m)
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return NaN
  return hours * 60 + minutes
}

export function BlockPanel({
  mode,
  tasks,
  projectColors,
  defaultDurationMinutes,
  onCreate,
  onUpdate,
  onRemove,
  onStartTimer,
  onClose,
}: BlockPanelProps) {
  const { t } = useTranslation()

  const [draft, setDraft] = useState<TimeEntryDraft>(() =>
    mode.kind === 'create'
      ? toDraft(mode.startedAt, defaultDurationMinutes)
      : toDraft(mode.block.startedAt, Math.round(mode.block.durationMs / 60_000)),
  )
  const [failed, setFailed] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // allowFuture : un bloc planifié est dans le futur par nature. Les autres
  // gardes tiennent, dont celle contre un champ vidé qui produirait NaN.
  const error = validateEntry(draft, Date.now(), { allowFuture: true })

  const editedTask =
    mode.kind === 'edit' ? tasks.find((task) => task.id === mode.block.taskId) : undefined

  async function handlePick(taskId: string | null) {
    const task = taskId ? tasks.find((candidate) => candidate.id === taskId) : null
    if (!task || error) return
    setFailed(false)
    try {
      await onCreate(task, draftToStartedAt(draft), draft.durationMinutes * 60_000)
      onClose()
    } catch {
      setFailed(true)
    }
  }

  async function handleSave() {
    if (mode.kind !== 'edit' || error) return
    setFailed(false)
    try {
      await onUpdate(mode.block.id, draftToStartedAt(draft), draft.durationMinutes * 60_000)
      onClose()
    } catch {
      setFailed(true)
    }
  }

  async function handleRemove() {
    if (mode.kind !== 'edit') return
    setFailed(false)
    try {
      await onRemove(mode.block.id)
      onClose()
    } catch {
      setFailed(true)
      setConfirmingDelete(false)
    }
  }

  return (
    <div className="blockpanel">
      <div className="blockpanel__head">
        <span className="blockpanel__title">
          {mode.kind === 'create' ? t('calendar.newBlock') : t('calendar.editBlock')}
        </span>
        <button
          type="button"
          className="blockpanel__close"
          aria-label={t('calendar.close')}
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      {mode.kind === 'edit' && (
        <p className="blockpanel__task">{editedTask?.title ?? t('calendar.noTask')}</p>
      )}

      <div className="blockpanel__fields">
        <label className="blockpanel__field">
          <span>{t('calendar.blockStart')}</span>
          <input
            type="time"
            value={toTimeInput(draft)}
            onChange={(e) => setDraft({ ...draft, startMinutes: fromTimeInput(e.target.value) })}
          />
        </label>
        <label className="blockpanel__field">
          <span>{t('calendar.blockDuration')}</span>
          <input
            type="number"
            min={1}
            value={Number.isInteger(draft.durationMinutes) ? draft.durationMinutes : ''}
            onChange={(e) =>
              setDraft({
                ...draft,
                durationMinutes: e.target.value === '' ? NaN : Number(e.target.value),
              })
            }
          />
        </label>
      </div>

      {failed && <p className="blockpanel__error">{t('calendar.blockFailed')}</p>}

      {mode.kind === 'create' ? (
        <TaskPicker
          tasks={tasks.filter((task) => !task.completed)}
          projectColors={projectColors}
          selectedId={null}
          onSelect={handlePick}
        />
      ) : (
        <div className="blockpanel__actions">
          <button type="button" disabled={error !== null} onClick={handleSave}>
            {t('common.save')}
          </button>
          <button type="button" onClick={() => onStartTimer(mode.block.taskId)}>
            {t('calendar.startTimer')}
          </button>
          {confirmingDelete ? (
            <button type="button" className="blockpanel__danger" onClick={handleRemove}>
              {t('calendar.confirmDelete')}
            </button>
          ) : (
            <button
              type="button"
              className="blockpanel__danger"
              onClick={() => setConfirmingDelete(true)}
            >
              {t('calendar.deleteBlock')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
```

Vérifier que la clé `common.save` existe dans `src/i18n/fr.json` et `src/i18n/en.json` ; si elle n'existe pas sous ce nom, utiliser la clé de sauvegarde déjà employée par `TaskModal.tsx` plutôt que d'en créer une.

- [ ] **Step 3: Styler le panneau**

Créer `src/features/calendar/BlockPanel.css` :

```css
.blockpanel {
  border: 1px solid var(--xh-card-border);
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.blockpanel__head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.blockpanel__title {
  font-size: 0.78rem;
  opacity: 0.7;
}

.blockpanel__close {
  margin-left: auto;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 0.9rem;
}

.blockpanel__task {
  margin: 0;
  font-size: 0.9rem;
}

.blockpanel__fields {
  display: flex;
  gap: 10px;
}

.blockpanel__field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 0.7rem;
  opacity: 0.8;
}

.blockpanel__field input {
  background: transparent;
  border: 1px solid var(--xh-card-border);
  border-radius: 6px;
  color: inherit;
  padding: 4px 6px;
  font-size: 0.8rem;
}

.blockpanel__actions {
  display: flex;
  gap: 8px;
}

.blockpanel__actions button {
  padding: 4px 10px;
  border: 1px solid var(--xh-card-border);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font-size: 0.78rem;
  cursor: pointer;
}

.blockpanel__actions button:disabled {
  opacity: 0.4;
  cursor: default;
}

.blockpanel__danger {
  margin-left: auto;
  color: var(--xh-focus);
}

.blockpanel__error {
  margin: 0;
  font-size: 0.75rem;
  color: var(--xh-focus);
}
```

- [ ] **Step 4: Brancher le panneau dans la grille**

Dans `src/features/calendar/DayGrid.tsx` :

Ajouter aux imports :

```ts
import { useRef } from 'react'
import { BlockPanel, type BlockPanelMode } from './BlockPanel'
import { snapToStep, SNAP_STEP_MS } from './blockDrag'
```

(`useRef` s'ajoute à l'import `react` existant.)

Compléter la déstructuration du hook :

```ts
  const {
    blocks: plannedBlocks,
    loading: blocksLoading,
    addBlock,
    updateBlock,
    removeBlock,
  } = useDayBlocks(uid, reference)
```

Ajouter l'état, la référence au couloir et le prop de navigation :

```ts
  const [panel, setPanel] = useState<BlockPanelMode | null>(null)
  const plannedLaneRef = useRef<HTMLDivElement | null>(null)
```

Ajouter `onStartTimer: (taskId: string) => void` à `DayGridProps`, et le déstructurer dans la signature du composant.

Ouvrir le panneau en création au clic sur le couloir vide — sur le `<div className="daygrid__lane daygrid__lane--planned">`, ajouter `ref={plannedLaneRef}` et :

```tsx
            onClick={(e) => {
              // Un clic sur un bloc existant ne doit pas aussi créer : les
              // blocs arrêtent la propagation eux-mêmes (Task 8).
              const lane = plannedLaneRef.current
              if (!lane) return
              const rect = lane.getBoundingClientRect()
              if (rect.height <= 0) return
              const fraction = (e.clientY - rect.top) / rect.height
              const raw = range.start + fraction * (range.end - range.start)
              const startedAt = range.start + snapToStep(raw - range.start, SNAP_STEP_MS)
              setPanel({ kind: 'create', startedAt })
            }}
```

Étendre `navigate()` pour fermer le panneau, à côté des deux lignes existantes :

```ts
    setPanel(null)
```

Rendre le panneau, juste avant le panneau de rattachement existant :

```tsx
      {panel && (
        <BlockPanel
          mode={panel}
          tasks={tasks}
          projectColors={projectColors}
          defaultDurationMinutes={settings.focusMinutes}
          onCreate={addBlock}
          onUpdate={updateBlock}
          onRemove={removeBlock}
          onStartTimer={onStartTimer}
          onClose={() => setPanel(null)}
        />
      )}
```

`settings` vient de `useTimerSettings()` — ajouter l'import `import { useTimerSettings } from '@/hooks/useTimerSettings'` et l'appel `const { settings } = useTimerSettings()` s'ils ne sont pas déjà là.

Rendre les blocs planifiés cliquables : dans le rendu du couloir planifié (Task 6), remplacer le `<div>` du bloc par un `<button type="button">` portant les mêmes classes et styles, avec :

```tsx
                  onClick={(e) => {
                    e.stopPropagation()
                    setPanel({ kind: 'edit', block })
                  }}
```

- [ ] **Step 5: Fournir le prop dans les deux appelants**

Dans `src/features/calendar/DayScreen.tsx`, ajouter à `DayScreen` un prop `onStartTimer: (taskId: string) => void` et le passer à `<DayGrid onStartTimer={onStartTimer} … />`.

Dans `src/features/tasks/TasksScreen.tsx`, là où la vue `'day'` rend la grille, faire de même : le composant reçoit `onStartTimer` et le transmet.

Dans `src/App.tsx`, passer une fonction provisoire aux deux écrans le temps de la Task 9 :

```tsx
{tab === 'tasks' && <TasksScreen onStartTimer={() => {}} />}
{tab === 'day' && <DayScreen onStartTimer={() => {}} />}
```

Task 9 remplace ces deux fonctions vides par le vrai branchement. Ne pas laisser de `TODO` : le commentaire suivant suffit, au-dessus de `AppShell`.

```tsx
  // onStartTimer est câblé à la Task 9 (timerTaskStore) ; d'ici là, les blocs
  // affichent le bouton sans effet plutôt que de ne pas l'afficher du tout.
```

- [ ] **Step 6: Vérifier**

Run: `rtk npx tsc -b`
Expected: aucune erreur.

Run: `rtk npx vitest run --dir src && rtk npm run build`
Expected: 187 tests PASS, build réussi.

- [ ] **Step 7: Commit**

```bash
rtk git add src/features/calendar/BlockPanel.tsx src/features/calendar/BlockPanel.css src/features/calendar/DayGrid.tsx src/features/calendar/DayScreen.tsx src/features/tasks/TasksScreen.tsx src/App.tsx src/i18n/fr.json src/i18n/en.json && rtk git commit -m "feat: create, edit and delete planned blocks from the day grid"
```

---

### Task 8 : Déplacer un bloc au glisser

**Files:**
- Modify: `src/features/calendar/DayGrid.tsx`
- Modify: `src/features/calendar/DayGrid.css`

**Interfaces:**
- Consumes: `dragToStart`, `SNAP_STEP_MS` de `./blockDrag` (Task 2) ; `moveBlock` de `useDayBlocks` (Task 4)
- Produces: aucun export nouveau.

Aucune écriture pendant le mouvement. Une seule, au relâchement, et uniquement si la position a changé.

- [ ] **Step 1: Ajouter l'état du glisser**

Dans `src/features/calendar/DayGrid.tsx`, ajouter `moveBlock` à la déstructuration de `useDayBlocks`, ajouter `dragToStart` à l'import de `./blockDrag`, et déclarer :

```ts
  /** Bloc en cours de glisser : `start` est la position fantôme, jamais écrite. */
  const [dragging, setDragging] = useState<{
    id: string
    originalStart: number
    pointerY: number
    start: number
    moved: boolean
  } | null>(null)
```

- [ ] **Step 2: Écrire les gestionnaires de pointeur**

Ajouter dans le composant, à côté de `navigate` :

```ts
  /** Pixels par milliseconde, mesuré sur le couloir réel : les jours de 23 ou
      25 heures n'ont pas la même échelle qu'un jour ordinaire. */
  function lanePxPerMs(): number {
    const rect = plannedLaneRef.current?.getBoundingClientRect()
    if (!rect || rect.height <= 0) return 0
    return rect.height / (range.end - range.start)
  }

  function handleBlockPointerDown(e: React.PointerEvent, block: PlannedBlock) {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging({
      id: block.id,
      originalStart: block.startedAt,
      pointerY: e.clientY,
      start: block.startedAt,
      moved: false,
    })
  }

  function handleBlockPointerMove(e: React.PointerEvent) {
    setDragging((prev) => {
      if (!prev) return prev
      const deltaPx = e.clientY - prev.pointerY
      // Sous le seuil, le geste reste un appui : c'est ce qui laisse le tap
      // ouvrir le panneau.
      if (!prev.moved && Math.abs(deltaPx) < DRAG_THRESHOLD_PX) return prev
      const start = dragToStart({
        originalStart: prev.originalStart,
        deltaPx,
        pxPerMs: lanePxPerMs(),
        range,
        stepMs: SNAP_STEP_MS,
      })
      return { ...prev, start, moved: true }
    })
  }

  async function handleBlockPointerUp(e: React.PointerEvent, block: PlannedBlock) {
    e.stopPropagation()
    const current = dragging
    setDragging(null)
    // Pas de glisser, ou retour au point de départ : c'est un appui, le clic
    // suivant ouvrira le panneau.
    if (!current || !current.moved || current.start === current.originalStart) return
    try {
      await moveBlock(block.id, current.start)
    } catch {
      setBlockFailed(true)
    }
  }

  function handleBlockPointerCancel() {
    // Annulation système ou Échap : retour à la position d'origine, sans écriture.
    setDragging(null)
  }
```

Ajouter la constante en tête de fichier, à côté de `const HOUR = 3_600_000` :

```ts
/** En deçà, le geste reste un appui et le panneau s'ouvre. */
const DRAG_THRESHOLD_PX = 4
```

Ajouter l'état d'erreur, à côté de `attachFailed` :

```ts
  const [blockFailed, setBlockFailed] = useState(false)
```

et l'afficher à côté du message existant :

```tsx
      {blockFailed && <p className="daygrid__error">{t('calendar.blockFailed')}</p>}
```

`navigate()` le remet à `false`, comme les deux autres états.

Ajouter l'échappement clavier, à côté des autres `useEffect` :

```ts
  // Échap annule un glisser en cours. Monté seulement pendant le geste :
  // aucun écouteur global ne traîne quand la grille est au repos.
  useEffect(() => {
    if (!dragging) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setDragging(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dragging])
```

Importer le type `PlannedBlock` : `import type { PlannedBlock } from './types'`.

- [ ] **Step 3: Brancher sur le bloc rendu**

Dans le rendu du couloir planifié, sur le `<button>` du bloc :

```tsx
                  onPointerDown={(e) => handleBlockPointerDown(e, block)}
                  onPointerMove={handleBlockPointerMove}
                  onPointerUp={(e) => handleBlockPointerUp(e, block)}
                  onPointerCancel={handleBlockPointerCancel}
                  onClick={(e) => {
                    e.stopPropagation()
                    // Un glisser vient de se terminer : ne pas ouvrir le panneau
                    // par-dessus le déplacement que l'utilisateur voulait.
                    if (draggedRef.current) {
                      draggedRef.current = false
                      return
                    }
                    setPanel({ kind: 'edit', block })
                  }}
```

et calculer la position affichée à partir de la position fantôme quand ce bloc est celui qu'on tire. Avant le `return` du `.map`, insérer :

```tsx
              const ghost = dragging?.id === block.id && dragging.moved ? dragging.start : null
              const shownTop =
                ghost === null
                  ? positioned.top
                  : (ghost - range.start) / (range.end - range.start)
```

et utiliser `shownTop` dans le style au lieu de `positioned.top`.

Déclarer la référence qui retient qu'un glisser vient d'aboutir, à côté de `plannedLaneRef` :

```ts
  /** Vrai entre la fin d'un glisser et le clic que le navigateur émet ensuite. */
  const draggedRef = useRef(false)
```

et la poser dans `handleBlockPointerUp`, juste avant l'appel à `moveBlock` :

```ts
    draggedRef.current = true
```

- [ ] **Step 4: Marquer visuellement le bloc tiré**

Ajouter à `src/features/calendar/DayGrid.css` :

```css
.daygrid__planned {
  /* Le glisser vertical doit rester à l'app : sans cela, le navigateur
     interprète le geste comme un défilement et le bloc ne suit pas. */
  touch-action: none;
}

.daygrid__planned--dragging {
  opacity: 0.75;
  border-style: solid;
}
```

Ajouter la classe conditionnelle sur le bloc : `${ghost !== null ? 'daygrid__planned--dragging' : ''}`.

- [ ] **Step 5: Vérifier**

Run: `rtk npx tsc -b`
Expected: aucune erreur.

Run: `rtk npx vitest run --dir src && rtk npm run build`
Expected: 187 tests PASS, build réussi.

- [ ] **Step 6: Commit**

```bash
rtk git add src/features/calendar/DayGrid.tsx src/features/calendar/DayGrid.css && rtk git commit -m "feat: drag a planned block to another time slot"
```

---

### Task 9 : Lancer le minuteur depuis un bloc

**Files:**
- Create: `src/lib/timerTaskStore.ts`
- Create: `src/lib/timerTaskStore.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/features/timer/TimerScreen.tsx`

**Interfaces:**
- Produces: `timerTaskStore` avec `getSnapshot(): string | null`, `subscribe(listener: () => void): () => void`, `request(taskId: string): void`, `consume(): string | null`, `resetForTests(): void`

Motif `useSyncExternalStore`, comme `src/lib/settingsStore.ts`. Le store porte une valeur d'amorçage, pas la sélection courante : `selectedTaskId` reste un `useState` local à `TimerScreen`.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `src/lib/timerTaskStore.test.ts` :

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { timerTaskStore } from './timerTaskStore'

beforeEach(() => {
  timerTaskStore.resetForTests()
})

describe('timerTaskStore', () => {
  it('part vide', () => {
    expect(timerTaskStore.getSnapshot()).toBeNull()
  })

  it('retient la tâche demandée', () => {
    timerTaskStore.request('t1')
    expect(timerTaskStore.getSnapshot()).toBe('t1')
  })

  it('prévient ses abonnés', () => {
    let calls = 0
    const unsubscribe = timerTaskStore.subscribe(() => { calls += 1 })
    timerTaskStore.request('t1')
    expect(calls).toBe(1)
    unsubscribe()
    timerTaskStore.request('t2')
    expect(calls).toBe(1)
  })

  it('rend la tâche une seule fois', () => {
    // consume() vide la demande : sans cela, revenir sur l'écran du minuteur
    // resélectionnerait la tâche d'un bloc touché il y a une heure.
    timerTaskStore.request('t1')
    expect(timerTaskStore.consume()).toBe('t1')
    expect(timerTaskStore.consume()).toBeNull()
    expect(timerTaskStore.getSnapshot()).toBeNull()
  })

  it('remplace une demande non consommée', () => {
    timerTaskStore.request('t1')
    timerTaskStore.request('t2')
    expect(timerTaskStore.consume()).toBe('t2')
  })
})
```

- [ ] **Step 2: Lancer les tests pour les voir échouer**

Run: `rtk npx vitest run --dir src`
Expected: FAIL — `Failed to resolve import "./timerTaskStore"`.

- [ ] **Step 3: Écrire le store**

Créer `src/lib/timerTaskStore.ts` :

```ts
/**
 * La tâche qu'un bloc planifié demande au minuteur de prendre.
 *
 * Un store module plutôt qu'un prop traversant l'arbre : la grille du jour est
 * montée sous deux écrans différents, et `selectedTaskId` est un état local de
 * TimerScreen que personne d'autre ne peut fixer. Le store ne remplace pas cet
 * état, il lui fournit une valeur d'amorçage à consommer une fois.
 */
function createTimerTaskStore() {
  let pending: string | null = null
  const listeners = new Set<() => void>()

  function getSnapshot(): string | null {
    return pending
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }

  function request(taskId: string): void {
    pending = taskId
    listeners.forEach((l) => l())
  }

  /** Rend la demande et la vide : elle ne doit servir qu'une fois. */
  function consume(): string | null {
    const taskId = pending
    pending = null
    return taskId
  }

  function resetForTests(): void {
    pending = null
    listeners.clear()
  }

  return { getSnapshot, subscribe, request, consume, resetForTests }
}

export const timerTaskStore = createTimerTaskStore()
```

- [ ] **Step 4: Lancer les tests pour les voir passer**

Run: `rtk npx vitest run --dir src`
Expected: PASS — 5 tests dans `timerTaskStore.test.ts`, 192 au total.

- [ ] **Step 5: Basculer sur l'écran du minuteur**

Dans `src/App.tsx`, remplacer les deux `onStartTimer={() => {}}` laissés par la Task 7 et supprimer le commentaire provisoire posé au-dessus de `AppShell`. Ajouter aux imports :

```tsx
import { useEffect } from 'react'
import { timerTaskStore } from '@/lib/timerTaskStore'
```

(`useEffect` s'ajoute à l'import `react` existant.)

Dans `AppShell`, ajouter :

```tsx
  function startTimerWithTask(taskId: string) {
    timerTaskStore.request(taskId)
    // Les deux onglets, parce que la barre mobile et la latérale desktop ont
    // chacune leur état : on ne sait pas laquelle est à l'écran ici.
    setMobileTab('timer')
    setDesktopTab('timer')
  }
```

et le passer aux deux écrans :

```tsx
{tab === 'tasks' && <TasksScreen onStartTimer={startTimerWithTask} />}
{tab === 'day' && <DayScreen onStartTimer={startTimerWithTask} />}
```

- [ ] **Step 6: Consommer la demande dans le minuteur**

Dans `src/features/timer/TimerScreen.tsx`, ajouter l'import :

```ts
import { timerTaskStore } from '@/lib/timerTaskStore'
```

et, juste après la déclaration de `selectedTaskId` :

```ts
  // `key={tab}` dans App.tsx remonte l'écran à chaque bascule d'onglet : cet
  // effet tourne donc au moment où l'utilisateur arrive depuis un bloc.
  // consume() vide la demande, pour qu'un retour ultérieur ne resélectionne pas.
  useEffect(() => {
    const requested = timerTaskStore.consume()
    if (requested) setSelectedTaskId(requested)
  }, [])
```

Ajouter `useEffect` à l'import `react` de ce fichier.

- [ ] **Step 7: Vérifier**

Run: `rtk npx tsc -b`
Expected: aucune erreur.

Run: `rtk npx vitest run --dir src && rtk npm run build`
Expected: 192 tests PASS, build réussi.

- [ ] **Step 8: Commit**

```bash
rtk git add src/lib/timerTaskStore.ts src/lib/timerTaskStore.test.ts src/App.tsx src/features/timer/TimerScreen.tsx && rtk git commit -m "feat: start the timer on a planned block's task"
```

---

## Vérification finale

Après la dernière tâche :

```bash
rtk npx vitest run --dir src && rtk npx tsc -b && rtk npm run build
```

Attendu : 192 tests PASS, aucune erreur de typage, build réussi.

**Ce qu'aucun test ne couvre, et qui doit être relu à la main** : le seuil de 4 px, la capture du pointeur, l'annulation à l'Échap, et le fait qu'un clic après un glisser n'ouvre pas le panneau. C'est la limite de la contrainte « aucune nouvelle dépendance ». Toute l'arithmétique qu'ils pilotent, elle, est couverte (`blockDrag.test.ts`).
