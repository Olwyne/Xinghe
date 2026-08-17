import type { ReactNode } from 'react'
import { BottomNav, type NavTab } from './BottomNav'
import { Sidebar, type DesktopTab } from './Sidebar'
import { StarField } from './StarField'
import { ConnectivityIndicator } from './ConnectivityIndicator'
import './Layout.css'

interface LayoutProps {
  children: ReactNode
  activeTab: NavTab
  onNavigate: (tab: NavTab) => void
  desktopTab: DesktopTab
  onDesktopNavigate: (tab: DesktopTab) => void
  accentColor: string
  isDesktop: boolean
}

export function Layout({
  children,
  activeTab,
  onNavigate,
  desktopTab,
  onDesktopNavigate,
  accentColor,
  isDesktop,
}: LayoutProps) {
  if (isDesktop) {
    return (
      <div className="layout layout--desktop">
        <StarField />
        <div className="layout__nebula layout__nebula--pink" />
        <div className="layout__nebula layout__nebula--teal" />
        <div className="layout__desktop-frame">
          <Sidebar active={desktopTab} onNavigate={onDesktopNavigate} />
          <main className="layout__main">{children}</main>
        </div>
      </div>
    )
  }

  return (
    <div className="layout layout--mobile">
      <StarField />
      <div className="layout__nebula layout__nebula--pink" />
      <div className="layout__nebula layout__nebula--teal" />
      <div className="layout__mobile-header">
        <ConnectivityIndicator />
      </div>
      <main className="layout__content">{children}</main>
      <BottomNav active={activeTab} onNavigate={onNavigate} accentColor={accentColor} />
    </div>
  )
}
