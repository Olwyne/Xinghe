# Objectifs de temps par projet (sous-projet A)

Date : 2026-08-20
Statut : validé, prêt pour le plan d'implémentation

## Contexte

Xinghe suit aujourd'hui le temps via une collection `sessions` (`projectId`, `taskId`, `durationMs`) et un objectif quotidien **global** unique (`DailyGoal.targetMinutes`, hook `useDailyGoal`). Aucune cible n'existe au niveau du projet. L'onglet « Objectifs » (`App.tsx:35`) ne rend que `HabitsScreen`.

Ce spec couvre le sous-projet **A** d'un ensemble plus large de gestion du temps, décomposé ainsi :

| Sous-projet | Contenu | Dépend de |
|---|---|---|
| **A — Objectifs de temps par projet** | cible jour/semaine/mois par projet, progression alimentée par les sessions | — |
| B — Temps passé éditable | ajustement manuel du temps sur une tâche, entrées de temps manuelles | — |
| C — Calendrier / time-blocking | drag & drop d'une tâche sur un créneau horaire | B |
| D — Stats unifiées | objectif vs planifié vs réel | A + B + C |

L'ordre d'implémentation retenu est B → A → C → D sur le fond, mais A est traité en premier à la demande de l'utilisateur : il est autonome et immédiatement visible. A ne dépend d'aucun élément de B.

## Décisions de conception

| # | Question | Décision |
|---|---|---|
| 1 | Cadences simultanées ? | **Une seule cadence par projet** (`day` \| `week` \| `month`). Deux cibles concurrentes produisent des messages contradictoires. |
| 2 | Sort de l'objectif global ? | **Conservé**, indépendant des cibles projets, avec un **avertissement non bloquant** en cas de sur-allocation. |
| 3 | Unité de comparaison ? | **Minutes/jour**, diviseurs fixes : semaine ÷ 7, mois ÷ 30. |
| 4 | Source de la progression ? | **Requête directe sur `sessions`**, encapsulée derrière `useProjectProgress` pour permettre un passage ultérieur à des rollups sans toucher à l'UI. |
| 5 | Stockage de la cible ? | **Champ sur le doc `Project`**. Pas de collection `commitments` (YAGNI). Pas d'historique des cibles. |
| 6 | Fin de période ? | **Remise à zéro sèche**, pas de report de déficit. |
| 7 | Surfaces d'affichage ? | `ProjectModal` (édition), écran **Objectifs** (section dédiée), écran **Stats** (cible vs réel). |

## Modèle de données

`src/features/tasks/types.ts` :

```ts
export type TargetPeriod = 'day' | 'week' | 'month'

export interface TimeTarget {
  period: TargetPeriod
  targetMinutes: number
}

export interface Project {
  // ...existant
  timeTarget?: TimeTarget | null
}
```

`timeTarget` absent ou `null` = pas de cible ; le projet n'apparaît pas dans la section Objectifs. Rétrocompatible : aucune migration, les projets existants restent valides.

`Session` (`src/features/goals/types.ts`) gagne `endedAt: number` (voir « Correctifs »). `DailyGoal` est inchangé.

## Calcul de la progression

Hook unique `src/hooks/useProjectProgress.ts`, seule porte d'entrée pour l'UI :

```ts
useProjectProgress(uid: string | null): {
  byProject: Record<string, {
    periodStart: number
    periodEnd: number
    spentMinutes: number
    targetMinutes: number
    ratio: number        // borné à 1 pour l'affichage, ratio brut également exposé
  }>
  allocation: {
    totalTargetPerDay: number   // somme des cibles normalisées
    globalPerDay: number        // DailyGoal.targetMinutes
    isOverAllocated: boolean
  }
  loading: boolean
}
```

**Fenêtres de période**, toutes calées sur `dayStartHour` (frontière de journée configurable, défaut 4 h) :

- `day` — la journée courante selon la frontière configurable
- `week` — du lundi (frontière incluse) au dimanche
- `month` — du 1er du mois (frontière incluse) au dernier jour

Une seule requête Firestore couvrant la fenêtre **la plus large parmi les cadences réellement utilisées**, puis découpage en mémoire par projet et par fenêtre. Sans cible mensuelle active, on ne lit jamais 31 jours de sessions.

