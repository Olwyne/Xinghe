import { useState } from 'react'
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
              projectColor={accentColor}
              onToggle={toggleComplete}
              onDelete={deleteTask}
            />
          </div>

          <AddTaskInput
            onAdd={(title) => {
              const pid = selectedId === 'all'
                ? (projects.find((p) => p.isInbox)?.id ?? projects[0]?.id ?? '')
                : selectedId
              addTask(title, pid)
            }}
            accentColor={accentColor}
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
