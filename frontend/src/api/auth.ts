import type { TokenPair, User } from '../types'
import { api } from './client'

export type RegisterPayload = {
  email: string
  password: string
  full_name: string
  phone?: string | null
}

export const authApi = {
  login: (email: string, password: string) =>
    api<TokenPair>('/auth/login', { method: 'POST', body: { email, password } }),

  register: (payload: RegisterPayload) =>
    api<TokenPair>('/auth/register', { method: 'POST', body: payload }),

  logout: () => api<void>('/auth/logout', { method: 'POST' }),

  me: () => api<User>('/users/me'),

  updateMe: (payload: { full_name?: string; phone?: string | null }) =>
    api<User>('/users/me', { method: 'PATCH', body: payload }),
}
