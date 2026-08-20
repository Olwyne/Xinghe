# Purge du backlog de suivi des objectifs de temps — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Solder les défauts relevés en revue lors de la livraison des objectifs de temps par projet, avant qu'ils ne deviennent des pièges pour le sous-projet suivant.

**Architecture:** Les réglages du minuteur passent d'un `useState` par composant à un store module unique consommé via `useSyncExternalStore`, ce qui rend `dayStart` réellement partagé sans changer la signature de `useTimerSettings()` ni toucher ses cinq appelants. La validation de cible sort de `ProjectModal` vers un module pur testable. `useProjectProgress` devient la seule source de `projects` pour les écrans qui l'utilisent déjà, supprimant un abonnement Firestore en double. `useProjects` gagne les garde-fous qui manquaient à son cycle de chargement.

**Tech Stack:** Vite + React 19 + TypeScript, Firebase Firestore avec repli `localStorage`, react-i18next FR/EN, Vitest.

## Global Constraints

- Toutes les commandes shell sont préfixées par `rtk`, y compris dans les chaînes `&&`.
- Type check : `rtk npx tsc -b`. Ne jamais passer `--noEmit false` — cela force l'émission de `.js` dans tout `src/`.
- Tests : `rtk npm test` (vitest est cadré sur le checkout, `.claude/**` est exclu). 83 tests passent au départ.
- Aucune nouvelle dépendance npm. Cela exclut `jsdom` et `@testing-library/react` : aucun test de rendu DOM, donc toute logique à tester doit vivre dans une fonction pure.
- Aucune nouvelle variable CSS personnalisée.
- Toute chaîne visible passe par `t()`, avec la clé présente dans `src/i18n/fr.json` **et** `src/i18n/en.json` dans le même commit.
- La signature publique `useTimerSettings(): { settings: TimerSettings; setSettings: (update: Partial<TimerSettings>) => void }` ne change pas — c'est ce qui garde le correctif confiné.
- Les cinq appelants de `useTimerSettings()` (`SettingsScreen`, `TimerScreen`, `useProjectProgress`, `useTodaySessions`, `useWeekSessions`) ne sont pas modifiés par la tâche 1.
- Bornes de cible inchangées : minimum 1 minute, maximum 1440 (`day`), 10080 (`week`), 44640 (`month`).

## Hors périmètre, délibérément

- Les fallbacks `?? Date.now()` morts dans `useTimer.ts` : les retirer demande de resserrer le type `TimerState.startedAt`, ce qui déborde de cette purge.
- `useDailyGoal` qui vaut 90 par défaut et ne peut jamais être nul : c'est une décision de conception à rouvrir, pas un défaut.
- La duplication CSS des barres de progression entre `TimeTargetsSection.css` et `StatsScreen.css` : arbitrée et acceptée avant implémentation.
- La synchronisation des réglages entre onglets du navigateur (`storage` event) : personne ne l'a demandée.

## File Structure

**Créés**
- `src/lib/settingsStore.ts` — store module des réglages du minuteur : lecture/écriture localStorage, notification des abonnés. Pur au sens testable : aucune importation React.
- `src/lib/settingsStore.test.ts` — tests du store
- `src/features/tasks/targetValidation.ts` — bornes et validation d'une cible de temps
- `src/features/tasks/targetValidation.test.ts` — tests de la validation

**Modifiés**
- `src/hooks/useTimerSettings.ts` — devient un adaptateur `useSyncExternalStore` au-dessus du store
- `src/hooks/useProjects.ts` — callback d'erreur, déblocage du chargement si l'amorçage échoue, remise à `true` au changement de `uid`
- `src/hooks/useProjectProgress.ts` — expose `projects` dans son retour
- `src/features/goals/TimeTargetsSection.tsx` — consomme `projects` depuis `useProjectProgress`
- `src/features/stats/StatsScreen.tsx` — idem
- `src/features/tasks/ProjectModal.tsx` — importe la validation extraite, affiche la raison d'un enregistrement bloqué
- `src/features/goals/progress.ts` — comparaison de sur-allocation sur le total non arrondi
- `src/features/goals/progress.test.ts` — cas de dépassement inférieur à la minute
- `src/i18n/fr.json`, `src/i18n/en.json` — clé du message de borne dépassée

