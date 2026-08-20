import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import { useProjects } from '@/hooks/useProjects'
import { useTasks } from '@/hooks/useTasks'
import { MatrixScreen } from '@/features/matrix/MatrixScreen'
import { ProjectSelector } from './ProjectSelector'
import { ProjectModal } from './ProjectModal'
import { TaskList } from './TaskList'
import { TaskModal, type TaskDraft } from './TaskModal'
import type { Task } from './types'
import { AddTaskInput } from './AddTaskInput'
import './TasksScreen.css'

type TasksView = 'list' | 'matrix'

export function TasksScreen() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const uid = user?.uid ?? null

  const { projects, addProject, updateProject, deleteProject } = useProjects(uid)
  const [selectedId, setSelectedId] = useState('all')
  const { tasks, addTask, updateTask, toggleComplete, deleteTask } = useTasks(uid, selectedId)
  const [showModal, setShowModal] = useState(false)
  const [view, setView] = useState<TasksView>('list')
  const [openTask, setOpenTask] = useState<Task | null | undefined>(undefined)


  const selectedProject = projects.find((p) => p.id === selectedId)
  const accentColor = selectedProject?.color ?? 'var(--xh-focus)'

  const projectColors = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p.color])),
    [projects],
  )

  // Project the next task lands in: follows the selected tab by default,
  // but stays wherever the user last pointed the picker.
  const [targetProjectId, setTargetProjectId] = useState('')
  useEffect(() => {
    const fallback = projects.find((p) => p.isInbox)?.id ?? projects[0]?.id ?? ''
    setTargetProjectId(selectedId === 'all' ? fallback : selectedId)
  }, [selectedId, projects])

  const targetColor = projectColors[targetProjectId] ?? accentColor

  async function handleSaveTask(draft: TaskDraft) {
    if (openTask) {
      await updateTask(openTask.id, {
        title: draft.title,
        notes: draft.notes,
        projectId: draft.projectId,
        quadrant: draft.quadrant,
        dueDate: draft.dueDate,
        subtasks: draft.subtasks,
      })
    } else {
      await addTask(draft.title, draft.projectId, draft.quadrant, draft.dueDate, draft.subtasks)
    }
    setOpenTask(undefined)
  }

  async function handleDeleteOpenTask() {
    if (openTask) { await deleteTask(openTask.id) }
    setOpenTask(undefined)
  }


  return (
    <div className="tasks-screen">
      <div className="tasks-screen__topbar">
        <h1 className="tasks-screen__title">{t('nav.tasks')}</h1>
        <button
            className="tasks-screen__new"
            onClick={() => setOpenTask(null)}
          >
            {t('tasks.newTask')}
          </button>
          <div className="tasks-screen__toggle">
          <button
            className={`tasks-toggle__btn ${view === 'list' ? 'tasks-toggle__btn--active' : ''}`}
            onClick={() => setView('list')}
          >
            {t('tasks.viewList')}
          </button>
          <button
            className={`tasks-toggle__btn ${view === 'matrix' ? 'tasks-toggle__btn--active' : ''}`}
            onClick={() => setView('matrix')}
          >
            {t('tasks.viewMatrix')}
          </button>
        </div>
      </div>

      {view === 'list' && (
        <>
          <ProjectSelector
            projects={projects}
            selected={selectedId}
            onSelect={setSelectedId}
            onManage={() => setShowModal(true)}
          />

          <div className="tasks-screen__list">
            <TaskList
              tasks={tasks}
              projectColors={projectColors}
              fallbackColor={accentColor}
              onToggle={toggleComplete}
              onDelete={deleteTask}
              onOpen={(task) => setOpenTask(task)}
            />
          </div>

          <AddTaskInput
            projects={projects}
            projectId={targetProjectId}
            onProjectChange={setTargetProjectId}
            onAdd={(title) => addTask(title, targetProjectId)}
            accentColor={targetColor}
          />
        </>
      )}

      {view === 'matrix' && (
        <div className="tasks-screen__matrix">
          <MatrixScreen />
        </div>
      )}

      {openTask !== undefined && (
        <TaskModal
          task={openTask}
          projects={projects}
          defaultProjectId={targetProjectId}
          onSave={handleSaveTask}
          onDelete={openTask ? handleDeleteOpenTask : undefined}
          onClose={() => setOpenTask(undefined)}
        />
      )}

      {showModal && (
        <ProjectModal
          projects={projects}
          onAdd={addProject}
          onUpdate={updateProject}
          onDelete={deleteProject}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
