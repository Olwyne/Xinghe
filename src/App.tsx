import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AuthGuard } from '@/features/auth/AuthGuard'
import { Layout } from '@/components/Layout'
import type { NavTab } from '@/components/BottomNav'
import type { DesktopTab } from '@/components/Sidebar'
import { useAuth } from '@/hooks/useAuth'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { TimerScreen } from '@/features/timer/TimerScreen'
import { TasksScreen } from '@/features/tasks/TasksScreen'
import { MatrixScreen } from '@/features/matrix/MatrixScreen'
import { HabitsScreen } from '@/features/habits/HabitsScreen'

function PlaceholderScreen({ title }: { title: string }) {
  return (
    <div style={{ padding: '28px 24px' }}>
      <div
        style={{
          fontFamily: 'var(--xh-font-display)',
          fontSize: 'var(--xh-text-2xl)',
          color: 'var(--xh-text)',
          marginBottom: 18,
        }}
      >
        {title}
      </div>
      <div
        style={{
          color: 'var(--xh-text-faint)',
          fontSize: 'var(--xh-text-md)',
        }}
      >
        À venir au prochain jalon.
      </div>
    </div>
  )
}

function SettingsScreen({ isDesktop }: { isDesktop: boolean }) {
  const { t } = useTranslation()
  const { logout } = useAuth()
  return (
    <div style={{ padding: '28px 24px' }}>
      <div
        style={{
          fontFamily: 'var(--xh-font-display)',
          fontSize: 'var(--xh-text-2xl)',
          color: 'var(--xh-text)',
          marginBottom: 18,
        }}
      >
        {isDesktop ? 'Réglages' : t('nav.profile')}
      </div>
      <button
        onClick={logout}
        style={{
          padding: '10px 20px',
          borderRadius: 'var(--xh-r-lg)',
          border: '1px solid var(--xh-card-border)',
          background: 'transparent',
          color: 'var(--xh-text-sub)',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        {t('auth.logout')}
      </button>
    </div>
  )
}

function AppShell() {
  const { t } = useTranslation()
  const desktop = useIsDesktop()
  const [mobileTab, setMobileTab] = useState<NavTab>('timer')
  const [desktopTab, setDesktopTab] = useState<DesktopTab>('timer')

  const accentColor = 'var(--xh-focus)'
  const tab = desktop ? desktopTab : mobileTab

  return (
    <Layout
      activeTab={mobileTab}
      onNavigate={setMobileTab}
      desktopTab={desktopTab}
      onDesktopNavigate={setDesktopTab}
      accentColor={accentColor}
      isDesktop={desktop}
    >
      {tab === 'timer' && <TimerScreen isDesktop={desktop} />}
      {tab === 'tasks' && <TasksScreen />}
      {tab === 'matrix' && <MatrixScreen />}
      {tab === 'goals' && <HabitsScreen />}
      {tab === 'stats' && <PlaceholderScreen title={t('nav.stats')} />}
      {(tab === 'profile' || tab === 'settings') && <SettingsScreen isDesktop={desktop} />}
    </Layout>
  )
}

export default function App() {
  return (
    <AuthGuard>
      <AppShell />
    </AuthGuard>
  )
}
