import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import { useProjects } from '@/hooks/useProjects'
import { useTasks } from '@/hooks/useTasks'
import { ProjectSelector } from './ProjectSelector'
import { ProjectModal } from './ProjectModal'
import { TaskList } from './TaskList'
import { AddTaskInput } from './AddTaskInput'
import './TasksScreen.css'

export function TasksScreen() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const uid = user?.uid ?? null

  const { projects, addProject, updateProject, deleteProject } = useProjects(uid)
  const [selectedId, setSelectedId] = useState('all')
  const { tasks, addTask, toggleComplete, deleteTask } = useTasks(uid, selectedId)
  const [showModal, setShowModal] = useState(false)

  const selectedProject = projects.find((p) => p.id === selectedId)
  const accentColor = selectedProject?.color ?? 'var(--xh-focus)'

  return (
    <div className="tasks-screen">
      <h1 className="tasks-screen__title">{t('nav.tasks')}</h1>

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
