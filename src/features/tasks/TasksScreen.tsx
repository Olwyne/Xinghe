import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import { useProjects } from '@/hooks/useProjects'
import { useTasks } from '@/hooks/useTasks'
import { MatrixScreen } from '@/features/matrix/MatrixScreen'
import { ProjectSelector } from './ProjectSelector'
import { ProjectModal } from './ProjectModal'
import { TaskList } from './TaskList'
import { AddTaskInput } from './AddTaskInput'
import './TasksScreen.css'

type TasksView = 'list' | 'matrix'

export function TasksScreen() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const uid = user?.uid ?? null

  const { projects, addProject, updateProject, deleteProject } = useProjects(uid)
  const [selectedId, setSelectedId] = useState('all')
  const { tasks, addTask, toggleComplete, deleteTask } = useTasks(uid, selectedId)
  const [showModal, setShowModal] = useState(false)
  const [view, setView] = useState<TasksView>('list')

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

  return (
    <div className="tasks-screen">
      <div className="tasks-screen__topbar">
        <h1 className="tasks-screen__title">{t('nav.tasks')}</h1>
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
