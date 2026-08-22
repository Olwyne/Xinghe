# Blocs planifiés (sous-projet C2)

Date : 2026-08-22
Statut : validé, prêt pour le plan d'implémentation

## Contexte

C1 a livré la grille du jour : les sessions à leur heure réelle, en lecture, avec rattachement des orphelines. Elle ne montre que le passé. C2 y ajoute l'intention — bloquer un créneau pour une tâche, le déplacer, le régler, le lancer.

**Planifier et mesurer sont deux choses différentes.** Une `Session` enregistre du temps vécu ; un bloc « demain 8h–9h » peut ne jamais se réaliser. Planifier en créant des sessions à l'avance les ferait compter immédiatement comme du travail fait et priverait D de toute comparaison. D'où une entité distincte.

Spec de C1 : `docs/superpowers/specs/2026-08-21-grille-du-jour-design.md`.

## Décisions de conception

| # | Question | Décision |
|---|---|---|
| 1 | Création d'un bloc | **Appui sur un créneau vide** → sélecteur de tâche. Pas de glisser inter-zones depuis un panneau latéral : c'est le geste qui casse au tactile, et l'objet compte plus que le geste. |
| 2 | Stockage | **Collection `users/{uid}/blocks`.** Une tâche doit pouvoir être bloquée plusieurs fois par jour — des champs `plannedAt` sur la tâche l'interdiraient par construction. |
| 3 | Bloc sans tâche | **Impossible.** `taskId` obligatoire. Tout temps appartient à une tâche, donc à un projet, donc à une cible : un bloc libre serait le seul objet du calendrier qui ne compte nulle part. |
| 4 | Cohabitation prévu / réel | **Deux couloirs** : prévu à gauche, réel à droite. La cible d'un geste est toujours certaine, et l'écart se lit sans bascule. |
| 5 | Manipulation | **Glisser pour déplacer seulement.** Le redimensionnement passe par un champ de durée : à 48 px/heure, une poignée de quart d'heure ferait 12 px, invisible au doigt. |
| 6 | Lien avec le minuteur | **Un bloc peut lancer le minuteur** sur sa tâche. Sans ce pont, C2 ne livre qu'un calendrier qu'on regarde. |
| 7 | Tâche ou projet supprimé | **Cascade** : la tâche emporte ses blocs ; le projet fait migrer les siens vers l'inbox. Une intention orpheline n'est ni corrigeable ni utile — contrairement à une session orpheline, qui atteste d'un temps vécu. |

## Modèle de données

Nouvelle entité, `src/features/calendar/types.ts` :

```ts
export interface PlannedBlock {
  id: string
  /** Obligatoire : un bloc est toujours l'intention de faire une tâche. */
  taskId: string
  /** Recopié depuis la tâche, comme le fait `attachToTask`. */
  projectId: string
  startedAt: number
  durationMs: number
  createdAt: number
}
```

Même forme qu'une `Session` moins `type`, `origin` et `endedAt`. C'est délibéré : la disposition générique les place avec le même code.

## Accès aux données

`src/hooks/useDayBlocks.ts`, calqué sur `useDaySessions` :

```ts
useDayBlocks(uid: string | null, reference: number): {
  blocks: PlannedBlock[]
  loading: boolean
  addBlock: (task: Task, startedAt: number, durationMs: number) => Promise<void>
  moveBlock: (id: string, startedAt: number) => Promise<void>
  updateBlock: (id: string, startedAt: number, durationMs: number) => Promise<void>
  removeBlock: (id: string) => Promise<void>
}
```

Requête à **une seule clause de plage** (`startedAt >= start`, `startedAt < end`) : index automatique, aucune déclaration à ajouter dans `firestore.indexes.json`. Repli `localStorage` sur la clé `xinghe-blocks`.

`addBlock` écrit `taskId` **et** `projectId` ensemble — l'invariant du sous-projet B, appliqué ici dès la création.

**Deux chemins existants à étendre :**

- `deleteTask` (`src/hooks/useTasks.ts`) supprime aujourd'hui la tâche sans toucher à ses sessions. Il doit désormais supprimer ses blocs, dans le même batch.
- `deleteProject` (`src/hooks/useProjects.ts`) migre tâches et sessions vers l'inbox. Les blocs rejoignent ce batch, sans quoi leur `projectId` pointerait sur un projet mort et le bloc perdrait sa couleur.

## Logique pure

Tout le risque de C2 est dans le geste, et aucun test de rendu n'est possible : ni jsdom ni `@testing-library/react`, la règle « aucune nouvelle dépendance » tient. Toute l'arithmétique sort donc des composants.

**1. Disposition générique.** `layoutDaySessions` devient une enveloppe fine sur :

```ts
interface Span { id: string; startedAt: number; durationMs: number }
/** `PositionedSession` sans le champ `session` : l'élément d'origine est porté par `item`. */
interface Positioned<T> {
  item: T
  top: number
  height: number
  column: number
  columnCount: number
  clippedEnd: boolean
}
export function layoutSpans<T extends Span>(items: T[], range: PeriodRange): Positioned<T>[]
```

Même algorithme, mêmes garanties. Les deux couloirs sont **deux appels indépendants** : un bloc et une session ne partagent jamais une colonne. La demi-largeur est une règle de rendu, appliquée après le calcul.

**2. Arithmétique du glisser**, `src/features/calendar/blockDrag.ts` :

```ts
export function snapToStep(ms: number, stepMs: number): number
export function dragToStart(args: {
  originalStart: number
  deltaPx: number
  pxPerMs: number
  range: PeriodRange
  stepMs: number
}): number
```