**Normalisation** (avertissement de sur-allocation) : `day → ×1`, `week → ÷7`, `month → ÷30`.
`isOverAllocated = Σ(cibles normalisées en min/jour) > DailyGoal.targetMinutes`.

**Remise à zéro** : implicite. La progression est toujours recalculée sur la fenêtre courante, donc aucune logique de reset ni tâche planifiée n'est nécessaire.

## Correctifs ciblés dans l'existant

Deux défauts existants rendraient les objectifs faux. Ils sont dans le périmètre de A ; aucun autre refactoring n'est entrepris.

1. **`recordSession` écrit `startedAt: Date.now()` à la fin de la session** (`src/hooks/useTodaySessions.ts`) — `startedAt` contient donc en réalité l'heure de fin. `TimerScreen` connaît le vrai début. Correction : signature `recordSession(projectId, durationMs, startedAt, taskId?)`, et ajout de `endedAt`. Une session est rattachée à la période de son **début**. Les documents existants conservent leur `startedAt` erroné ; l'écart est borné à une durée de session et aucune migration n'est faite.

2. **`useTodaySessions` et `useWeekSessions` utilisent `setHours(0, 0, 0, 0)`**, ignorant la frontière de journée configurable. Les deux passent par un helper partagé `periodRange(period, dayStartHour, now)` extrait dans `src/lib/time.ts`, également consommé par `useProjectProgress`. Une seule définition de « aujourd'hui » dans toute l'application.

## UI

### Édition — `src/features/tasks/ProjectModal.tsx`

La ligne en mode édition gagne une zone sous le nom et les couleurs : champ nombre (heures + minutes) et sélecteur de cadence à trois segments *Jour / Semaine / Mois*, plus un bouton « Aucune cible » remettant `timeTarget` à `null`.

Le type de `onUpdate` s'élargit à `Partial<Pick<Project, 'name' | 'color' | 'icon' | 'timeTarget'>>`. `updateProject` dans `useProjects` accepte déjà un `Partial` — aucun changement côté hook.

Validation : minutes entières, minimum 1, maximum 1 440 (jour), 10 080 (semaine), 44 640 (mois) — soit 24 h par jour de la période. Une valeur hors bornes désactive la sauvegarde plutôt que de corriger en silence.

### Écran Objectifs

`HabitsScreen` reste inchangé. On ajoute :

- `src/features/goals/TimeTargetsSection.tsx` — la section des cibles de temps
- `src/features/goals/GoalsScreen.tsx` — conteneur rendant `TimeTargetsSection` puis `HabitsScreen`

`App.tsx:35` passe de `<HabitsScreen />` à `<GoalsScreen />`. Habitudes et cibles de temps restent deux composants indépendants, testables séparément.

Contenu, une ligne par projet ayant une cible :

- pastille couleur, icône, nom du projet
- barre de progression teintée de `project.color`, `spent / target` en clair (via `formatMinutesToHours`)
- libellé de fenêtre : « aujourd'hui », « cette semaine », « ce mois-ci »
- dépassement de cible : la barre reste pleine, le chiffre passe en accent. Un dépassement se félicite, il ne s'alarme pas.

En tête de section, si `isOverAllocated` : bandeau discret, ton informatif — « Tes objectifs cumulent 4 h 30 par jour, au-delà de ton objectif global de 3 h. » Jamais bloquant, jamais de modale.

