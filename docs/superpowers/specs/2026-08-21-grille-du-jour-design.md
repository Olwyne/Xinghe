# Grille du jour (sous-projet C1)

Date : 2026-08-21
Statut : validé, prêt pour le plan d'implémentation

## Contexte

Le sous-projet B a fait des sessions la seule source du temps d'une tâche, corrigeable et complétable à la main depuis le modal de tâche. Deux manques en sont sortis :

- les sessions **sans tâche** — celles que le minuteur crée quand aucune tâche n'est sélectionnée — restent hors de portée : on ne peut ni les voir ni les rattacher après coup ;
- rien ne montre une journée **à son échelle réelle** : on lit des totaux, jamais la forme du temps passé.

Ce sous-projet livre une grille horaire du jour, en lecture, qui répond aux deux.

## Découpage de C

« Calendrier et time-blocking » est trop gros pour un seul spec. Trois morceaux, chacun livrable seul :

| | Morceau | Contenu | Dépend de |
|---|---|---|---|
| **C1** | **Grille du jour** (ce spec) | vue jour affichant les sessions à leur heure réelle ; rattachement d'une session orpheline à une tâche | B ✓ |
| C2 | Blocs planifiés | entité « bloc », glisser-déposer d'une tâche sur un créneau, déplacement, redimensionnement | C1 |
| C3 | Planifié vs réel | superposition du prévu et du fait, écarts | C2 — se confond largement avec D |

**Planifier et mesurer sont deux choses différentes.** Une `Session` enregistre du temps passé ; un bloc « demain 8h-9h » est une intention qui peut ne jamais se réaliser. Planifier en créant des sessions à l'avance les ferait compter immédiatement comme du temps travaillé, et priverait D de toute comparaison. C2 introduira donc une entité distincte — hors périmètre ici.

Spec de B : `docs/superpowers/specs/2026-08-20-temps-passe-editable-design.md`.

## Décisions de conception

| # | Question | Décision |
|---|---|---|
| 1 | Périmètre | **C1 seul.** Le glisser-déposer sur une grille jamais affichée, ce sont deux inconnues à la fois. |
| 2 | Quelle vue | **Jour seulement**, avec navigation. La vue semaine prend son sens avec des blocs planifiés, pas pour relire du temps passé. |
| 3 | Emplacement | **Troisième vue de l'écran Tâches** (`liste \| matrice \| jour`) et entrée dédiée dans la barre latérale desktop — le motif que la matrice suit déjà. |
| 4 | Plage horaire | **La journée telle que l'app la définit** : de `dayStart` à `dayStart + 24 h`. Toute autre découpe créerait des sessions comptées un jour et affichées un autre. |
| 5 | Chevauchements | **Colonnes côte à côte.** La seule des options envisagées qui reste une surface de dépôt exploitable pour C2. |
| 6 | Actions | **Réutiliser l'existant** : un bloc rattaché ouvre le modal de sa tâche, où vit toute l'édition de B ; un bloc orphelin ouvre le sélecteur de tâche. Aucune deuxième surface d'édition. |
| 7 | Débordement | **Tronquer à la fin de la fenêtre**, avec un liseré sur le bord bas. Une session n'apparaît que sur le jour de son **début** : celle qui commence à 3 h 50 est dessinée sur son propre jour et coupée au bas de cette grille, jamais reprise en haut du jour suivant. |

## Modèle de données

**Aucun changement.** La grille lit `startedAt` et `durationMs` ; le rattachement écrit `taskId` et `projectId`. C'est le bénéfice direct de B : une saisie manuelle et une session mesurée ont la même forme, donc la grille les affiche identiquement, au pictogramme d'origine près.

`periodRange('day', dayStartHour, référence)` (`src/lib/time.ts`) accepte déjà un timestamp de référence arbitraire. Naviguer d'un jour à l'autre revient à décaler cette référence : aucune nouvelle fonction de fenêtrage, et la grille hérite mécaniquement de la frontière de journée configurable.

## Logique pure de disposition

`src/features/calendar/dayLayout.ts`, sans React ni Firestore :

```ts
export interface PositionedSession {
  session: Session
  /** Fraction de la fenêtre : 0 = début de la grille, 1 = fin. */
  top: number
  height: number
  /** Colonne occupée, et nombre de colonnes du groupe qui se chevauche. */
  column: number
  columnCount: number
  /** La session déborde après la fin de la fenêtre. Il n'existe pas d'équivalent
   *  en début : une session incluse commence par définition dans la fenêtre. */
  clippedEnd: boolean
}

export function layoutDaySessions(
  sessions: Session[],
  range: PeriodRange,
): PositionedSession[]
```

Trois responsabilités : borner chaque session à la fenêtre en marquant les côtés tronqués ; grouper les sessions qui se recouvrent ; répartir la largeur dans chaque groupe. L'algorithme de colonnes est classique — parcours par début croissant, placement dans la première colonne libre du groupe courant, `columnCount` égal au maximum atteint par le groupe.

Tout le risque du sous-projet est ici, et c'est du calcul pur.

## Accès aux données

`src/hooks/useDaySessions.ts` :

```ts
useDaySessions(uid: string | null, reference: number): {
  sessions: Session[]
  range: PeriodRange
  loading: boolean
  attachToTask: (sessionId: string, task: Task) => Promise<void>
}
```

Requête `where('startedAt', '>=', start)`, `where('startedAt', '<', end)`, `where('type', '==', 'focus')` — la forme que `useWeekSessions` émet déjà, servie par l'index composite `(type, startedAt)` **déjà déclaré** dans `firestore.indexes.json`. Aucun nouvel index. Repli `localStorage` sur la clé `xinghe-sessions`, comme les hooks voisins.

