# Temps passé éditable (sous-projet B)

Date : 2026-08-20
Statut : validé, prêt pour le plan d'implémentation

## Contexte

Le temps existe aujourd'hui en double dans Xinghe :

- `Task.spentMs`, un compteur cumulé incrémenté par le minuteur (`src/features/timer/TimerScreen.tsx:49`), affiché en lecture seule dans `TaskModal` ;
- la collection `sessions`, source réelle qui alimente les objectifs de projet et les statistiques.

Les deux ne sont réconciliés nulle part. Une correction manuelle portée sur `spentMs` seul ne bougerait ni les objectifs ni les stats ; portée sur les sessions seules, elle laisserait le compteur de la tâche mentir. Ce sous-projet supprime la duplication et rend le temps corrigeable.

Sous-projet **B** d'un ensemble de quatre :

| Sous-projet | Contenu | Dépend de |
|---|---|---|
| A — Objectifs de temps par projet | livré le 2026-08-20 (merge 5f25ef1) | — |
| **B — Temps passé éditable** | entrées de temps consultables, modifiables, créées à la main | — |
| C — Calendrier / time-blocking | drag & drop d'une tâche sur un créneau horaire | B |
| D — Stats unifiées | objectif vs planifié vs réel | A + B + C |

Spec de A : `docs/superpowers/specs/2026-08-20-objectifs-temps-projet-design.md`.

## Décisions de conception

| # | Question | Décision |
|---|---|---|
| 1 | Nature de l'édition ? | **Gestion des entrées de temps** : la liste des sessions d'une tâche est consultable, modifiable, complétable à la main. Le total en découle toujours. |
| 2 | Sort de `Task.spentMs` ? | **Il sort du circuit.** Le temps d'une tâche se calcule depuis ses sessions. Le champ subsiste dans les documents existants mais n'est plus ni lu ni écrit. |
| 3 | Forme d'une saisie manuelle ? | **Un créneau réel** : date, heure de début, durée. Même forme qu'une session du minuteur, donc plaçable telle quelle sur la grille horaire de C. |
| 4 | Traçabilité ? | **Marqueur `origin`**, et tout est modifiable, y compris une session mesurée. Une session corrigée garde `origin: 'timer'` et gagne `editedAt`. |
| 5 | Où gère-t-on les entrées ? | **Depuis la tâche uniquement.** Les sessions sans tâche restent hors de portée jusqu'à C. |
| 6 | Tâche changeant de projet ? | **Les entrées suivent la tâche** : le `projectId` de toutes ses sessions est réécrit. |
| 7 | Règles de saisie ? | **Le strict minimum** : durée d'au moins 1 minute, début pas dans le futur. Chevauchements autorisés, pas de plafond de durée, pas de limite d'ancienneté. |

## Modèle de données

`src/features/goals/types.ts` :

```ts
export interface Session {
  id: string
  projectId: string
  taskId?: string | null
  startedAt: number
  durationMs: number
  endedAt?: number
  type: 'focus'
  /** Comment l'entrée est née. Absent sur les documents antérieurs = 'timer'. */
  origin?: 'timer' | 'manual'
  /** Dernière correction manuelle. Absent = jamais corrigée. */
  editedAt?: number
}
```

Une saisie manuelle est une session comme une autre — mêmes champs, même forme — portant `origin: 'manual'`. Aucun calcul existant n'a à distinguer les deux. `recordSession` écrit désormais `origin: 'timer'`.

`Task.spentMs` n'est plus ni lu ni écrit : la ligne qui l'incrémentait dans `TimerScreen.tsx:49` disparaît, et son affichage dans `TaskModal.tsx:223` cède la place à la nouvelle section. Aucune migration : les documents existants gardent le champ, simplement ignoré.

Les documents antérieurs sans `origin` sont traités comme `'timer'`, ce qu'ils sont — seul le minuteur créait des sessions jusqu'ici.

## Logique pure

`src/features/tasks/timeEntry.ts`, sans React ni Firestore :

```ts
export interface TimeEntryDraft {
  /** Minuit local du jour choisi. */
  day: number
  /** Minutes depuis minuit. */
  startMinutes: number
  durationMinutes: number
}

export type TimeEntryError = 'duration-too-short' | 'starts-in-future'

/** null = valide. */
export function validateEntry(draft: TimeEntryDraft, now: number): TimeEntryError | null

/** Combine jour et heure en un timestamp absolu. */
export function draftToStartedAt(draft: TimeEntryDraft): number

/** Décompose une session existante pour pré-remplir le formulaire. */
export function sessionToDraft(session: Session): TimeEntryDraft

export function totalMinutes(sessions: Session[]): number
```

Deux règles, pas une de plus : durée d'au moins une minute, début pas dans le futur. Chaque règle supplémentaire serait un refus à expliquer, et le seul chevauchement réellement gênant se verra dans le calendrier, pas ici.

## Accès aux données

`src/hooks/useTaskSessions.ts` :

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

Requête Firestore `where('taskId', '==', taskId)` — égalité sur un seul champ, aucun index composite nouveau. Repli `localStorage` sur la clé `xinghe-sessions`, comme les hooks de sessions voisins.

`addEntry` écrit `origin: 'manual'`. `updateEntry` conserve l'`origin` existant et pose `editedAt`.

**Résolution à la minute.** Le formulaire saisit des minutes entières, donc `durationMs = durationMinutes × 60 000` : corriger une session mesurée arrondit ses secondes. C'est le prix d'un formulaire lisible, et l'écart est borné à 59 secondes par entrée corrigée. Les sessions non corrigées gardent leurs millisecondes intactes. `totalMinutes` tronque à la minute inférieure (`Math.floor`), comme le fait déjà l'agrégation des objectifs de projet — les deux totaux restent donc cohérents entre eux.

