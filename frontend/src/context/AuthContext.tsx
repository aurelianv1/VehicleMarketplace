import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { authApi } from '../api/auth'
import type { RegisterPayload } from '../api/auth'
import { refreshSession, setAccessToken, setSessionExpiredHandler } from '../api/client'
import type { TokenPair, User } from '../types'

type AuthContextValue = {
  user: User | null
  /** true cât timp verificăm la pornire dacă există o sesiune (cookie de refresh) */
  initializing: boolean
  login: (email: string, password: string) => Promise<void>
  register: (payload: RegisterPayload) => Promise<void>
  logout: () => Promise<void>
  setUser: (user: User) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null)
  const [initializing, setInitializing] = useState(true)

  // La pornire, tokenul din memorie nu mai există, dar cookie-ul de refresh da.
  // Dacă refresh-ul reușește, utilizatorul rămâne logat după F5.
  useEffect(() => {
    let cancelled = false
    refreshSession().then((pair) => {
      if (cancelled) return
      setUserState(pair?.user ?? null)
      setInitializing(false)
    })

    setSessionExpiredHandler(() => setUserState(null))
    return () => {
      cancelled = true
      setSessionExpiredHandler(null)
    }
  }, [])

  const startSession = useCallback((pair: TokenPair) => {
    setAccessToken(pair.access_token)
    setUserState(pair.user)
  }, [])

  const login = useCallback(
    async (email: string, password: string) => startSession(await authApi.login(email, password)),
    [startSession],
  )

  const register = useCallback(
    async (payload: RegisterPayload) => startSession(await authApi.register(payload)),
    [startSession],
  )

  const logout = useCallback(async () => {
    try {
      await authApi.logout() // șterge cookie-ul de refresh pe server
    } finally {
      setAccessToken(null)
      setUserState(null)
    }
  }, [])

  const value = useMemo(
    () => ({ user, initializing, login, register, logout, setUser: setUserState }),
    [user, initializing, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth trebuie folosit în interiorul <AuthProvider>')
  return ctx
}
