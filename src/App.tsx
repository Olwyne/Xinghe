import { useState } from 'react'
import { AuthGuard } from '@/features/auth/AuthGuard'
import { Layout } from '@/components/Layout'
import type { NavTab } from '@/components/BottomNav'
import type { DesktopTab } from '@/components/Sidebar'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { TimerScreen } from '@/features/timer/TimerScreen'
import { TasksScreen } from '@/features/tasks/TasksScreen'
import { MatrixScreen } from '@/features/matrix/MatrixScreen'
import { HabitsScreen } from '@/features/habits/HabitsScreen'
import { StatsScreen } from '@/features/stats/StatsScreen'
import { SettingsScreen } from '@/features/settings/SettingsScreen'

function AppShell() {
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
      <div key={tab} style={{ display: 'flex', flexDirection: 'column', height: '100%', animation: 'xh-fade-in 0.22s ease both' }}>
        {tab === 'timer' && <TimerScreen isDesktop={desktop} />}
        {tab === 'tasks' && <TasksScreen />}
        {tab === 'matrix' && <MatrixScreen />}
        {tab === 'goals' && <HabitsScreen />}
        {tab === 'stats' && <StatsScreen />}
        {(tab === 'profile' || tab === 'settings') && <SettingsScreen isDesktop={desktop} />}
      </div>
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