## Déplacement d'une tâche

Quand `updateTask` reçoit un `projectId` différent de l'actuel, les sessions de la tâche suivent. Firestore : lecture des sessions de la tâche puis `writeBatch`, le schéma que `deleteProject` emploie déjà pour réaffecter les tâches d'un projet supprimé. Repli `localStorage` : réécriture de la liste.

La logique vit dans `useTasks`, à côté de `updateTask` — un appelant ne doit pas pouvoir l'oublier.

Conséquence assumée : une semaine déjà close change rétroactivement. L'alternative produirait des tâches dont le temps est compté dans un autre projet qu'elles, ce qui est impossible à expliquer dans l'UI.

## UI

### Section « Temps passé »

`src/features/tasks/TaskTimeEntries.tsx`, monté par `TaskModal` à la place de l'affichage en lecture seule. Un composant à part : le modal gère déjà titre, notes, sous-tâches, quadrant et échéance, et un cinquième bloc éditable en ligne le rendrait illisible.

En-tête : le total (`3 h 15`) et un bouton « Ajouter ». En dessous, une ligne par entrée, la plus récente d'abord :

```
mar. 18 août   14:00 → 15:30     1 h 30   ⏱     ✎  ✕
mar. 18 août   09:15 → 09:40       25 min       ✎  ✕
```

Le pictogramme ⏱ marque `origin: 'timer'` ; son absence signale une saisie manuelle. Une entrée retouchée (`editedAt`) porte une marque discrète supplémentaire.

Modifier ouvre le formulaire en ligne à la place de la ligne. Supprimer demande confirmation : le geste est irréversible et une entrée peut représenter des heures de travail.

### Formulaire

Identique en ajout et en modification : un champ date, une heure de début, une durée en heures et minutes. **Pas de champ « heure de fin »** — deux façons de saisir la même chose obligent à arbitrer laquelle gagne quand les deux changent.

Le bouton d'enregistrement reste inactif tant que la saisie est invalide, avec le motif affiché (durée trop courte, ou début dans le futur), comme le fait déjà l'éditeur de cible de projet.

### Tâche non encore créée

`TaskModal` sert aussi à créer une tâche, et une tâche sans `id` n'a pas d'entrées. La section ne s'affiche alors pas ; elle apparaît à la réouverture.

## i18n

Nouvelles clés sous `tasks.*` dans `src/i18n/fr.json` et `src/i18n/en.json`, les deux langues remplies dans le même commit :

`tasks.timeEntries`, `tasks.addEntry`, `tasks.editEntry`, `tasks.deleteEntry`, `tasks.confirmDeleteEntry`, `tasks.entryDate`, `tasks.entryStart`, `tasks.entryDuration`, `tasks.fromTimer`, `tasks.edited`, `tasks.noEntries`, `tasks.errorDurationTooShort`, `tasks.errorStartsInFuture`.

La clé `tasks.timeSpent` disparaît avec l'affichage qu'elle servait.

## Erreurs et cas limites

- **Hors ligne / Firebase non configuré** : `useTaskSessions` lit et écrit `localStorage`. Le mode dev sans Firebase reste pleinement fonctionnel.
- **Écriture qui échoue** (permission, réseau) : l'erreur remonte à l'appelant, le formulaire reste ouvert avec la saisie intacte et affiche un message. Aucune suppression optimiste qui ferait disparaître une entrée toujours présente.
- **Chargement** : squelettes de lignes, jamais un total à `0` transitoire.
- **Frontière de journée** : une session est rattachée à sa période de début. Une saisie manuelle à 2 h du matin compte dans la journée de la veille si la frontière est à 4 h.
- **Minuteur en cours sur la même tâche** : aucun conflit, la session en cours n'est écrite qu'à sa fin.
- **Suppression de la dernière entrée** : le total passe à zéro, l'état vide s'affiche.
- **Suppression d'une tâche** : ses sessions ne sont pas supprimées. Elles gardent leur `projectId` et continuent de compter dans les objectifs du projet — le temps a bien été passé. Elles deviennent inaccessibles depuis l'UI jusqu'au sous-projet C, où la grille horaire les fera réapparaître.

## Tests

Vitest, sur la logique pure :

- `validateEntry` : durée nulle, négative, exactement une minute ; début maintenant, une seconde dans le futur, hier ; combinaisons des deux.
- `draftToStartedAt` / `sessionToDraft` : aller-retour sans perte, minuit, 23 h 59, passage à l'heure d'été.
- `totalMinutes` : liste vide, une entrée, plusieurs, arrondi des secondes.
- `reassignSessions(sessions, taskId, newProjectId)` : fonction pure extraite pour être testable — seules les sessions de la tâche changent de projet, les autres restent intactes.

Pas de test de rendu : ni `jsdom` ni `@testing-library/react`, et la règle « aucune nouvelle dépendance » tient. Toute logique d'affichage vit donc dans une fonction pure, comme `buildTargetRows` et `targetValidation` avant elle.

## Hors périmètre

Le journal du jour et le rattachement d'une session orpheline à une tâche (sous-projet C, où la grille horaire les montrera naturellement). La durée estimée d'une tâche. Le calendrier et le glisser-déposer. La comparaison planifié/réel. Un champ de total directement modifiable créant une entrée d'ajustement. La suppression en cascade des sessions d'une tâche supprimée.