État vide (aucun projet n'a de cible) : une phrase et un renvoi vers la gestion des projets.

### Écran Stats

Carte « Objectifs par projet » sur le modèle des `stats-card` existantes : par projet, réel/cible sur la période courante et ratio en pourcentage. Consomme le même `useProjectProgress` — aucun calcul dupliqué.

## i18n

Nouvelles clés sous `goals.*` dans `src/i18n/fr.json` et `src/i18n/en.json`, les deux langues remplies dans le même commit :

`goals.timeTargets`, `goals.period.day|week|month`, `goals.noTarget`, `goals.setTarget`, `goals.overAllocated` (interpolée avec `{{total}}` et `{{global}}`), `goals.thisDay|thisWeek|thisMonth`, `goals.empty`.

## Erreurs et cas limites

- **Hors ligne / Firebase non configuré** : `useProjectProgress` lit les sessions via le même fallback `localStorage` que `useTodaySessions` (clé `xinghe-sessions`). Le mode dev sans Firebase reste pleinement fonctionnel.
- **Chargement** : `loading` reste vrai tant que projets ou sessions n'ont pas répondu. Squelettes de barres — jamais un « 0 / 6 h » transitoire qui laisserait croire à une régression.
- **Projet supprimé, sessions orphelines** : les sessions dont le `projectId` ne correspond à aucun projet sont ignorées dans `byProject`. Elles continuent de compter dans les totaux globaux existants.
- **`DailyGoal` absent ou à 0** : `isOverAllocated` reste faux, aucun avertissement.
- **Changement de cadence** : progression recalculée sur la nouvelle fenêtre à la volée. Rien n'est stocké, donc rien n'est perdu.
- **Session traversant une frontière de période** : rattachée à sa période de début, jamais découpée.

## Tests

Vitest, concentrés sur la logique pure :

- `periodRange()` : frontière de journée à 4 h (une session à 2 h du matin appartient à la veille), semaine démarrant le lundi, mois de 28/30/31 jours, passage à l'heure d'été.
- Agrégation `byProject` : plusieurs projets et cadences mêlés, sessions hors fenêtre exclues, sessions orphelines ignorées.
- Normalisation et `isOverAllocated` : juste en dessous du seuil, juste au-dessus, `DailyGoal` absent.
- Rendu de `TimeTargetsSection` : état vide, état nominal, bandeau de sur-allocation.

## Hors périmètre

Tout ce qui relève de B, C et D. En particulier : édition manuelle du temps passé sur une tâche, entrées de temps manuelles, durée estimée, calendrier et time-blocking, comparaison planifié vs réel.

Également écarté pour A : historique des cibles, report de déficit (roll-over), plafond anti-burnout, collection `commitments` unifiant objectifs et habitudes, rollups quotidiens d'agrégation.

## Annexe — backlog inspiré de TickTick

Idées relevées lors du brainstorming, hors périmètre de ce spec, conservées pour de futurs cycles.

**Bloqué par la contrainte free-tier** (pas de serveur, pas de Cloud Functions) : rappels par e-mail, rappels de localisation, notifications push en arrière-plan, synchronisation bidirectionnelle Google Calendar, collaboration et partage de listes.

**Fort retour, coût faible (client pur)**

- Tags transverses aux projets — seul axe actuel : `projectId`. Permettrait des stats projet × tag.
- Filtres et vues sauvegardées : « Aujourd'hui », « 7 prochains jours », « Sans date ».
- Analyse en langage naturel à la saisie : `réviser chap 3 demain 14h 2p #études` → date, heure, pomodoros, projet. Parser FR/EN maison.
- Palette de commandes et raccourcis clavier.
- Estimation en pomodoros (`estimatePomos`) — pivot vers C et D.
- Vue Kanban, groupée par projet, tag ou priorité (réutilise le drag & drop de C).
- Compte à rebours vers une échéance (« J-14 avant l'examen »).
- Priorité P1–P4, distincte du quadrant Eisenhower, pour le tri intra-quadrant.

**Retour moyen**

- Tâches récurrentes (génération idempotente côté client, déjà prévue à l'origine).
- Vue chronologique / timeline — sous-ensemble de C, à ne pas implémenter deux fois.
- Rappels in-app en premier plan (Notification API, onglet ouvert).
- Abonnement iCal en lecture seule pour afficher un calendrier externe sans OAuth serveur.

**Écarté (YAGNI)** : saisie vocale, widgets mobiles, thèmes multiples (l'app est dark-only par direction artistique), fonds de listes, fuseaux horaires, intégrations navigateur et messagerie.

**Différenciateur** : TickTick sépare pomodoro et objectifs. L'architecture de Xinghe rend naturelle la boucle complète **objectif → planification → temps réel → écart** : « objectif 6 h/semaine sur Thèse ; 4 h planifiées ; 2 h 10 réalisées ; déficit 3 h 50 ». C'est le produit ; le reste est du confort.
