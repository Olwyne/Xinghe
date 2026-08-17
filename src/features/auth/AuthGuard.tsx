import type { ReactNode } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { isFirebaseConfigured } from '@/config/firebase'
import { LoginPage } from './LoginPage'

export function AuthGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()

  if (!isFirebaseConfigured && import.meta.env.DEV) {
    return <>{children}</>
  }

  if (loading) {
    return (
      <div className="auth-loading">
        <div className="auth-loading__logo">Xinghe</div>
      </div>
    )
  }

  if (!user) {
    return <LoginPage />
  }

  return <>{children}</>
}
