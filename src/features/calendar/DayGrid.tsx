import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import { useTasks } from '@/hooks/useTasks'
import { useProjects } from '@/hooks/useProjects'
import { useDaySessions } from '@/hooks/useDaySessions'
import { useDayBlocks } from '@/hooks/useDayBlocks'
import { useTimerSettings } from '@/hooks/useTimerSettings'
import { TaskPicker } from '@/features/timer/TaskPicker'
import { BlockPanel, type BlockPanelMode } from './BlockPanel'
import { snapToStep, clampStartToRange, dragToStart, SNAP_STEP_MS } from './blockDrag'
import { layoutDaySessions, layoutSpans } from './dayLayout'
import type { Task } from '@/features/tasks/types'
import type { PlannedBlock } from './types'
import './DayGrid.css'

const HOUR = 3_600_000
/** En deçà, le geste reste un appui et le panneau s'ouvre. */
const DRAG_THRESHOLD_PX = 4

interface DayGridProps {
  /** Ouvre le modal d'une tâche : toute l'édition d'une session y vit déjà. */
  onOpenTask: (task: Task) => void
  onStartTimer: (taskId: string) => void
}

export function DayGrid({ onOpenTask, onStartTimer }: DayGridProps) {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const uid = user?.uid ?? null

  const [reference, setReference] = useState(() => Date.now())
  const { sessions, range, loading: sessionsLoading, attachToTask } = useDaySessions(uid, reference)
  const {
    blocks: plannedBlocks,
    loading: blocksLoading,
    addBlock,
    moveBlock,
    updateBlock,
    removeBlock,
  } = useDayBlocks(uid, reference)
  const { tasks, loading: tasksLoading } = useTasks(uid, 'all')
  const { projects } = useProjects(uid)
  const { settings } = useTimerSettings()

  const [attaching, setAttaching] = useState<string | null>(null)
  const [attachFailed, setAttachFailed] = useState(false)
  const [blockFailed, setBlockFailed] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [panel, setPanel] = useState<BlockPanelMode | null>(null)
  // Un slot vide n'a pas d'identité propre (contrairement à un bloc, keyé sur
  // son id) : deux clics sur le même quart d'heure produisent le même
  // `startedAt`. Ce compteur force quand même un remount, sinon le second
  // clic hérite du brouillon et de l'erreur laissés par le premier panneau.
  const [createSeq, setCreateSeq] = useState(0)
  const plannedLaneRef = useRef<HTMLDivElement | null>(null)
  /** Vrai entre la fin d'un glisser et le clic que le navigateur émet ensuite. */
  const draggedRef = useRef(false)

  /** Bloc en cours de glisser : `start` est la position fantôme, jamais écrite. */
  const [dragging, setDragging] = useState<{
    id: string
    pointerId: number
    originalStart: number
    pointerY: number
    start: number
    moved: boolean
  } | null>(null)

  const projectColors = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p.color])),
    [projects],
  )
  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks])
  const sessionPositions = useMemo(() => layoutDaySessions(sessions, range), [sessions, range])
  // Deux appels séparés, jamais un seul : un bloc planifié et une session ne
  // doivent pas se partager une colonne, ils vivent dans deux couloirs.
  const plannedPositions = useMemo(
    () => layoutSpans(plannedBlocks, range),
    [plannedBlocks, range],
  )

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

  const showNowLine = now >= range.start && now < range.end
  const nowTop = ((now - range.start) / (range.end - range.start)) * 100

  // Ne tourne que si le jour affiché est aujourd'hui : la ligne "now" n'est
  // rendue que dans ce cas, donc un intervalle sur un autre jour serait pur
  // gaspillage. Se coupe au changement de jour et au démontage.
  useEffect(() => {
    if (!showNowLine) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [showNowLine, range.start, range.end])

  // Échap annule un glisser en cours. Monté seulement pendant le geste :
  // aucun écouteur global ne traîne quand la grille est au repos.
  useEffect(() => {
    if (!dragging) return
    function onKey(e: KeyboardEvent) {
      // Le clic de compatibilité qui suit un geste tactile arrive quand même :
      // le supprimer comme après un glisser abouti, sinon il rouvre le panneau
      // que l'utilisateur voulait justement annuler.
      if (e.key === 'Escape') {
        draggedRef.current = true
        setDragging(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dragging])

  // Le bloc tiré peut disparaître en cours de geste (ex. suppression distante
  // pendant qu'un doigt reste posé) : la capture du pointeur saute alors
  // implicitement et le pointerup qui suit ne nous parvient plus, laissant
  // `dragging` bloqué indéfiniment (Minor B). On referme dès que l'id suivi
  // n'est plus dans la liste.
  useEffect(() => {
    if (!dragging) return
    if (!plannedBlocks.some((block) => block.id === dragging.id)) {
      setDragging(null)
    }
  }, [dragging, plannedBlocks])

  function navigate(next: number) {
    // Repartir sans panneau ni message d'échec : ils pointent sur une session
    // qui n'est plus à l'écran une fois qu'on a changé de jour.
    setAttaching(null)
    setAttachFailed(false)
    setBlockFailed(false)
    setPanel(null)
    // Filet de récupération pour un glisser resté bloqué (ex. le bloc tiré a
    // disparu en cours de geste, son pointerup a retargeté sur le couloir
    // sans handler et n'a jamais nettoyé l'état) : changer de jour est le
    // seul point de sortie garanti, autant y remettre `dragging` à zéro
    // (Minor B).
    setDragging(null)
    setReference(next)
  }

  /** Pixels par milliseconde, mesuré sur le couloir réel : les jours de 23 ou
      25 heures n'ont pas la même échelle qu'un jour ordinaire. */
  function lanePxPerMs(): number {
    const rect = plannedLaneRef.current?.getBoundingClientRect()
    if (!rect || rect.height <= 0) return 0
    return rect.height / (range.end - range.start)
  }

  function handleBlockPointerDown(e: React.PointerEvent, block: PlannedBlock) {
    // Repartir propre à chaque nouveau geste : un clic de compatibilité resté
    // en attente d'un geste précédent ne doit pas déteindre sur celui-ci, ni
    // un message d'échec d'un glisser antérieur rester affiché pendant qu'on
    // recommence (Important 1, Important 3).
    draggedRef.current = false
    setBlockFailed(false)
    // Un deuxième doigt qui se pose pendant qu'un glisser est déjà en cours,
    // ou un bouton non-primaire, ne doit jamais démarrer/écraser le geste en
    // cours : un seul pointeur pilote un glisser à la fois (Important 2).
    if (dragging !== null || !e.isPrimary) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging({
      id: block.id,
      pointerId: e.pointerId,
      originalStart: block.startedAt,
      pointerY: e.clientY,
      start: block.startedAt,
      moved: false,
    })
  }

  function handleBlockPointerMove(e: React.PointerEvent) {
    // Lue une fois ici, hors du updater : setDragging peut être rejoué
    // (StrictMode) et l'updater doit rester pur, sans lecture du DOM dedans
    // (Minor 7).
    const pxPerMs = lanePxPerMs()
    setDragging((prev) => {
      if (!prev || e.pointerId !== prev.pointerId) return prev
      const deltaPx = e.clientY - prev.pointerY
      // Sous le seuil, le geste reste un appui : c'est ce qui laisse le tap
      // ouvrir le panneau.
      if (!prev.moved && Math.abs(deltaPx) < DRAG_THRESHOLD_PX) return prev
      const start = dragToStart({
        originalStart: prev.originalStart,
        deltaPx,
        pxPerMs,
        range,
        stepMs: SNAP_STEP_MS,
      })
      return { ...prev, start, moved: true }
    })
  }

  async function handleBlockPointerUp(e: React.PointerEvent, block: PlannedBlock) {
    const current = dragging
    // Un pointeur qui n'est pas celui du glisser en cours (ex. le deuxième
    // doigt) ne doit ni le clore ni écrire quoi que ce soit (Important 2).
    if (!current || e.pointerId !== current.pointerId) return
    e.stopPropagation()
    setDragging(null)
    // Pas de glisser, ou retour au point de départ : c'est un appui, le clic
    // suivant ouvrira le panneau.
    if (!current.moved || current.start === current.originalStart) return
    draggedRef.current = true
    try {
      await moveBlock(block.id, current.start)
      setBlockFailed(false)
    } catch {
      setBlockFailed(true)
    }
  }

  function handleBlockPointerCancel() {
    // Annulation système ou Échap : retour à la position d'origine, sans écriture.
    setDragging(null)
  }

  function openAttach(sessionId: string) {
    // Repartir sans message d'échec : celui d'une tentative précédente ne doit
    // pas s'accrocher à une session différente, ni à une réouverture du panneau.
    setAttachFailed(false)
    setAttaching(sessionId)
  }

  async function handleSelect(sessionId: string, taskId: string | null) {
    const task = taskId ? tasksById.get(taskId) : null
    if (!task) {
      setAttaching(null)
      setAttachFailed(false)
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
        {/* ± 12h depuis le bord de la fenêtre courante, pas ± 24h depuis
            `reference` : un pas fixe en millisecondes peut sauter un jour
            entier autour d'un changement d'heure (cf. useWeekSessions.ts).
            La moitié de la fenêtre voisine atterrit toujours dedans, quelle
            que soit sa durée réelle. */}
        <button
          type="button"
          className="daygrid__navbtn"
          aria-label={t('calendar.previousDay')}
          onClick={() => navigate(range.start - 12 * HOUR)}
        >
          ‹
        </button>
        <span className="daygrid__date">{dayLabel}</span>
        <button
          type="button"
          className="daygrid__navbtn"
          aria-label={t('calendar.nextDay')}
          onClick={() => navigate(range.end + 12 * HOUR)}
        >
          ›
        </button>
        <button
          type="button"
          className="daygrid__today"
          onClick={() => navigate(Date.now())}
        >
          {t('calendar.today')}
        </button>
      </div>

      {attachFailed && <p className="daygrid__error">{t('calendar.attachFailed')}</p>}
      {blockFailed && <p className="daygrid__error">{t('calendar.blockFailed')}</p>}

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

          <div className="daygrid__lanelabels">
            <span>{t('calendar.planned')}</span>
            <span>{t('calendar.actual')}</span>
          </div>

          {sessionsLoading || tasksLoading || blocksLoading ? (
            <>
              <div className="daygrid__skeleton" style={{ top: '20%', height: '8%' }} />
              <div className="daygrid__skeleton" style={{ top: '45%', height: '12%' }} />
            </>
          ) : (
            <>
              {/* Le message de jour vide se superpose aux couloirs plutôt que
                  de les remplacer : sans ça, planifier le premier créneau
                  d'un jour vide — le cas que la fonctionnalité sert d'abord —
                  n'avait aucune cible cliquable. */}
              {sessionPositions.length === 0 && plannedPositions.length === 0 && (
                <p className="daygrid__empty">{t('calendar.emptyDay')}</p>
              )}
              <div
                className="daygrid__lane daygrid__lane--planned"
                ref={plannedLaneRef}
                onPointerDown={() => {
                  // Un geste qui démarre sur un bloc a déjà stoppé la
                  // propagation avant d'arriver ici : ceci ne concerne que
                  // les gestes qui commencent sur le couloir vide. Sans ça,
                  // le drapeau laissé `true` par un glisser tactile juste
                  // terminé sur un bloc avale le tap suivant sur le couloir
                  // vide (Important A).
                  draggedRef.current = false
                }}
                onClick={(e) => {
                  // Un clic sur un bloc existant ne doit pas aussi créer : les
                  // blocs arrêtent la propagation eux-mêmes (Task 8). Mais si
                  // le bloc a disparu entre le pointerup et ce clic de
                  // compatibilité (ex. suppression distante), le clic retombe
                  // sur le couloir lui-même : le drapeau de suppression le
                  // rattrape aussi ici (Minor 4).
                  if (draggedRef.current) {
                    draggedRef.current = false
                    return
                  }
                  const lane = plannedLaneRef.current
                  if (!lane) return
                  const rect = lane.getBoundingClientRect()
                  if (rect.height <= 0) return
                  const fraction = (e.clientY - rect.top) / rect.height
                  const raw = range.start + fraction * (range.end - range.start)
                  const snapped = range.start + snapToStep(raw - range.start, SNAP_STEP_MS)
                  // Même bornage que le tiré (dragToStart) : un clic tout en
                  // bas de la fenêtre donne fraction≈1, donc un snapped qui
                  // vaut range.end — hors fenêtre de useDayBlocks, le bloc
                  // atterrirait silencieusement sur le jour suivant.
                  const startedAt = clampStartToRange(snapped, range, SNAP_STEP_MS)
                  setCreateSeq((n) => n + 1)
                  setPanel({ kind: 'create', startedAt })
                }}
              >
                {plannedPositions.map((positioned) => {
                  const block = positioned.item
                  const task = tasksById.get(block.taskId)
                  const color = projectColors[block.projectId] ?? 'var(--xh-text-faint)'
                  const width = 100 / positioned.columnCount
                  const ghost = dragging?.id === block.id && dragging.moved ? dragging.start : null
                  const shownTop =
                    ghost === null
                      ? positioned.top
                      : (ghost - range.start) / (range.end - range.start)
                  // Le fantôme garde la hauteur et les colonnes d'avant le
                  // glisser (Minor 6, refaire tout l'algorithme de colonnes
                  // pour une position provisoire serait disproportionné) mais
                  // le marqueur de troncature, lui, doit suivre la position
                  // affichée : sinon un bloc tiré vers le bas de la fenêtre
                  // perd son repère de dépassement.
                  const clippedEnd =
                    ghost === null ? positioned.clippedEnd : ghost + block.durationMs > range.end
                  return (
                    <button
                      type="button"
                      key={block.id}
                      className={`daygrid__planned ${
                        clippedEnd ? 'daygrid__block--clipend' : ''
                      } ${task?.completed ? 'daygrid__planned--done' : ''} ${
                        ghost !== null ? 'daygrid__planned--dragging' : ''
                      }`}
                      style={{
                        top: `${shownTop * 100}%`,
                        height: `${positioned.height * 100}%`,
                        left: `${positioned.column * width}%`,
                        width: `${width}%`,
                        borderColor: color,
                        color,
                      }}
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
                    >
                      <span className="daygrid__blocktitle">
                        {task ? task.title : t('calendar.noTask')}
                      </span>
                    </button>
                  )
                })}
              </div>

              <div className="daygrid__lane daygrid__lane--actual">
                {sessionPositions.map((block) => {
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
                        else openAttach(block.session.id)
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
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {panel && (
        <BlockPanel
          // Clé sur l'identité de la cible : cliquer un bloc B alors que le
          // panneau de A est ouvert saute onClose (stopPropagation), donc sans
          // cette clé React réutiliserait l'instance et son état interne
          // (brouillon, erreur, suppression armée) resterait celui de A. En
          // création, `startedAt` seul ne suffit pas : recliquer le même
          // quart d'heure redonne la même valeur, donc `createSeq` force le
          // remount pour repartir d'un brouillon neuf.
          key={
            panel.kind === 'edit'
              ? `edit-${panel.block.id}`
              : `create-${panel.startedAt}-${createSeq}`
          }
          mode={panel}
          range={range}
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
