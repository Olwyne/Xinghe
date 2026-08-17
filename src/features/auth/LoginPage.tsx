import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import { isFirebaseConfigured } from '@/config/firebase'
import './LoginPage.css'

export function LoginPage() {
  const { t } = useTranslation()
  const { login, register, resetPassword, error, clearError } = useAuth()
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLocalError(null)
    clearError()
    setSubmitting(true)

    try {
      if (mode === 'login') {
        await login(email, password)
      } else if (mode === 'register') {
        if (password !== confirmPassword) {
          setLocalError('passwordMismatch')
          setSubmitting(false)
          return
        }
        await register(email, password)
      } else {
        await resetPassword(email)
        setResetSent(true)
      }
    } catch {
      // error already set in useAuth
    } finally {
      setSubmitting(false)
    }
  }

  function switchMode(newMode: 'login' | 'register' | 'reset') {
    setMode(newMode)
    clearError()
    setLocalError(null)
    setResetSent(false)
  }

  const displayError = localError ?? error

  return (
    <div className="login-page">
      <div className="login-nebula login-nebula--pink" />
      <div className="login-nebula login-nebula--teal" />

      <div className="login-card">
        <div className="login-logo">Xinghe</div>
        <div className="login-subtitle">星河</div>

        <form className="login-form" onSubmit={handleSubmit}>
          <input
            type="email"
            className="login-input"
            placeholder={t('auth.email')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />

          {mode !== 'reset' && (
            <input
              type="password"
              className="login-input"
              placeholder={t('auth.password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              required
              minLength={6}
            />
          )}

          {mode === 'register' && (
            <input
              type="password"
              className="login-input"
              placeholder={t('auth.confirmPassword')}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={6}
            />
          )}

          {displayError && (
            <div className="login-error">
              {t(`auth.error.${displayError}`)}
            </div>
          )}

          {resetSent && (
            <div className="login-success">
              {t('auth.resetSent', { email })}
            </div>
          )}

          <button
            type="submit"
            className="login-button"
            disabled={submitting || !isFirebaseConfigured}
          >
            {mode === 'login'
              ? t('auth.login')
              : mode === 'register'
                ? t('auth.register')
                : t('auth.resetPassword')}
          </button>
        </form>

        <div className="login-links">
          {mode === 'login' && (
            <>
              <button className="login-link" onClick={() => switchMode('reset')}>
                {t('auth.forgotPassword')}
              </button>
              <button className="login-link" onClick={() => switchMode('register')}>
                {t('auth.noAccount')}
              </button>
            </>
          )}
          {mode === 'register' && (
            <button className="login-link" onClick={() => switchMode('login')}>
              {t('auth.hasAccount')}
            </button>
          )}
          {mode === 'reset' && (
            <button className="login-link" onClick={() => switchMode('login')}>
              {t('auth.hasAccount')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