---

### Task 1: Store partagé des réglages du minuteur

Le défaut : `useTimerSettings` appelle `useState` dans chaque composant, donc chaque appelant détient sa propre copie chargée depuis `localStorage` au montage. Changer la frontière de journée dans les Réglages ne met à jour que la copie de `SettingsScreen`. Les trois hooks de sessions ne voient jamais le changement — cela ne fonctionne aujourd'hui que parce que `App.tsx` rend les écrans conditionnellement par onglet et les remonte donc au retour.

**Files:**
- Create: `src/lib/settingsStore.ts`
- Test: `src/lib/settingsStore.test.ts`
- Modify: `src/hooks/useTimerSettings.ts`

**Interfaces:**
- Consumes: `TimerSettings` et `DEFAULT_SETTINGS` de `@/features/timer/timerEngine`
- Produces: `settingsStore` avec `getSnapshot(): TimerSettings`, `subscribe(listener: () => void): () => void`, `setSettings(update: Partial<TimerSettings>): void`, `resetForTests(): void`

- [ ] **Step 1: Write the failing test**

Créer `src/lib/settingsStore.test.ts` :

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { DEFAULT_SETTINGS } from '@/features/timer/timerEngine'
import { settingsStore } from './settingsStore'

// Vitest tourne ici dans l'environnement Node, où `localStorage` n'existe pas
// (vérifié : `node -e "typeof localStorage"` répond `undefined` en v24).
// Le projet interdit d'ajouter jsdom, donc on installe le minimum utilisé.
function installFakeLocalStorage(): void {
  const data = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => { data.set(k, v) },
      removeItem: (k: string) => { data.delete(k) },
      clear: () => { data.clear() },
    },
  })
}

beforeEach(() => {
  installFakeLocalStorage()
  settingsStore.resetForTests()
})

