import { useTranslation } from 'react-i18next'
import './BottomNav.css'

export type NavTab = 'timer' | 'tasks' | 'goals' | 'stats' | 'profile'

interface BottomNavProps {
  active: NavTab
  onNavigate: (tab: NavTab) => void
  accentColor: string
}

const TABS: NavTab[] = ['timer', 'tasks', 'goals', 'stats', 'profile']

export function BottomNav({ active, onNavigate, accentColor }: BottomNavProps) {
  const { t } = useTranslation()

  return (
    <nav className="bottom-nav" role="tablist">
      {TABS.map((tab) => {
        const isActive = active === tab
        return (
          <button
            key={tab}
            className="bottom-nav__item"
            role="tab"
            aria-selected={isActive}
            onClick={() => onNavigate(tab)}
          >
            <span
              className="bottom-nav__dot"
              style={{
                background: isActive ? accentColor : 'rgba(243,239,251,0.3)',
                boxShadow: isActive ? `0 0 8px ${accentColor}` : 'none',
              }}
            />
            <span
              className="bottom-nav__label"
              style={{ color: isActive ? 'var(--xh-text)' : 'var(--xh-text-faint)' }}
            >
              {t(`nav.${tab}`)}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
