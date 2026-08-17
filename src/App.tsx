import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AuthGuard } from '@/features/auth/AuthGuard'
import { Layout } from '@/components/Layout'
import type { NavTab } from '@/components/BottomNav'
import type { DesktopTab } from '@/components/Sidebar'
import { useAuth } from '@/hooks/useAuth'
import { useIsDesktop } from '@/hooks/useMediaQuery'

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

function AppShell() {
  const { t } = useTranslation()
  const { logout } = useAuth()
  const desktop = useIsDesktop()
  const [mobileTab, setMobileTab] = useState<NavTab>('timer')
  const [desktopTab, setDesktopTab] = useState<DesktopTab>('timer')

  const accentColor = 'var(--xh-focus)'

  function renderScreen() {
    const tab = desktop ? desktopTab : mobileTab

    switch (tab) {
      case 'timer':
        return <PlaceholderScreen title={t('nav.timer')} />
      case 'tasks':
        return <PlaceholderScreen title={t('nav.tasks')} />
      case 'matrix':
        return <PlaceholderScreen title="Matrice" />
      case 'goals':
        return <PlaceholderScreen title={t('nav.goals')} />
      case 'stats':
        return <PlaceholderScreen title={t('nav.stats')} />
      case 'profile':
      case 'settings':
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
              {desktop ? 'Réglages' : t('nav.profile')}
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
  }

  return (
    <Layout
      activeTab={mobileTab}
      onNavigate={setMobileTab}
      desktopTab={desktopTab}
      onDesktopNavigate={setDesktopTab}
      accentColor={accentColor}
      isDesktop={desktop}
    >
      {renderScreen()}
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