describe('settingsStore', () => {
  it('retourne les réglages par défaut quand le stockage est vide', () => {
    expect(settingsStore.getSnapshot()).toEqual(DEFAULT_SETTINGS)
  })

  it('fusionne un réglage partiel dans le snapshot', () => {
    settingsStore.setSettings({ dayStart: 6 })
    expect(settingsStore.getSnapshot().dayStart).toBe(6)
    expect(settingsStore.getSnapshot().focusMinutes).toBe(DEFAULT_SETTINGS.focusMinutes)
  })

  it('retourne la même référence tant que rien ne change', () => {
    const first = settingsStore.getSnapshot()
    expect(settingsStore.getSnapshot()).toBe(first)
  })

  it('retourne une nouvelle référence après un changement', () => {
    const before = settingsStore.getSnapshot()
    settingsStore.setSettings({ dayStart: 6 })
    expect(settingsStore.getSnapshot()).not.toBe(before)
  })

  it('persiste dans localStorage', () => {
    settingsStore.setSettings({ dayStart: 6 })
    const raw = localStorage.getItem('xinghe-timer-settings')
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw as string).dayStart).toBe(6)
  })

  it('relit le stockage existant au premier snapshot', () => {
    localStorage.setItem('xinghe-timer-settings', JSON.stringify({ dayStart: 9 }))
    settingsStore.resetForTests()
    expect(settingsStore.getSnapshot().dayStart).toBe(9)
  })

  it('notifie tous les abonnés à chaque changement', () => {
    let a = 0
    let b = 0
    settingsStore.subscribe(() => { a += 1 })
    settingsStore.subscribe(() => { b += 1 })
    settingsStore.setSettings({ dayStart: 6 })
    expect(a).toBe(1)
    expect(b).toBe(1)
  })

  it('cesse de notifier après désabonnement', () => {
    let calls = 0
    const unsubscribe = settingsStore.subscribe(() => { calls += 1 })
    settingsStore.setSettings({ dayStart: 6 })
    unsubscribe()
    settingsStore.setSettings({ dayStart: 7 })
    expect(calls).toBe(1)
  })

  it('ignore un contenu de stockage illisible et retombe sur les défauts', () => {
    localStorage.setItem('xinghe-timer-settings', 'pas du json')
    settingsStore.resetForTests()
    expect(settingsStore.getSnapshot()).toEqual(DEFAULT_SETTINGS)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk npx vitest run src/lib/settingsStore.test.ts`
Expected: FAIL — `Failed to resolve import "./settingsStore"`.

- [ ] **Step 3: Write minimal implementation**

Créer `src/lib/settingsStore.ts` :

```ts
import { DEFAULT_SETTINGS, type TimerSettings } from '@/features/timer/timerEngine'

const STORAGE_KEY = 'xinghe-timer-settings'

function loadSettings(): TimerSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch { /* use defaults */ }
  return DEFAULT_SETTINGS
}

/**
 * Source unique des réglages du minuteur.
 *
 * Un store module plutôt qu'un état local par composant : `dayStart` est lu par
 * trois hooks de sessions en plus de l'écran des réglages, et un `useState` par
 * appelant leur donnait chacun une copie figée au montage.
 */
function createSettingsStore() {
  let snapshot: TimerSettings | null = null
  const listeners = new Set<() => void>()

  function getSnapshot(): TimerSettings {
    if (snapshot === null) snapshot = loadSettings()
    return snapshot
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }

  function setSettings(update: Partial<TimerSettings>): void {
    snapshot = { ...getSnapshot(), ...update }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
    } catch { /* quota ou navigation privée : l'état en mémoire suffit */ }
    listeners.forEach((l) => l())
  }

  /** Vide le snapshot mémorisé pour que le test suivant relise le stockage. */
  function resetForTests(): void {
    snapshot = null
  }

  return { getSnapshot, subscribe, setSettings, resetForTests }
}

export const settingsStore = createSettingsStore()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk npx vitest run src/lib/settingsStore.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Rebrancher le hook sur le store**

Remplacer intégralement `src/hooks/useTimerSettings.ts` :

```ts
import { useSyncExternalStore } from 'react'
import { settingsStore } from '@/lib/settingsStore'

/**
 * Réglages du minuteur, partagés par tous les appelants.
 *
 * La signature est inchangée : les cinq consommateurs existants n'ont rien à
 * modifier, mais ils voient désormais tous le même état.
 */
export function useTimerSettings() {
  const settings = useSyncExternalStore(settingsStore.subscribe, settingsStore.getSnapshot)
  return { settings, setSettings: settingsStore.setSettings }
}
```

- [ ] **Step 6: Vérifier**

Run: `rtk npx tsc -b && rtk npm test`
Expected: aucune erreur de type, 92 tests au vert (83 + 9).

- [ ] **Step 7: Vérifier la propagation dans l'app**

Run: `rtk npm run dev`

Régler une cible de 30 min/jour sur un projet, enregistrer une session, ouvrir l'écran Objectifs, puis **sans changer d'onglet entre-temps** ouvrir les Réglages et modifier la frontière de journée. Revenir aux Objectifs : la progression doit refléter la nouvelle frontière. Arrêter le serveur.

- [ ] **Step 8: Commit**

```bash
rtk git add src/lib/settingsStore.ts src/lib/settingsStore.test.ts src/hooks/useTimerSettings.ts && rtk git commit -m "fix: share timer settings through a single store"
```

---

### Task 2: Garde-fous du chargement dans `useProjects`

