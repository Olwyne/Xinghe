import { useState, useEffect, useCallback } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  type User,
} from 'firebase/auth'
import { auth, isFirebaseConfigured } from '@/config/firebase'

type AuthError =
  | 'invalidEmail'
  | 'wrongPassword'
  | 'emailInUse'
  | 'weakPassword'
  | 'tooManyRequests'
  | 'userNotFound'
  | 'notConfigured'
  | 'generic'

function mapFirebaseError(code: string): AuthError {
  switch (code) {
    case 'auth/invalid-email':
      return 'invalidEmail'
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'wrongPassword'
    case 'auth/email-already-in-use':
      return 'emailInUse'
    case 'auth/weak-password':
      return 'weakPassword'
    case 'auth/too-many-requests':
      return 'tooManyRequests'
    case 'auth/user-not-found':
      return 'userNotFound'
    default:
      return 'generic'
  }
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(isFirebaseConfigured)
  const [error, setError] = useState<AuthError | null>(
    isFirebaseConfigured ? null : 'notConfigured',
  )

  useEffect(() => {
    if (!auth) return
    return onAuthStateChanged(auth, (u) => {
      setUser(u)
      setLoading(false)
    })
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    if (!auth) return
    setError(null)
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (e: unknown) {
      const code = (e as { code?: string }).code ?? ''
      setError(mapFirebaseError(code))
      throw e
    }
  }, [])

  const register = useCallback(async (email: string, password: string) => {
    if (!auth) return
    setError(null)
    try {
      await createUserWithEmailAndPassword(auth, email, password)
    } catch (e: unknown) {
      const code = (e as { code?: string }).code ?? ''
      setError(mapFirebaseError(code))
      throw e
    }
  }, [])

  const logout = useCallback(async () => {
    if (!auth) return
    await signOut(auth)
  }, [])

  const resetPassword = useCallback(async (email: string) => {
    if (!auth) return
    setError(null)
    try {
      await sendPasswordResetEmail(auth, email)
    } catch (e: unknown) {
      const code = (e as { code?: string }).code ?? ''
      setError(mapFirebaseError(code))
      throw e
    }
  }, [])

  const clearError = useCallback(() => setError(null), [])

  return { user, loading, error, login, register, logout, resetPassword, clearError }
}
