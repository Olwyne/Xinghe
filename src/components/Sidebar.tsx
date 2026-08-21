import { useTranslation } from 'react-i18next'
import { ConnectivityIndicator } from './ConnectivityIndicator'
import './Sidebar.css'

export type DesktopTab = 'timer' | 'tasks' | 'matrix' | 'day' | 'goals' | 'stats' | 'settings'

interface SidebarProps {
  active: DesktopTab
  onNavigate: (tab: DesktopTab) => void
}

const NAV_ITEMS: { key: DesktopTab; labelKey: string }[] = [
  { key: 'timer', labelKey: 'nav.timer' },
  { key: 'tasks', labelKey: 'nav.tasks' },
  { key: 'matrix', labelKey: 'matrix' },
  { key: 'day', labelKey: 'calendar.day' },
  { key: 'goals', labelKey: 'nav.goals' },
  { key: 'stats', labelKey: 'nav.stats' },
  { key: 'settings', labelKey: 'settings' },
]

export function Sidebar({ active, onNavigate }: SidebarProps) {
  const { t } = useTranslation()

  return (
    <aside className="sidebar">
      <div className="sidebar__logo">Xinghe</div>

      <nav className="sidebar__nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            className={`sidebar__link ${active === item.key ? 'sidebar__link--active' : ''}`}
            onClick={() => onNavigate(item.key)}
          >
            {item.labelKey.includes('.') ? t(item.labelKey) : t(`nav.${item.labelKey}`, item.labelKey.charAt(0).toUpperCase() + item.labelKey.slice(1))}
          </button>
        ))}
      </nav>

      <div className="sidebar__bottom">
        <ConnectivityIndicator />
      </div>
    </aside>
  )
}