Trois trous dans le même effet : l'abonnement `onSnapshot` n'a pas de callback d'erreur, la branche d'amorçage retourne sans jamais libérer `loading` si `seedInbox` échoue, et `loading` ne repasse jamais à `true` quand `uid` change. Depuis que `useProjectProgress` conditionne son effet de sessions à `projectsLoading`, un blocage ici fige les nouveaux écrans sur des squelettes.

**Files:**
- Modify: `src/hooks/useProjects.ts:50-75`

**Interfaces:**
- Consumes: rien de nouveau
- Produces: rien de nouveau — le retour `{ projects, loading, addProject, updateProject, deleteProject }` est inchangé

Aucun test unitaire : ce hook est du câblage Firestore et le projet n'a pas d'infrastructure de test de hooks. La vérification est le type check, la suite existante et le contrôle manuel.

- [ ] **Step 1: Remettre `loading` à true au changement d'utilisateur**

Dans `src/hooks/useProjects.ts`, au tout début du corps de l'effet (avant le test `if (!isFirebaseConfigured || !uid || !db)`) :

```ts
    setLoading(true)
    seededRef.current = false
```

Sans cela, un changement de compte affiche les projets du compte précédent avec `loading` déjà à `false`.

- [ ] **Step 2: Libérer le chargement si l'amorçage échoue, sans toucher un effet nettoyé**

`seedInbox(uid)` est un appel fire-and-forget : si `uid` change pendant qu'il est en vol, l'effet précédent est nettoyé mais la promesse continue de vivre dans sa fermeture. Si elle rejette après coup, son `.catch` ne doit pas appeler `setLoading(false)` sur l'effet du nouveau compte — sinon les projets du nouveau compte s'affichent comme chargés alors que leur snapshot n'est pas encore arrivé. Il faut donc un drapeau d'annulation capturé par la fermeture de l'effet.

Au tout début du corps de l'effet, avant `setLoading(true)` :

```ts
    let cancelled = false
```

Puis, dans le callback de `onSnapshot`, remplacer la branche d'amorçage :

```ts
        if (data.length === 0 && !seededRef.current) {
          seededRef.current = true
          seedInbox(uid)
          return
        }
```

par :

```ts
        if (data.length === 0 && !seededRef.current) {
          seededRef.current = true
          // Le snapshot suivant libérera loading ; si l'amorçage échoue il ne
          // viendra jamais, donc on débloque l'UI ici plutôt que de la figer.
          // On ignore ce déblocage si l'effet a été nettoyé entre-temps (uid a
          // changé) pour ne pas afficher le nouveau compte comme chargé.
          seedInbox(uid).catch(() => {
            if (!cancelled) setLoading(false)
          })
          return
        }
```

`seedInbox` est déclarée `async function seedInbox(uid: string): Promise<void>` à la ligne 29 du même fichier, donc `.catch()` s'applique directement.

- [ ] **Step 3: Ajouter le callback d'erreur, garder la référence pour le nettoyage**

`onSnapshot` prend un troisième argument, et son retour (la fonction de désabonnement) doit être capturé dans une variable plutôt que retourné directement, car le nettoyage de l'effet doit maintenant faire deux choses : lever le drapeau d'annulation et se désabonner.

Remplacer :

```ts
    return onSnapshot(
      query(colRef(uid), orderBy('order')),
      (snapshot) => {
        ...
      },
    )
  }, [uid])
```

par :

```ts
    const unsubscribe = onSnapshot(
      query(colRef(uid), orderBy('order')),
      (snapshot) => {
        ...
      },
      () => {
        // Permission refusée, réseau coupé : on sort de l'état de chargement
        // plutôt que de laisser les écrans sur des squelettes indéfiniment,
        // sauf si l'effet a déjà été nettoyé (changement de compte).
        if (!cancelled) setLoading(false)
      },
    )

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [uid])
```