Accrochage au quart d'heure (`stepMs = 900_000`).

**Bornage : le début seulement, jamais la fin.** Un bloc de deux heures tiré à 23h30 garde sa durée et ressort tronqué à droite — le `clippedEnd` que C1 dessine déjà. Le raccourcir en douce serait une écriture que le geste n'a pas demandée.

**3. Validation.** `validateEntry` (`src/features/tasks/timeEntry.ts`) fait déjà les contrôles utiles, dont la garde contre un champ vidé qui produirait `NaN` — la corruption silencieuse rattrapée au sous-projet B. Un seul point diverge : elle rejette `starts-in-future`, alors qu'un bloc planifié est dans le futur par nature. Elle gagne donc une option :

```ts
validateEntry(draft, now, { allowFuture: true })
```

Les tests existants gardent leur sens ; C2 couvre la nouvelle branche.

**4. Cascades**, en fonctions pures aux côtés de `reassignSessions` : `removeBlocksOfTask(blocks, taskId)` et `reassignBlocks(blocks, taskId, projectId)`.

## UI

`src/features/calendar/DayGrid.tsx` et `.css`, étendus.

- **Deux couloirs** dans le canvas, prévu à gauche, réel à droite, deux étiquettes discrètes en tête. Hauteur inchangée à 48 px/heure — sans poignées, rien n'oblige à l'épaissir.
- **Bloc planifié** : contour pointillé à la couleur du projet, fond transparent. Une session reste pleine. La différence entre intention et fait se voit sans lire.
- **Créer** : appui sur un créneau vide du couloir gauche → panneau portant `TaskPicker`, heure de début pré-remplie sur le quart d'heure touché, durée pré-remplie à `TimerSettings.focusMinutes` — pas une constante : bloquer 25 min quand les sessions durent 50 min serait faux dès le premier bloc.
- **Déplacer**, en Pointer Events :
  - `pointerdown` → `setPointerCapture`, origine retenue
  - seuil de **4 px** avant de basculer en glisser, pour que l'appui simple continue d'ouvrir le panneau
  - `pointermove` → position fantôme via `dragToStart`, rien n'est écrit
  - `pointerup` → un seul `moveBlock`
  - `pointercancel` et `Échap` → retour à l'origine, aucune écriture
- **Modifier ou supprimer** : appui sur un bloc → panneau avec le titre de la tâche, champ heure de début, champ durée, bouton démarrer, bouton supprimer. La suppression reprend la confirmation à deux temps de `TaskTimeEntries`.
- **Démarrer** : `src/lib/timerTaskStore.ts`, motif `useSyncExternalStore` de `settingsStore.ts`. Le bloc y écrit son `taskId`, l'app bascule sur l'écran minuteur, `TimerScreen` lit le store au montage. `selectedTaskId` reste un `useState` local : le store injecte une valeur d'amorçage, il ne le remplace pas.

## i18n

Nouvelles clés sous `calendar.*` dans `src/i18n/fr.json` et `src/i18n/en.json`, les deux langues dans le même commit :

`calendar.planned`, `calendar.actual`, `calendar.newBlock`, `calendar.blockStart`, `calendar.blockDuration`, `calendar.startTimer`, `calendar.deleteBlock`, `calendar.confirmDelete`, `calendar.blockFailed`.

## Erreurs et cas limites

- **Bloc à cheval sur la frontière de journée** : il appartient à la fenêtre qui contient son début, tronqué à droite. Même règle que les sessions — sinon un bloc s'afficherait sur deux jours.
- **Blocs qui se chevauchent** : autorisé, colonnes côte à côte dans leur couloir. Se planifier deux choses à la même heure est une information, pas une erreur.
- **Tâche terminée** : le bloc reste, atténué. Il dit ce qui était prévu.
- **Écriture échouée** : retour à l'état d'avant, message affiché. Aucun optimisme, comme `attachToTask`.
- **Jour de 23 ou 25 heures** : `pxPerMs` se déduit de la durée réelle de la fenêtre, jamais de 24 h en dur.
- **Planifier dans le passé** : autorisé. La navigation n'a pas de borne et corriger le plan d'hier est légitime.
- **Plafond de 500 opérations d'un `writeBatch`** : la cascade de `deleteTask` s'y ajoute. Dette déjà connue côté sessions, rapprochée sans être créée.
- **localStorage** : lecture ponctuelle sans abonnement, la grille peut retarder sur une édition faite ailleurs. Trait de famille de tous les hooks de session.

## Tests

Vitest, sur le pur uniquement :

- `layoutSpans` : les 24 tests de C1 conservés tels quels ; plus la preuve que deux appels indépendants ne partagent jamais de colonne.
- `blockDrag` : `snapToStep` — arrondi au plus proche, delta négatif, valeur pile sur un pas. `dragToStart` — début borné dans la fenêtre, fin jamais bornée, delta nul rend l'identité, fenêtres de 23 h et 25 h.
- `validateEntry` : futur accepté sous `allowFuture`, refusé sans, `NaN` refusé dans les deux cas.
- Cascades : `removeBlocksOfTask` et `reassignBlocks`, comme `reassignSessions` l'est déjà.

**Non couvert, et assumé** : le geste lui-même — seuil de 4 px, capture du pointeur, annulation. C'est la limite de la contrainte « aucune nouvelle dépendance », et la raison pour laquelle toute l'arithmétique sort du composant.

## Hors périmètre

Le défilement automatique quand on tire un bloc hors de l'écran (la fenêtre fait 1152 px). La récurrence. Le glisser d'une tâche depuis un panneau latéral. La vue semaine. La comparaison chiffrée prévu vs réel — c'est D.
