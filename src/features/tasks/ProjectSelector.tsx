import { useTranslation } from 'react-i18next'
import type { Project } from './types'
import './ProjectSelector.css'

interface ProjectSelectorProps {
  projects: Project[]
  selected: string
  onSelect: (id: string) => void
  onManage: () => void
}

export function ProjectSelector({ projects, selected, onSelect, onManage }: ProjectSelectorProps) {
  const { t } = useTranslation()

  return (
    <div className="project-selector">
      <div className="project-selector__pills">
        <button
          className={`project-selector__pill ${selected === 'all' ? 'project-selector__pill--active' : ''}`}
          onClick={() => onSelect('all')}
        >
          {t('projects.all')}
        </button>
        {projects.map((p) => (
          <button
            key={p.id}
            className={`project-selector__pill ${selected === p.id ? 'project-selector__pill--active' : ''}`}
            onClick={() => onSelect(p.id)}
          >
            <span
              className="project-selector__dot"
              style={{ background: p.color }}
            />
            {p.icon ? `${p.icon} ${p.name}` : p.name}
          </button>
        ))}
      </div>
      <button
        className="project-selector__manage"
        onClick={onManage}
        aria-label={t('projects.manage')}
      >
        ⚙
      </button>
    </div>
  )
}