`attachToTask` écrit `taskId` **et** `projectId` (celui de la tâche) dans la même mise à jour : c'est l'invariant que B applique sur ses deux chemins — le temps d'une tâche est compté dans le projet de cette tâche. Rattacher une orpheline à une tâche de « Thèse » la fait donc compter dans les objectifs de « Thèse ».

## UI

`src/features/calendar/DayGrid.tsx` et `.css`, monté comme troisième vue de l'écran Tâches et comme entrée de la barre latérale desktop.

- **Règle horaire** à gauche, une graduation par heure depuis `dayStart`, 24 heures avec défilement. Un trait discret marque l'heure courante quand le jour affiché est aujourd'hui.
- **Blocs** positionnés en pourcentage de la hauteur, teintés de la couleur du projet, portant le titre de la tâche — ou un libellé « sans tâche », visuellement plus sobre, pour les orphelines. Le pictogramme ⏱ marque une session du minuteur, comme dans la liste du modal.
- **Bord tronqué** : liseré en bas du bloc quand `clippedEnd`.
- **Toucher un bloc** : session rattachée → modal de sa tâche, où l'édition de B se trouve déjà. Session orpheline → `TaskPicker`, réutilisé depuis l'écran du minuteur (`src/features/timer/TaskPicker.tsx` prend `tasks`, `projectColors`, `selectedId`, `onSelect`).
- **Navigation** : jour précédent, jour suivant, retour à aujourd'hui. Date affichée en clair.
- **États** : squelettes au chargement ; une journée vide affiche la grille nue avec un message discret — la grille elle-même est l'information.

## i18n

Nouvelles clés sous `calendar.*` dans `src/i18n/fr.json` et `src/i18n/en.json`, les deux langues dans le même commit :

`calendar.day`, `calendar.today`, `calendar.previousDay`, `calendar.nextDay`, `calendar.noTask`, `calendar.attachToTask`, `calendar.emptyDay`, `calendar.continuesAfter`, `calendar.attachFailed`.

Dates et heures passent par `Intl.DateTimeFormat` avec `i18n.language`, comme la liste des entrées de B — aucune chaîne de format écrite à la main.

## Erreurs et cas limites

- **Hors ligne / Firebase non configuré** : lecture et écriture via `localStorage`, clé `xinghe-sessions`.
- **Rattachement qui échoue** : l'erreur remonte, le bloc reste orphelin, un message s'affiche. Pas de rattachement optimiste.
- **Chargement** : squelettes de blocs, jamais une grille vide transitoire qui laisserait croire à une journée sans travail.
- **Session de moins d'une minute** : hauteur plancher, sinon le bloc devient un trait intouchable. La durée réelle reste dans son libellé. Le plancher s'applique **au rendu seulement**, après le calcul des colonnes : il ne modifie ni les groupes de chevauchement ni la largeur des blocs. Un bloc ainsi rehaussé peut donc mordre visuellement sur le suivant — c'est assumé, une session de trente secondes est un artefact plutôt qu'un créneau.
- **Groupe très chargé** : au-delà de quatre colonnes, les blocs sont trop étroits pour un libellé. Ils gardent leur couleur et restent touchables, le titre passe en infobulle. Pas de repli « +2 autres » : cela masquerait les sessions qu'on cherche justement à corriger.
- **Tâche supprimée depuis** : la session garde son `taskId` mais aucune tâche ne correspond. Le bloc s'affiche comme orphelin et peut être rattaché ailleurs.
- **Journée de 23 ou 25 heures** (changement d'heure) : la fenêtre vient de `periodRange`, déjà calendaire. La grille dessine 23 ou 25 graduations ce jour-là, et les positions restent proportionnelles à la durée réelle de la fenêtre.
- **Navigation loin dans le passé** : aucune borne. Chaque changement de jour relance une requête ; le volume lu reste celui d'une journée.

## Tests

Vitest, sur `dayLayout.ts` :

- **Appartenance et troncature** : une session commencée avant la fenêtre en est exclue, même si elle empiète dessus — elle appartient au jour précédent ; une session commencée exactement au début est incluse ; une session commencée dedans et terminée après est tronquée avec `clippedEnd` ; positions bornées à `[0, 1]`.
- **Colonnes** : deux sessions disjointes prennent chacune toute la largeur ; deux qui se recouvrent se partagent en deux ; trois en chaîne (A recouvre B, B recouvre C, A et C disjointes) — le cas qui distingue un vrai algorithme de groupes d'un simple comptage ; une session entièrement incluse dans une autre.
- **Positions** : une heure sur une fenêtre de 24 h occupe 1/24 de la hauteur ; une fenêtre de 23 h ou 25 h donne des fractions cohérentes.
- **Ordre** : résultat trié par début, déterministe même à `startedAt` égal.
- **Hauteur minimale** : `layoutDaySessions` rend la `height` proportionnelle exacte, sans plancher — le plancher est une règle de rendu appliquée par `DayGrid`. Le test vérifie donc qu'une session de 30 secondes ressort avec sa fraction réelle et que sa présence ne modifie pas les colonnes de ses voisines.

Pas de test de rendu : ni `jsdom` ni `@testing-library/react`, la règle « aucune nouvelle dépendance » tient. `DayGrid` ne fait que placer des `<div>` à partir du résultat de `layoutDaySessions`.

## Hors périmètre

Les blocs planifiés, le glisser-déposer, le redimensionnement (C2). La vue semaine. La comparaison planifié vs réel (D). La création d'une session depuis la grille et sa suppression depuis la grille — les deux vivent dans le modal de tâche, où B les a mises.