La branche de repli localStorage (avant l'appel à `onSnapshot`) continue de `return` sans rien — pas de souscription à nettoyer sur ce chemin, donc pas de fonction de nettoyage nécessaire.

- [ ] **Step 4: Vérifier**

Run: `rtk npx tsc -b && rtk npm test`
Expected: aucune erreur de type, 92 tests au vert.

- [ ] **Step 5: Commit**

```bash
rtk git add src/hooks/useProjects.ts && rtk git commit -m "fix: never leave useProjects stuck in a loading state"
```

---

### Task 3: Validation de cible extraite et testée

`isValidTarget` et le calcul de `totalMinutes` sont purs mais vivent dans un `.tsx` sans test, alors qu'ils portent les bornes que toute la feature suppose respectées.

**Files:**
- Create: `src/features/tasks/targetValidation.ts`
- Test: `src/features/tasks/targetValidation.test.ts`
- Modify: `src/features/tasks/ProjectModal.tsx:7-11`, `:40-41`

**Interfaces:**
- Consumes: `TargetPeriod` de `./types`
- Produces: `MAX_MINUTES: Record<TargetPeriod, number>`, `isValidTarget(period: TargetPeriod, minutes: number): boolean`, `parseTargetMinutes(hours: string, mins: string): number`

- [ ] **Step 1: Write the failing test**

Créer `src/features/tasks/targetValidation.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { MAX_MINUTES, isValidTarget, parseTargetMinutes } from './targetValidation'

describe('MAX_MINUTES', () => {
  it('vaut 24h par jour de la période', () => {
    expect(MAX_MINUTES.day).toBe(1440)
    expect(MAX_MINUTES.week).toBe(10080)
    expect(MAX_MINUTES.month).toBe(44640)
  })
})

describe('isValidTarget', () => {
  it('accepte le minimum d’une minute', () => {
    expect(isValidTarget('day', 1)).toBe(true)
  })

  it('refuse zéro', () => {
    expect(isValidTarget('day', 0)).toBe(false)
  })

  it('refuse une valeur négative', () => {
    expect(isValidTarget('day', -30)).toBe(false)
  })

  it('accepte exactement le maximum de chaque cadence', () => {
    expect(isValidTarget('day', 1440)).toBe(true)
    expect(isValidTarget('week', 10080)).toBe(true)
    expect(isValidTarget('month', 44640)).toBe(true)
  })

  it('refuse une minute au-dessus du maximum de chaque cadence', () => {
    expect(isValidTarget('day', 1441)).toBe(false)
    expect(isValidTarget('week', 10081)).toBe(false)
    expect(isValidTarget('month', 44641)).toBe(false)
  })

  it('refuse une valeur non entière', () => {
    expect(isValidTarget('day', 30.5)).toBe(false)
  })

  it('refuse NaN', () => {
    expect(isValidTarget('day', NaN)).toBe(false)
  })

  it('borne chaque cadence indépendamment', () => {
    // 2000 min dépasse le maximum quotidien mais reste valide sur une semaine
    expect(isValidTarget('day', 2000)).toBe(false)
    expect(isValidTarget('week', 2000)).toBe(true)
  })
})

describe('parseTargetMinutes', () => {
  it('combine heures et minutes', () => {
    expect(parseTargetMinutes('6', '30')).toBe(390)
  })

  it('traite les champs vides comme zéro', () => {
    expect(parseTargetMinutes('', '')).toBe(0)
  })

  it('traite une saisie non numérique comme zéro', () => {
    expect(parseTargetMinutes('abc', '30')).toBe(30)
  })

  it('accepte des minutes au-delà de 59', () => {
    expect(parseTargetMinutes('1', '90')).toBe(150)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk npx vitest run src/features/tasks/targetValidation.test.ts`
Expected: FAIL — `Failed to resolve import "./targetValidation"`.

- [ ] **Step 3: Write minimal implementation**

Créer `src/features/tasks/targetValidation.ts` :

```ts
import type { TargetPeriod } from './types'

/** Maximum atteignable : 24 h par jour de la période. */
export const MAX_MINUTES: Record<TargetPeriod, number> = {
  day: 1440,
  week: 10080,
  month: 44640,
}

export function isValidTarget(period: TargetPeriod, minutes: number): boolean {
  return Number.isInteger(minutes) && minutes >= 1 && minutes <= MAX_MINUTES[period]
}

/** Somme des deux champs de saisie ; une saisie vide ou illisible vaut zéro. */
export function parseTargetMinutes(hours: string, mins: string): number {
  return (parseInt(hours, 10) || 0) * 60 + (parseInt(mins, 10) || 0)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk npx vitest run src/features/tasks/targetValidation.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Brancher `ProjectModal` sur le module**

Dans `src/features/tasks/ProjectModal.tsx`, supprimer les lignes 7 à 11 (la constante `MAX_MINUTES` et la fonction `isValidTarget`) et ajouter à la suite des imports existants :

```ts
import { MAX_MINUTES, isValidTarget, parseTargetMinutes } from './targetValidation'
```

Puis remplacer le calcul de `totalMinutes` dans `ProjectRow` :

```ts
  const totalMinutes = parseTargetMinutes(hours, mins)
```

`MAX_MINUTES` reste importé : la tâche 4 l'utilise pour le message d'erreur.

- [ ] **Step 6: Vérifier**

Run: `rtk npx tsc -b && rtk npm test`
Expected: aucune erreur de type, 105 tests au vert (92 + 13).

- [ ] **Step 7: Commit**

```bash
rtk git add src/features/tasks/targetValidation.ts src/features/tasks/targetValidation.test.ts src/features/tasks/ProjectModal.tsx && rtk git commit -m "refactor: extract target validation into a tested module"
```

---

### Task 4: Dire pourquoi l'enregistrement est bloqué

Aujourd'hui, saisir 25 h pour une cible quotidienne rend le bouton Enregistrer inerte, sans un mot d'explication.

**Files:**
- Modify: `src/features/tasks/ProjectModal.tsx`
- Modify: `src/features/tasks/ProjectModal.css`
- Modify: `src/i18n/fr.json`, `src/i18n/en.json`

**Interfaces:**
- Consumes: `MAX_MINUTES` et `isValidTarget` de `./targetValidation` (tâche 3)
- Produces: rien

- [ ] **Step 1: Ajouter la clé i18n**

Dans `src/i18n/fr.json`, dans l'objet `goals` existant :

```json
"targetTooLarge": "Maximum {{max}} pour cette cadence.",
```

Dans `src/i18n/en.json`, dans l'objet `goals` existant :

```json
"targetTooLarge": "At most {{max}} for this cadence.",
```

- [ ] **Step 2: Afficher le message sous les champs**

Dans `src/features/tasks/ProjectModal.tsx`, importer le formateur à la suite des imports existants :

```ts
import { formatMinutesToHours } from '@/lib/time'
```

Puis, dans le rendu du mode édition, juste après le bloc `<div className="pm-row__periods">…</div>` et avant le bouton `pm-row__target-clear` :

```tsx
          {!targetValid && (
            <p className="pm-row__target-error">
              {t('goals.targetTooLarge', { max: formatMinutesToHours(MAX_MINUTES[period]) })}
            </p>
          )}
```

Le message n'apparaît que lorsque la saisie est réellement hors bornes — `targetValid` est vrai quand le total vaut zéro, cas qui signifie « aucune cible » et non une erreur.

- [ ] **Step 3: Styler le message**

Ajouter à la fin de `src/features/tasks/ProjectModal.css` :

```css
.pm-row__target-error {
  margin: 0;
  font-size: 0.72rem;
  color: var(--xh-focus);
}
```

- [ ] **Step 4: Vérifier**

Run: `rtk npx tsc -b && rtk npm test`
Expected: aucune erreur de type, 105 tests au vert.

- [ ] **Step 5: Vérifier à l'écran**

Run: `rtk npm run dev`

Éditer un projet, choisir la cadence Jour, saisir 25 h : le message « Maximum 24 h pour cette cadence. » apparaît et Enregistrer est inerte. Ramener à 2 h : le message disparaît, Enregistrer redevient actif. Basculer sur Semaine avec 25 h : la cible est acceptée. Arrêter le serveur.

- [ ] **Step 6: Commit**

```bash
rtk git add src/features/tasks/ProjectModal.tsx src/features/tasks/ProjectModal.css src/i18n/fr.json src/i18n/en.json && rtk git commit -m "feat: explain why an out-of-range target blocks saving"
```

---

### Task 5: Un seul abonnement aux projets par écran

`TimeTargetsSection` et `StatsScreen` appellent `useProjects(uid)` alors que `useProjectProgress(uid)` l'appelle déjà en interne : deux écouteurs `onSnapshot` sur la même collection, et deux tableaux `projects` qui peuvent momentanément diverger.

**Files:**
- Modify: `src/hooks/useProjectProgress.ts`
- Modify: `src/features/goals/TimeTargetsSection.tsx`
- Modify: `src/features/stats/StatsScreen.tsx`

**Interfaces:**
- Consumes: `useProjectProgress(uid)` (existant)
- Produces: `useProjectProgress(uid): { projects: Project[]; byProject: Record<string, ProjectProgress>; allocation: Allocation; loading: boolean }`

- [ ] **Step 1: Exposer `projects` depuis le hook**

Dans `src/hooks/useProjectProgress.ts`, ajouter l'import de type s'il n'y est pas déjà :

```ts
import type { Project } from '@/features/tasks/types'
```

Élargir le type de retour déclaré :

```ts
export function useProjectProgress(uid: string | null): {
  projects: Project[]
  byProject: Record<string, ProjectProgress>
  allocation: Allocation
  loading: boolean
} {
```

et l'instruction de retour finale :

```ts
  return { projects, byProject, allocation, loading: projectsLoading || sessionsLoading }
```

- [ ] **Step 2: Consommer `projects` depuis le hook dans la section Objectifs**

Dans `src/features/goals/TimeTargetsSection.tsx`, supprimer la ligne d'import `useProjects` et la ligne `const { projects } = useProjects(uid)`, puis remplacer la destructuration restante :

```ts
  const { projects, byProject, allocation, loading } = useProjectProgress(uid)
```

- [ ] **Step 3: Faire de même dans Stats**

Dans `src/features/stats/StatsScreen.tsx`, supprimer la ligne d'import `useProjects` et la ligne `const { projects } = useProjects(uid)`, puis remplacer :

```ts
  const { projects, byProject, loading: progressLoading } = useProjectProgress(uid)
```

Attention : si `useProjects` sert encore à autre chose dans ce fichier, garder l'import et ne retirer que l'appel redondant. Vérifier avant de supprimer.

- [ ] **Step 4: Vérifier**

Run: `rtk npx tsc -b && rtk npm test`
Expected: aucune erreur de type — `noUnusedLocals` est activé, donc un import laissé orphelin fera échouer le build. 105 tests au vert.

- [ ] **Step 5: Vérifier à l'écran**

Run: `rtk npm run dev`

Les écrans Objectifs et Stats affichent les mêmes lignes qu'avant, avec les mêmes valeurs. Arrêter le serveur.

- [ ] **Step 6: Commit**

```bash
rtk git add src/hooks/useProjectProgress.ts src/features/goals/TimeTargetsSection.tsx src/features/stats/StatsScreen.tsx && rtk git commit -m "refactor: source projects from useProjectProgress only"
```

---

### Task 6: Comparer la sur-allocation avant d'arrondir

`computeAllocation` arrondit le total avant de le comparer à l'objectif global, si bien qu'un dépassement inférieur à la minute passe inaperçu.

**Files:**
- Modify: `src/features/goals/progress.ts:22-32`
- Test: `src/features/goals/progress.test.ts`

**Interfaces:**
- Consumes: rien de nouveau
- Produces: `computeAllocation` garde sa signature ; seul `isOverAllocated` change de comportement aux marges

- [ ] **Step 1: Write the failing test**

Ajouter dans le bloc `describe('computeAllocation', …)` de `src/features/goals/progress.test.ts` :

```ts
  it('signale un dépassement inférieur à la minute', () => {
    // 1263 min/semaine = 180,43 min/jour, juste au-dessus d'un objectif de 180
    const a = computeAllocation(
      [project('a', { period: 'week', targetMinutes: 1263 })],
      180,
    )
    expect(a.totalTargetPerDay).toBe(180)
    expect(a.isOverAllocated).toBe(true)
  })
```

Le total affiché reste arrondi à 180 — c'est voulu, l'affichage n'a pas à montrer des décimales — mais la comparaison, elle, doit voir le dépassement.

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk npx vitest run src/features/goals/progress.test.ts -t "inférieur à la minute"`
Expected: FAIL — `expected false to be true`, parce que `Math.round(180.43)` vaut `180` et que `180 > 180` est faux.

- [ ] **Step 3: Write minimal implementation**

Dans `src/features/goals/progress.ts`, remplacer le corps de `computeAllocation` :

```ts
export function computeAllocation(projects: Project[], globalPerDay: number): Allocation {
  const total = projects.reduce((sum, p) => {
    if (!p.timeTarget) return sum
    return sum + normalizeToDaily(p.timeTarget.period, p.timeTarget.targetMinutes)
  }, 0)
  return {
    // Arrondi pour l'affichage seulement : la comparaison se fait sur le total
    // exact, sinon un dépassement inférieur à la minute disparaît.
    totalTargetPerDay: Math.round(total),
    globalPerDay,
    isOverAllocated: globalPerDay > 0 && total > globalPerDay,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk npm test`
Expected: PASS, 106 tests au vert (105 + 1). Les cas existants « ne signale rien quand le total égale exactement l'objectif global » et « ne signale rien quand l'objectif global vaut 0 » doivent rester verts.

- [ ] **Step 5: Commit**

```bash
rtk git add src/features/goals/progress.ts src/features/goals/progress.test.ts && rtk git commit -m "fix: compare allocation before rounding for display"
```

---

### Task 7: Vérification finale

**Files:** aucun (vérification)

- [ ] **Step 1: Suite complète**

Run: `rtk npm test`
Expected: 106 tests au vert, sortie sans avertissement.

- [ ] **Step 2: Build de production**

Run: `rtk npm run build`
Expected: build réussi, aucune erreur TypeScript.

- [ ] **Step 3: Vérifier qu'aucun appelant ne reste sur l'ancien état local**

Run: `rtk grep -rn "useState" src/hooks/useTimerSettings.ts`
Expected: aucun résultat — le hook ne détient plus d'état propre.

- [ ] **Step 4: Parcours manuel**

Run: `rtk npm run dev`

1. Définir une cible de 30 min/jour sur un projet, enregistrer une session courte dessus.
2. Ouvrir les Réglages, changer la frontière de journée, revenir aux Objectifs : la progression suit la nouvelle frontière.
3. Éditer un projet, saisir 25 h en cadence Jour : le message de borne apparaît, Enregistrer est inerte.
4. Ouvrir Stats : la carte des objectifs affiche les mêmes valeurs que l'écran Objectifs.

Arrêter le serveur.

- [ ] **Step 5: Commit final si des correctifs ont été nécessaires**

```bash
rtk git add -A && rtk git commit -m "fix: address issues found during final verification"
```
